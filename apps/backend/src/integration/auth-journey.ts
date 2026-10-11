import assert from "node:assert/strict";

assert.ok(
  process.env.NODE_ENV === "test",
  "Run the journey through bun run test:auth"
);
assert.ok(
  process.env.DATABASE_URL,
  "The runner must provide a disposable DATABASE_URL"
);
assert.ok(
  /^\/cc_auth_[a-f\d]{32}$/u.test(new URL(process.env.DATABASE_URL).pathname),
  "The journey requires a disposable auth database"
);

const { db } = await import("../auth");
const { env } = await import("../env");
const { default: server } = await import("../index");

const identity = {
  email: `auth-${crypto.randomUUID()}@example.test`,
  name: "Auth integration user",
  password: `Integration-${crypto.randomUUID()}`,
};

async function request(path: string, cookie?: string, body?: unknown) {
  const headers = new Headers({ Origin: env.WEB_ORIGIN });
  if (cookie) {
    headers.set("Cookie", cookie);
  }
  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  const response = await server.fetch(
    new Request(`${env.BETTER_AUTH_URL}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
  assert.ok(
    response.headers.get("Access-Control-Allow-Origin") === env.WEB_ORIGIN,
    "CORS must allow the configured web origin"
  );
  assert.ok(
    response.headers.get("Access-Control-Allow-Credentials") === "true",
    "CORS must allow credentials"
  );
  if (path === "/api/me") {
    assert.ok(
      response.headers.get("Cache-Control") === "no-store",
      "Identity responses must not be cached"
    );
  }
  return response;
}

function sessionCookie(response: Response, expired = false) {
  const cookies = response.headers
    .getSetCookie()
    .map((header) => Bun.Cookie.parse(header));
  const cookie = cookies.find(
    (entry) => entry?.name === "__Secure-better-auth.session_token"
  );
  assert.ok(cookie, "Response must issue the secure session cookie");
  assert.ok(cookie.secure, "Session cookie must be Secure");
  assert.ok(cookie.httpOnly, "Session cookie must be HttpOnly");
  assert.ok(cookie.path === "/", "Session cookie must cover the API path");
  if (expired) {
    assert.ok(
      cookie.maxAge === 0 ||
        (cookie.expires !== undefined &&
          cookie.expires.getTime() <= Date.now()),
      "Signout must expire the cookie"
    );
  } else {
    assert.ok(cookie.value.length > 0, "Session cookie must have a value");
    assert.ok(
      cookie.maxAge !== undefined && cookie.maxAge > 0,
      "Session cookie must have a positive lifetime"
    );
  }
  return `${cookie.name}=${cookie.value}`;
}

async function authenticated(cookie: string, userId: string) {
  const response = await request("/api/me", cookie);
  assert.ok(
    response.status === 200,
    "Session cookie must authenticate /api/me"
  );
  const body = await response.json();
  assert.ok(
    body.user.id === userId &&
      body.user.email === identity.email &&
      body.user.name === identity.name,
    "Authenticated identity must match the persisted signup user exactly"
  );
}

async function signout(cookie: string, userId: string) {
  const response = await request("/api/auth/sign-out", cookie, {});
  assert.ok(response.status === 200, "Signout must succeed");
  sessionCookie(response, true);
  assert.ok(
    (await db.session.count({ where: { userId } })) === 0,
    "Signout must delete persisted sessions"
  );
  const replay = await request("/api/me", cookie);
  assert.ok(
    replay.status === 401,
    "Replaying the saved cookie after signout must be denied"
  );
  const body = await replay.json();
  assert.ok(
    body.error === "Unauthorized",
    "Cookie replay must return Unauthorized"
  );
}

try {
  const anonymous = await request("/api/me");
  assert.ok(anonymous.status === 401, "Anonymous access must be denied");
  const signup = await request("/api/auth/sign-up/email", undefined, identity);
  assert.ok(signup.status === 200, "Signup must succeed");
  const signupCookie = sessionCookie(signup);
  const user = await db.user.findUnique({
    where: { email: identity.email },
    include: { accounts: true },
  });
  assert.ok(
    user && user.name === identity.name && user.email === identity.email,
    "Signup must persist the exact user identity"
  );
  const account = user.accounts.find(
    (entry) => entry.providerId === "credential"
  );
  assert.ok(
    account && account.userId === user.id && account.accountId === user.id,
    "Signup must persist a credential account for the user"
  );
  assert.ok(
    account.password &&
      account.password !== identity.password &&
      !account.password.includes(identity.password),
    "Credential password must be a nonplaintext hash"
  );
  assert.ok(
    (await db.session.count({ where: { userId: user.id } })) === 1,
    "Signup must persist one session"
  );
  await authenticated(signupCookie, user.id);
  await signout(signupCookie, user.id);

  const wrong = await request("/api/auth/sign-in/email", undefined, {
    email: identity.email,
    password: "Wrong-password-123",
  });
  assert.ok(wrong.status === 401, "Wrong password must be denied");
  assert.ok(
    !wrong.headers
      .getSetCookie()
      .some(
        (header) =>
          Bun.Cookie.parse(header)?.name ===
          "__Secure-better-auth.session_token"
      ),
    "Wrong password must not issue a session cookie"
  );
  assert.ok(
    (await db.session.count({ where: { userId: user.id } })) === 0,
    "Wrong password must not create a session"
  );

  const signin = await request("/api/auth/sign-in/email", undefined, {
    email: identity.email,
    password: identity.password,
  });
  assert.ok(signin.status === 200, "Correct password must sign in");
  const signinCookie = sessionCookie(signin);
  assert.ok(
    signinCookie !== signupCookie,
    "Fresh signin must issue a new cookie"
  );
  assert.ok(
    (await db.session.count({ where: { userId: user.id } })) === 1,
    "Signin must persist one fresh session"
  );
  await authenticated(signinCookie, user.id);
  await signout(signinCookie, user.id);
} finally {
  await db.$disconnect();
}
