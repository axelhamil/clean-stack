import { createFileRoute, notFound } from "@tanstack/react-router";

export const Route = createFileRoute("/_staff/$section")({
  beforeLoad: () => {
    throw notFound();
  },
});
