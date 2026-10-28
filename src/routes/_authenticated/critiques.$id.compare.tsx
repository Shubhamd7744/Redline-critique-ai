import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getCritique, listCritiques } from "@/lib/critique.functions";
import { RubricPanel, sanitizeAltTitle } from "@/components/critique-view";
import { PRINCIPLE_LABELS, type RubricScores } from "@/lib/critique-types";

export const Route = createFileRoute("/_authenticated/critiques/$id/compare")({
  head: () => ({ meta: [{ title: "Compare — Redline Critique" }, { name: "robots", content: "noindex" }] }),
  component: ComparePage,
});

function ComparePage() {
  const { id } = Route.useParams();
  const getFn = useServerFn(getCritique);
  const listFn = useServerFn(listCritiques);
  const [otherId, setOtherId] = useState<string | null>(null);

  const a = useQuery({ queryKey: ["critique", id], queryFn: () => getFn({ data: { id } }) });
  const b = useQuery({
    queryKey: ["critique", otherId],
    queryFn: () => getFn({ data: { id: otherId! } }),
    enabled: !!otherId,
  });
  const list = useQuery({ queryKey: ["critiques"], queryFn: () => listFn() });

  const candidates = list.data?.filter((c) => c.id !== id && c.status === "complete") ?? [];

  return (
    <main className="max-w-7xl mx-auto px-6 py-12">
      <Link
        to="/critiques/$id"
        params={{ id }}
        className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-primary mb-4 inline-block"
      >
        ← Back to critique
      </Link>
      <div className="flex items-end justify-between border-b border-border pb-6 mb-12">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-primary mb-2">Compare</p>
          <h1 className="font-serif italic text-5xl">Side by side.</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-md">
            Put two critiques next to each other to see what changed across the rubric.
          </p>
        </div>
        <select
          value={otherId ?? ""}
          onChange={(e) => setOtherId(e.target.value || null)}
          className="border border-border rounded-sm px-3 py-2 text-sm bg-white"
        >
          <option value="">Choose iteration…</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </div>

      {a.data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 relative">
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border -translate-x-1/2 hidden md:block" />

          <Panel label="A · Current" score={Number(a.data.overall_score ?? 0)} imageUrl={a.data.image_url} title={a.data.title} rubric={a.data.rubric as unknown as RubricScores | null} />

          {b.data ? (
            <Panel
              label={`B · ${b.data.title}`}
              score={Number(b.data.overall_score ?? 0)}
              imageUrl={b.data.image_url}
              title={b.data.title}
              rubric={b.data.rubric as unknown as RubricScores | null}
              deltaAgainst={a.data.rubric as unknown as RubricScores | null}
              overallDelta={Number(b.data.overall_score ?? 0) - Number(a.data.overall_score ?? 0)}
            />
          ) : (
            <div className="border border-dashed border-border rounded-sm p-12 flex items-center justify-center text-sm text-muted-foreground min-h-[400px]">
              Choose an iteration from the dropdown above.
            </div>
          )}
        </div>
      )}
    </main>
  );
}

function Panel({
  label,
  score,
  imageUrl,
  title,
  rubric,
  deltaAgainst,
  overallDelta,
}: {
  label: string;
  score: number;
  imageUrl: string | null;
  title: string;
  rubric: RubricScores | null;
  deltaAgainst?: RubricScores | null;
  overallDelta?: number;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-[11px] font-mono uppercase text-muted-foreground border-b border-border pb-2">
        <span>{label}</span>
        <span>
          Score: <span className="text-foreground font-medium">{score.toFixed(1)}</span>
          {overallDelta != null && overallDelta !== 0 && (
            <span className={`ml-2 ${overallDelta > 0 ? "text-emerald-600" : "text-primary"}`}>
              {overallDelta > 0 ? "+" : ""}
              {overallDelta.toFixed(1)}
            </span>
          )}
        </span>
      </div>
      {imageUrl ? (
        <div className="border border-border bg-white p-2">
          <img src={imageUrl} alt={`Design mockup: ${sanitizeAltTitle(title)}`} className="w-full h-auto" />
        </div>
      ) : (
        <div className="aspect-video bg-stone-panel border border-border" />
      )}
      {rubric && (
        <div className="space-y-2">
          {(Object.keys(PRINCIPLE_LABELS) as (keyof RubricScores)[]).map((k) => {
            const v = rubric[k];
            const delta = deltaAgainst ? v - deltaAgainst[k] : null;
            return (
              <div key={k} className="flex items-baseline justify-between text-sm border-b border-border pb-1">
                <span>{PRINCIPLE_LABELS[k]}</span>
                <span className="font-mono">
                  {v.toFixed(1)}
                  {delta != null && delta !== 0 && (
                    <span className={`ml-2 text-[11px] ${delta > 0 ? "text-emerald-600" : "text-primary"}`}>
                      {delta > 0 ? "+" : ""}
                      {delta.toFixed(1)}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
