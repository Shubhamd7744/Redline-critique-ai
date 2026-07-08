import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { getCritique, updateShareSettings, deleteCritique } from "@/lib/critique.functions";
import { ResultsView, AnalyzingState } from "@/components/critique-view";
import type { CritiquePayload } from "@/lib/critique-types";
import { downloadCritiquePdf } from "@/lib/critique-pdf";



export const Route = createFileRoute("/_authenticated/critiques/$id")({
  head: () => ({ meta: [{ title: "Critique — Redline" }, { name: "robots", content: "noindex" }] }),
  component: CritiquePage,
});

function CritiquePage() {
  const { id } = Route.useParams();
  const fn = useServerFn(getCritique);
  const updateFn = useServerFn(updateShareSettings);
  const deleteFn = useServerFn(deleteCritique);
  const [shareOpen, setShareOpen] = useState(false);

  const q = useQuery({
    queryKey: ["critique", id],
    queryFn: () => fn({ data: { id } }),
    refetchInterval: (query) => {
      const d = query.state.data;
      return d && d.status === "analyzing" ? 2000 : false;
    },
  });

  async function handleDelete() {
    if (!confirm("Delete this critique? This cannot be undone.")) return;
    try {
      await deleteFn({ data: { id } });
      window.location.href = "/dashboard";
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  if (q.isLoading) {
    return (
      <main className="max-w-7xl mx-auto px-6 py-12">
        <AnalyzingState />
      </main>
    );
  }
  if (q.error || !q.data) {
    return (
      <main className="max-w-7xl mx-auto px-6 py-12">
        <p className="text-sm text-muted-foreground">Not found.</p>
      </main>
    );
  }

  const c = q.data;

  return (
    <main className="max-w-7xl mx-auto px-6 py-12">
      <div className="flex items-end justify-between border-b border-border pb-6 mb-12 gap-4">
        <div className="min-w-0">
          <Link
            to="/dashboard"
            className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-primary mb-2 inline-block"
          >
            ← Archive
          </Link>
          <h1 className="font-serif italic text-4xl truncate">{c.title}</h1>
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground mt-2">
            {new Date(c.created_at).toLocaleString()}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={async () => {
              if (c.status !== "complete" || !c.image_url || !c.rubric || !c.issues) return;
              try {
                await downloadCritiquePdf({
                  payload: {
                    rubric: c.rubric as unknown as CritiquePayload["rubric"],
                    issues: c.issues as unknown as CritiquePayload["issues"],
                    summary: c.summary ?? "",
                    overall_score: Number(c.overall_score ?? 0),
                  },
                  imageUrl: c.image_url,
                  title: c.title,
                  createdAt: c.created_at,
                });
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "PDF export failed");
              }
            }}
            disabled={c.status !== "complete"}
            className="px-3 py-2 border border-border rounded-sm text-sm font-medium hover:bg-primary hover:text-white hover:border-primary disabled:opacity-50"
          >
            Download PDF
          </button>
          <button
            onClick={() => setShareOpen(true)}
            disabled={c.status !== "complete"}
            className="px-3 py-2 border border-border rounded-sm text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            {c.is_public ? "Sharing…" : "Share"}
          </button>
          <button
            onClick={handleDelete}
            className="px-3 py-2 border border-border rounded-sm text-sm font-medium hover:bg-primary hover:text-white hover:border-primary"
          >
            Delete
          </button>
        </div>
      </div>

      {c.is_public && c.share_slug && (
        <div className="mb-8 p-3 border border-primary/20 bg-primary/5 rounded-sm text-xs font-mono flex items-center justify-between gap-3">
          <span className="flex items-center gap-3 flex-wrap">
            <span>Public link: /c/{c.share_slug}</span>
            {c.has_password && (
              <span className="px-1.5 py-0.5 bg-primary text-white text-[10px] uppercase tracking-widest">
                Password
              </span>
            )}
            {c.share_expires_at && (
              <span className="text-muted-foreground">
                Expires {new Date(c.share_expires_at).toLocaleString()}
              </span>
            )}
          </span>
          <span className="flex gap-3 shrink-0">
            <button
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/c/${c.share_slug}`);
                toast.success("Copied");
              }}
              className="text-primary underline"
            >
              Copy
            </button>
            <button onClick={() => setShareOpen(true)} className="text-primary underline">
              Manage
            </button>
          </span>
        </div>
      )}

      {shareOpen && (
        <ShareSettingsDialog
          critique={{
            id: c.id,
            is_public: c.is_public,
            share_slug: c.share_slug,
            share_expires_at: c.share_expires_at,
            has_password: c.has_password,
          }}
          onClose={() => setShareOpen(false)}
          onChange={() => q.refetch()}
          submit={(payload) => updateFn({ data: payload })}
        />
      )}

      {c.status === "analyzing" && <AnalyzingState />}
      {c.status === "failed" && (
        <div className="p-8 border border-primary/30 bg-primary/5 rounded-sm">
          <p className="font-mono text-[11px] uppercase tracking-widest text-primary mb-2">Analysis failed</p>
          <p className="text-sm text-muted-foreground">{c.error_message ?? "Unknown error"}</p>
        </div>
      )}
      {c.status === "complete" && c.image_url && c.rubric && c.issues && (
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
      )}
    </main>
  );
}
