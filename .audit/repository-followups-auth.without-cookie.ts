import server from "../apps/backend/src/index";

const originalFetch = server.fetch;
server.fetch = (request, ...rest) => {
  const withoutCookie = new Request(request);
  withoutCookie.headers.delete("Cookie");
  return originalFetch(withoutCookie, ...rest);
};
