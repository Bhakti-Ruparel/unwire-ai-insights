/**
 * /projects/:id/chat
 *
 * This route is kept for backwards-compat but the chat UI now lives as
 * a persistent right-side panel (ChatPanel) inside the project shell.
 * Navigating here redirects to the project overview.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/projects/$projectId/chat")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/projects/$projectId", params, replace: true });
  },
  component: () => null,
});
