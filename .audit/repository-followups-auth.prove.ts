import assert from "node:assert/strict";
import { SQL } from "bun";
import { runAuthIntegration } from "../apps/backend/src/integration/auth-integration";

const root = new URL("../", import.meta.url).pathname;
const text = await Bun.file(`${root}packages/db/.env`).text();
const raw = text.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim().replace(/^(["'])(.*)\1$/, "$2");
assert.ok(raw, "Configured worktree DATABASE_URL is required");
const adminUrl = new URL(raw);
adminUrl.pathname = "/postgres";
const admin = new SQL(adminUrl.href, { max: 1, connectionTimeout: 5 });
const receipts: Record<string, unknown> = {};
const env = { PATH: process.env.PATH ?? "" };
const catalog = async () => (await admin`SELECT datname FROM pg_database ORDER BY datname`).map((row: { datname: string }) => row.datname);
const before = await catalog();

async function rootTask(extraEnv: Record<string, string> = {}) {
  const child = Bun.spawn([process.execPath, "--no-env-file", "--no-install", "run", "test:auth"], {
    cwd: root, env: { ...env, ...extraEnv }, stdout: "pipe", stderr: "pipe", timeout: 120_000,
  });
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  return { code, output: `${stdout}\n${stderr}` };
}

try {
  let finished = false;
  const parallel = Promise.all([rootTask(), rootTask()]).finally(() => { finished = true; });
  let overlapping: string[] = [];
  while (!finished) {
    const names = (await catalog()).filter((name: string) => name.startsWith("cc_auth_") && !before.includes(name));
    if (names.length >= 2) overlapping = names;
    await Bun.sleep(10);
  }
  const results = await parallel;
  assert.ok(results.every((result) => result.code === 0), "Both real root authentication tasks must pass");
  assert.ok(overlapping.length === 2, "Both disposable databases must exist concurrently");
  for (const [index, result] of results.entries()) {
    await Bun.write(`${root}.audit/repository-followups-auth.concurrent-${index + 1}.log`, result.output);
  }
  assert.deepEqual(await catalog(), before, "Concurrent runs must restore the original database catalog");
  receipts.concurrent = { databases: overlapping, bothPassed: true, catalogRestored: true };

  let missingCookieFailure: unknown;
  let expectedAssertion = false;
  try {
    await runAuthIntegration(async (child) => {
      const command = child.stage === "migrations" ? child.command : [
        process.execPath, "--no-env-file", "--no-install", "--preload",
        `${root}.audit/repository-followups-auth.without-cookie.ts`,
        "src/integration/auth-journey.ts",
      ];
      const processChild = Bun.spawn(command, { cwd: child.cwd, env: child.env, stdout: "ignore", stderr: "pipe", timeout: 90_000 });
      const [code, output] = await Promise.all([processChild.exited, new Response(processChild.stderr).text()]);
      if (child.stage === "migrations") assert.ok(code === 0, "Cookie mutation migrations must pass");
      else {
        expectedAssertion = code !== 0 && output.includes("Session cookie must authenticate /api/me");
        assert.ok(expectedAssertion, "Missing cookie must fail the authenticated identity assertion");
        throw new Error("Expected missing-cookie assertion failure");
      }
    });
  } catch (error) { missingCookieFailure = error; }
  assert.ok(expectedAssertion && missingCookieFailure instanceof AggregateError, "Cookie mutation must fail for the intended authentication defect");
  assert.deepEqual(await catalog(), before, "Assertion failure must clean its owned database");
  receipts.cookieMutation = { assertion: "Session cookie must authenticate /api/me", observedFailure: true, cleanupConfirmed: true };

  const ready = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let retained = "";
  let failed = "";
  const retainedRun = runAuthIntegration(async (child) => {
    retained = new URL(child.env.DATABASE_URL!).pathname.slice(1);
    ready.resolve();
    await release.promise;
  });
  await ready.promise;
  try {
    let injected: unknown;
    try {
      await runAuthIntegration(async (child) => {
        failed = new URL(child.env.DATABASE_URL!).pathname.slice(1);
        assert.ok(failed !== retained, "Failure run must own another database");
        const command = child.stage === "migrations" ? child.command : [process.execPath, "--no-env-file", "--no-install", "-e", "process.exit(23)"];
        const processChild = Bun.spawn(command, { cwd: child.cwd, env: child.env, stdout: "ignore", stderr: "ignore", timeout: 90_000 });
        const code = await processChild.exited;
        if (child.stage === "migrations") assert.ok(code === 0, "Fault probe migrations must pass");
        else {
          assert.ok(code === 23, "Injected child must exit with the intended failure");
          throw new Error("Injected child exited 23");
        }
      });
    } catch (error) { injected = error; }
    assert.ok(injected instanceof AggregateError, "Runner must preserve the original child failure");
    assert.ok(injected.errors[0].cause.message === "Injected child exited 23", "Original failure cause must survive cleanup");
    const afterFailure = await catalog();
    assert.ok(afterFailure.includes(retained), "Failure cleanup must preserve the other live invocation's database");
    assert.ok(!afterFailure.includes(failed), "Failure cleanup must remove its owned database");
    assert.deepEqual(afterFailure.filter((name: string) => name !== retained), before, "Failure cleanup must preserve every preexisting database");
    receipts.failedChild = { failedDatabase: failed, retainedDatabase: retained, originalFailurePreserved: true, onlyOwnedDatabaseRemoved: true };
  } finally {
    release.resolve();
    await retainedRun;
  }

  const invalid = await rootTask({ AUTH_INTEGRATION_DATABASE_URL: "invalid-prerequisite" });
  assert.ok(invalid.code !== 0, "Invalid prerequisite must fail");
  assert.ok(invalid.output.includes("must be a PostgreSQL URL"), "Invalid prerequisite must report a clear diagnosis");
  assert.ok(!invalid.output.includes("auth integration created"), "Invalid prerequisite must not create a database");
  await Bun.write(`${root}.audit/repository-followups-auth.invalid.log`, invalid.output);
  receipts.invalidPrerequisite = { exitCode: invalid.code, clearError: true, noDatabaseCreated: true };

  const stopped = Bun.spawn([process.execPath, "--no-env-file", "--no-install", "apps/backend/src/integration/auth-integration.ts"], {
    cwd: root, env, stdout: "pipe", stderr: "pipe", timeout: 120_000,
  });
  let stoppedOutput = "";
  let signaled = false;
  for await (const chunk of stopped.stdout) {
    stoppedOutput += new TextDecoder().decode(chunk);
    if (!signaled && stoppedOutput.includes("auth integration created")) {
      stopped.kill("SIGTERM");
      signaled = true;
    }
  }
  const stoppedCode = await stopped.exited;
  stoppedOutput += await new Response(stopped.stderr).text();
  assert.ok(signaled && stoppedCode !== 0, "Interrupted runner must fail");
  assert.ok(stoppedOutput.includes("auth integration dropped") && stoppedOutput.includes("interrupted"), "Interrupted runner must drop its database and report interruption");
  await Bun.write(`${root}.audit/repository-followups-auth.termination.log`, stoppedOutput);
  receipts.termination = { exitCode: stoppedCode, cleanupConfirmed: true };

  assert.deepEqual(await catalog(), before, "All probes must restore the original database catalog");
  receipts.finalCatalogRestored = true;
  await Bun.write(`${root}.audit/repository-followups-auth.receipts.json`, `${JSON.stringify(receipts, null, 2)}\n`);
  console.log("Authentication proof passed. Concurrent journeys, failure isolation, invalid prerequisites, and termination cleanup verified.");
} finally {
  await admin.close();
}
