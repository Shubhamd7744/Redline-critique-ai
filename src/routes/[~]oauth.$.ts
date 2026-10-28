import { createFileRoute } from "@tanstack/react-router";

// Lovable hosting intercepts /~oauth/* at its edge and forwards it to the
// managed OAuth broker. Other hosts (e.g. Vercel) don't, so this route does
// the same forwarding to keep managed Google sign-in working everywhere.
const BROKER = "https://oauth.lovable.app";
const LOVABLE_PROJECT_ID = "lovp_65xaj54vfk9jdajw6dn48qysec";

export const Route = createFileRoute("/~oauth/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const incoming = new URL(request.url);
        const step = (params._splat ?? "").replace(/^\/+/, "");
        if (step !== "initiate" && step !== "callback") {
          return new Response("Not found", { status: 404 });
        }
        const target = new URL(`${BROKER}/${step}`);
        incoming.searchParams.forEach((v, k) => target.searchParams.set(k, v));
        if (step === "initiate" && !target.searchParams.has("project_id")) {
          target.searchParams.set("project_id", LOVABLE_PROJECT_ID);
        }
        return Response.redirect(target.toString(), 302);
      },
    },
  },
});
