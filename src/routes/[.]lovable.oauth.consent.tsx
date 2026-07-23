import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Typed wrapper around the beta supabase.auth.oauth namespace so this route
// doesn't depend on its TS surface being exported.
type OAuthDetails = {
  client?: { name?: string } | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
};
type OAuthResp<T> = { data: T | null; error: { message: string } | null };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const authOAuth = (supabase.auth as any).oauth as {
  getAuthorizationDetails: (id: string) => Promise<OAuthResp<OAuthDetails>>;
  approveAuthorization: (id: string) => Promise<OAuthResp<OAuthDetails>>;
  denyAuthorization: (id: string) => Promise<OAuthResp<OAuthDetails>>;
};

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    const next = location.pathname + location.searchStr;
    if (!data.session) throw redirect({ to: "/auth", search: { next } });
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await authOAuth.getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="min-h-screen flex items-center justify-center px-6 bg-background">
      <div className="max-w-md text-center">
        <p className="font-mono text-[11px] uppercase tracking-widest text-primary mb-3">
          Authorization error
        </p>
        <p className="text-sm text-muted-foreground">
          {String((error as Error)?.message ?? error)}
        </p>
      </div>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await authOAuth.approveAuthorization(authorization_id)
      : await authOAuth.denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  const clientName = details?.client?.name ?? "an app";

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="w-full max-w-md">
        <p className="font-mono text-[11px] uppercase tracking-widest text-primary mb-4">
          Authorize connection
        </p>
        <h1 className="font-serif italic text-4xl mb-4">Connect {clientName}?</h1>
        <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
          {clientName} is requesting access to Redline Critique as you. It will be able to read
          your critiques and projects, and create projects on your behalf, under the same
          permissions as your account.
        </p>
        {error && (
          <p className="text-xs font-mono text-primary mb-4" role="alert">
            {error}
          </p>
        )}
        <div className="flex gap-3">
          <button
            disabled={busy}
            onClick={() => decide(true)}
            className="flex-1 bg-foreground text-background rounded-sm py-3 text-sm font-medium hover:bg-foreground/90 disabled:opacity-50"
          >
            {busy ? "…" : "Approve"}
          </button>
          <button
            disabled={busy}
            onClick={() => decide(false)}
            className="flex-1 border border-border rounded-sm py-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            Deny
          </button>
        </div>
      </div>
    </main>
  );
}
