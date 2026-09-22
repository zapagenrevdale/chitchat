import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/practice")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true, statusCode: 308 });
  },
});
