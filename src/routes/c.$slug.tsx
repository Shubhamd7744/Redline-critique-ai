import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getPublicCritique } from "@/lib/public-critique.functions";
import { ResultsView } from "@/components/critique-view";
import type { CritiquePayload } from "@/lib/critique-types";

export const Route = createFileRoute("/c/$slug")({
  loader: async ({ params }) => {
    try {
      return await getPublicCritique({ data: { slug: params.slug } });
    } catch {
      throw notFound();
    }
  },
  head: ({ loaderData, params }) => {
    const FALLBACK_DESC =
      "A shared AI design critique on Redline Critique — hierarchy, contrast, typography, spacing, and accessibility findings for a UX/UI mockup.";
    if (!loaderData || loaderData.kind !== "ok") {
      return { meta: [{ title: "Shared critique — Redline Critique" }, { name: "robots", content: "noindex" }] };
    }
    const desc =
      loaderData.summary && loaderData.summary.length >= 50
        ? loaderData.summary
        : FALLBACK_DESC;
    const url = `https://redline-critique-ai.lovable.app/c/${params.slug}`;
    return {
      meta: [
        { title: `${loaderData.title} — Redline Critique` },
        { name: "description", content: desc },
        { property: "og:title", content: `${loaderData.title} — Redline Critique` },
        { property: "og:description", content: desc },
        { property: "og:url", content: url },
        { property: "og:type", content: "article" },
        ...(loaderData.image_url ? [{ property: "og:image", content: loaderData.image_url }] : []),
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: loaderData.title,
            description: desc,
            url,
            ...(loaderData.image_url ? { image: loaderData.image_url } : {}),
          }),
        },
      ],
    };
  },
  notFoundComponent: () => <ShellMessage title="Not found" body="This shared critique doesn't exist." />,
  errorComponent: ({ error }) => {
    console.error(error);
    return <ShellMessage title="Something went wrong" body="This shared critique couldn't be loaded. Please try again shortly." />;
  },

  component: PublicCritiquePage,
});

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 bg-background/80 backdrop-blur-md border-b border-border">
        <Link to="/" className="font-serif italic text-2xl tracking-tight">
          Redline Critique
        </Link>
        <div className="flex items-center gap-4">
          <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            Public critique
          </span>
          <Link
            to="/auth"
            className="px-4 py-1.5 bg-foreground text-background text-[13px] font-medium rounded-sm"
          >
            Critique your own
          </Link>
        </div>
      </nav>
      {children}
    </div>
  );
}

function ShellMessage({ title, body }: { title: string; body: string }) {
  return (
    <Shell>
      <main className="max-w-2xl mx-auto px-6 py-24 text-center">
        <p className="font-mono text-[11px] uppercase tracking-widest text-primary mb-3">{title}</p>
        <p className="text-sm text-muted-foreground">{body}</p>
      </main>
    </Shell>
  );
}

function PublicCritiquePage() {
  const initial = Route.useLoaderData();
  const fetchFn = useServerFn(getPublicCritique);
  const [state, setState] = useState(initial);
  const { slug } = Route.useParams();
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    setSubmitting(true);
    try {
      const next = await fetchFn({ data: { slug, password } });
      setState(next);
    } finally {
      setSubmitting(false);
    }
  }

  if (state.kind === "not_found") {
    return <ShellMessage title="Not found" body="This shared critique doesn't exist or was revoked." />;
  }

  if (state.kind === "expired") {
    return (
      <ShellMessage
        title="Link expired"
        body={`This share link expired on ${new Date(state.expires_at).toLocaleString()}. Ask the owner to renew it.`}
      />
    );
  }

  if (state.kind === "locked") {
    return (
      <Shell>
        <main className="max-w-md mx-auto px-6 py-24">
          <p className="font-mono text-[11px] uppercase tracking-widest text-primary mb-2">
            Password protected
          </p>
          <h1 className="font-serif italic text-3xl mb-2">{state.title}</h1>
          <p className="text-sm text-muted-foreground mb-8">
            The owner protected this critique. Enter the password they shared to view it.
          </p>
          <form onSubmit={handleUnlock} className="space-y-3">
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Share password"
              autoComplete="current-password"
              className="w-full border border-border rounded-sm px-3 py-2 text-sm bg-white focus:border-primary outline-none"
            />
            {state.error && (
              <p className="text-xs font-mono text-primary" role="alert">
                {state.error}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting || !password}
              className="w-full px-4 py-2 bg-foreground text-background text-sm rounded-sm hover:bg-foreground/90 disabled:opacity-50"
            >
              {submitting ? "Checking…" : "Unlock"}
            </button>
          </form>
        </main>
      </Shell>
    );
  }

  const c = state;
  if (!c.image_url || !c.rubric || !c.issues) {
    return <ShellMessage title="Not ready" body="This critique is not ready to view yet." />;
  }

  return (
    <Shell>
      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="border-b border-border pb-6 mb-12">
          <p className="font-mono text-[11px] uppercase tracking-widest text-primary mb-2">
            Shared critique
          </p>
          <h1 className="font-serif italic text-5xl">{c.title}</h1>
          {c.share_expires_at && (
            <p className="mt-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              Expires {new Date(c.share_expires_at).toLocaleString()}
            </p>
          )}
        </div>
        <ResultsView
          payload={{
            rubric: c.rubric as unknown as CritiquePayload["rubric"],
            issues: c.issues as unknown as CritiquePayload["issues"],
            summary: c.summary ?? "",
            overall_score: Number(c.overall_score ?? 0),
            perspectives:
              (c.rubric as { perspectives?: CritiquePayload["perspectives"] } | null)
                ?.perspectives ?? undefined,
          }}
          imageUrl={c.image_url}
          title={c.title}
          critiqueId={c.id}
          canEdit={false}
        />

      </main>
    </Shell>
  );
}
