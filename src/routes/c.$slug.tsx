import { createFileRoute, Link, notFound } from "@tanstack/react-router";
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
  head: ({ loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "Critique — Redline" }, { name: "robots", content: "noindex" }] };
    }
    return {
      meta: [
        { title: `${loaderData.title} — Redline critique` },
        { name: "description", content: loaderData.summary ?? "A design critique on Redline." },
        { property: "og:title", content: `${loaderData.title} — Redline critique` },
        { property: "og:description", content: loaderData.summary ?? "A design critique on Redline." },
        { property: "og:type", content: "article" },
        ...(loaderData.image_url ? [{ property: "og:image", content: loaderData.image_url }] : []),
      ],
    };
  },
  component: PublicCritiquePage,
});

function PublicCritiquePage() {
  const c = Route.useLoaderData();
  if (!c.image_url || !c.rubric || !c.issues) {
    return (
      <main className="max-w-7xl mx-auto px-6 py-24 text-center">
        <p className="text-sm text-muted-foreground">This critique is not ready to view.</p>
      </main>
    );
  }
  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 bg-background/80 backdrop-blur-md border-b border-border">
        <Link to="/" className="font-serif italic text-2xl tracking-tight">Redline</Link>
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
      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="border-b border-border pb-6 mb-12">
          <p className="font-mono text-[11px] uppercase tracking-widest text-primary mb-2">
            Shared critique
          </p>
          <h1 className="font-serif italic text-5xl">{c.title}</h1>
        </div>
        <ResultsView
          payload={{
            rubric: c.rubric as unknown as CritiquePayload["rubric"],
            issues: c.issues as unknown as CritiquePayload["issues"],
            summary: c.summary ?? "",
            overall_score: Number(c.overall_score ?? 0),
          }}
          imageUrl={c.image_url}
          title={c.title}
        />
      </main>
    </div>
  );
}
