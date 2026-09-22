import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Link,
  Outlet,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";

import { ChitAvatar } from "@/components/ui/chit-avatar";
import { siteUrl } from "@/lib/env";

import stylesheet from "@/styles.css?url";

if (import.meta.env.DEV && !import.meta.env.SSR) {
  import("react-grab");
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    head: () => ({
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title: "Chitchat — Small talk, a little easier" },
        {
          name: "description",
          content:
            "Build confidence in everyday conversations with small-talk practice.",
        },
        {
          property: "og:title",
          content: "Chitchat — Small talk, a little easier",
        },
        { property: "og:type", content: "website" },
      ],
      links: [{ rel: "stylesheet", href: stylesheet }],
    }),
    component: Root,
    notFoundComponent: () => (
      <main className="mx-auto max-w-5xl p-8">
        <h1>Page not found</h1>
        <Link to="/">Back to Chitchat</Link>
      </main>
    ),
  }
);

function Root() {
  const isHome = useRouterState({
    select: (state) => state.location.pathname === "/",
  });
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <a className="sr-only focus:not-sr-only" href="#main">
          Skip to content
        </a>
        {!isHome && (
          <header className="border-b">
            <nav
              aria-label="Main navigation"
              className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-5"
            >
              <Link to="/" className="flex items-center gap-2 font-semibold">
                <ChitAvatar size={36} label="Chitchat icon" /> Chitchat
              </Link>
              <Link
                to="/"
                className="text-muted-foreground hover:text-foreground text-sm"
              >
                Practice studio
              </Link>
            </nav>
          </header>
        )}
        <Outlet />
        {!isHome && (
          <footer className="text-muted-foreground mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-8 text-sm">
            <span>A little practice goes a long way.</span>
            <a href={siteUrl}>Chitchat</a>
          </footer>
        )}
        <Scripts />
      </body>
    </html>
  );
}
