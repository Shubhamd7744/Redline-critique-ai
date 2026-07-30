import { useEffect, useMemo, useState } from "react";
import {
  PRINCIPLE_LABELS,
  type CritiquePayload,
  type Issue,
  type PerspectiveVerdict,
  type RubricScores,
} from "@/lib/critique-types";
import { DecisionLog } from "@/components/decision-log";
import {
  PRIORITY_SCHEMES,
  PRIORITY_SCHEME_ORDER,
  badgeClass,
  type PriorityScheme,
} from "@/lib/priority-schemes";

export function RubricPanel({ rubric }: { rubric: RubricScores }) {
  // Rubric may include non-scalar metadata mixed in (mode, pillar_scores,
  // detector_errors from the merged detector run). Only display keys whose
  // value coerces to a finite number.
  const entries = (Object.entries(rubric) as [keyof RubricScores, unknown][])
    .filter(([, raw]) => typeof raw === "number" && Number.isFinite(raw))
    .map(([k, raw]) => ({ k, n: raw as number }));
  return (
    <div>
      <h2 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground mb-4">
        Analysis Rubric
      </h2>
      <div className="space-y-3">
        {entries.map(({ k, n }) => (
          <div key={k} className="flex items-end justify-between border-b border-border pb-1">
            <span className="text-sm">{PRINCIPLE_LABELS[k] ?? k}</span>
            <span className={`font-mono text-lg font-medium ${n < 6 ? "text-primary" : ""}`}>
              {n.toFixed(1)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}


export function IssueList({
  issues,
  activeId,
  onSelect,
  scheme = "severity",
}: {
  issues: Issue[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
  scheme?: PriorityScheme;
}) {
  const spec = PRIORITY_SCHEMES[scheme];
  const decorated = useMemo(
    () =>
      issues
        .map((issue, originalIdx) => ({
          issue,
          originalIdx,
          badge: spec.badgeFor(issue),
        }))
        .sort((a, b) => a.badge.rank - b.badge.rank),
    [issues, spec],
  );
  return (
    <div>
      <h2 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground mb-4">
        Issue Log · {spec.label}
      </h2>
      <div className="space-y-4">
        {decorated.map(({ issue, originalIdx, badge }, listIdx) => {
          const active = activeId === issue.id;
          const isCritical = issue.severity === "critical";
          return (
            <button
              key={`${issue.id}-${listIdx}`}
              type="button"
              onClick={() => onSelect(active ? null : issue.id)}
              className={`w-full text-left p-4 bg-white border transition-colors ${
                active ? "border-primary shadow-sm" : "border-border hover:border-primary/40"
              } ${isCritical && !active ? "border-l-4 border-l-primary" : ""}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  title={badge.hint}
                  className={`px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase ${badgeClass(badge.tone)}`}
                >
                  {badge.label}
                </span>
                <span className="text-[10px] font-mono text-muted-foreground">
                  #{String(originalIdx + 1).padStart(2, "0")} {PRINCIPLE_LABELS[issue.principle] ?? issue.principle}
                </span>
                {issue.criterion_id && (
                  <span className="text-[10px] font-mono text-muted-foreground/80 ml-auto">
                    {issue.source_url ? (
                      <a
                        href={issue.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="underline decoration-dotted hover:text-foreground"
                      >
                        {issue.criterion_id}
                      </a>
                    ) : (
                      issue.criterion_id
                    )}
                  </span>
                )}
              </div>
              <p className="text-sm font-medium mb-1">{issue.title}</p>
              <p className="text-xs text-muted-foreground leading-relaxed mb-2">
                {issue.observation ?? issue.description}
              </p>
              {issue.evidence && (
                <div className="mb-2">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-0.5">
                    Evidence
                  </p>
                  <p className="text-xs text-foreground/90 leading-relaxed font-mono">
                    {issue.evidence}
                  </p>
                </div>
              )}
              {issue.user_impact && (
                <div className="mb-2">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-0.5">
                    User impact
                  </p>
                  <p className="text-xs text-foreground/90 leading-relaxed">
                    {issue.user_impact}
                  </p>
                </div>
              )}
              <div className="pt-2 border-t border-border/60">
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">
                  Fix
                </p>
                <p className="text-xs text-foreground leading-relaxed">
                  {issue.fix_suggestion ?? issue.fix}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * PerspectivesPanel — four user archetypes' read of the design.
 *
 * Each card is a small, self-contained argument: persona → score → verdict →
 * 2-3 concrete observations tied to visible elements. The intent is that a
 * reviewer can read a card, look at the design, and check the claim for
 * themselves — every observation cites what was seen, the concrete evidence,
 * and why that particular user reacts to it.
 */
export function PerspectivesPanel({ perspectives }: { perspectives: PerspectiveVerdict[] }) {
  const [openId, setOpenId] = useState<string | null>(perspectives[0]?.id ?? null);
  return (
    <div>
      <h2 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground mb-4">
        User Perspectives · 4 archetypes
      </h2>
      <div className="space-y-3">
        {perspectives.map((p) => {
          const open = openId === p.id;
          const low = p.score < 6;
          return (
            <div key={p.id} className="border border-border bg-white rounded-sm overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : p.id)}
                className="w-full text-left p-4 flex items-start gap-3 hover:bg-muted/40 transition-colors"
              >
                <span
                  className={`font-mono text-lg leading-none pt-0.5 tabular-nums ${low ? "text-primary" : ""}`}
                >
                  {p.score.toFixed(1)}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-medium text-sm truncate">{p.persona}</span>
                  <span className="block text-xs text-muted-foreground italic mt-0.5 line-clamp-2">
                    "{p.verdict}"
                  </span>
                </span>
                <span
                  className={`shrink-0 font-mono text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded-sm ${
                    p.would_return
                      ? "bg-foreground/5 text-muted-foreground"
                      : "bg-primary/10 text-primary"
                  }`}
                >
                  {p.would_return ? "Would return" : "Would leave"}
                </span>
              </button>
              {open && (
                <div className="px-4 pb-4 pt-1 border-t border-border/60 space-y-3">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Goal · {p.goal}
                  </p>
                  {p.observations.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">
                      {p.ok ? "No specific observations from this perspective." : "Perspective unavailable."}
                    </p>
                  ) : (
                    <ol className="space-y-3">
                      {p.observations.map((o, i) => (
                        <li key={i} className="text-xs leading-relaxed">
                          <div className="font-mono text-[10px] uppercase tracking-widest text-primary mb-1">
                            {String(i + 1).padStart(2, "0")} · What I see
                          </div>
                          <p className="mb-1.5">{o.observation}</p>
                          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                            Evidence
                          </div>
                          <p className="mb-1.5 text-muted-foreground">{o.evidence}</p>
                          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                            Why it matters to me
                          </div>
                          <p className="text-muted-foreground">{o.impact}</p>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AnnotatedCanvas({
  imageUrl,
  issues,
  activeId,
  onSelect,
  title,
}: {
  imageUrl: string;
  issues: Issue[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
  title: string;
}) {
  const cleanTitle = sanitizeAltTitle(title);
  return (
    <div>
      <div className="flex items-center justify-between mb-4 font-mono text-[11px] uppercase tracking-tighter gap-4">
        <span className="truncate">Annotated / {cleanTitle}</span>
        <span className="text-primary whitespace-nowrap">{issues.length} active issues</span>
      </div>
      <div className="relative bg-white border border-border shadow-2xl rounded-sm overflow-hidden">
        <img
          src={imageUrl}
          alt={`Annotated design mockup: ${cleanTitle}`}
          className="w-full h-auto block"
        />
        {issues.map((issue, idx) => {
          const active = activeId === issue.id;
          const isCritical = issue.severity === "critical";
          return (
            <button
              key={`${issue.id}-${idx}`}
              onClick={() => onSelect(active ? null : issue.id)}
              style={{ top: `${issue.y * 100}%`, left: `${issue.x * 100}%` }}
              title={issue.title}
              className={`absolute -translate-x-1/2 -translate-y-1/2 size-7 font-mono text-[10px] flex items-center justify-center animate-fade-in transition-all ${
                isCritical
                  ? "bg-primary text-white ring-4 ring-primary/20"
                  : "bg-white text-primary border border-primary"
              } ${active ? "scale-125 ring-8 ring-primary/30 z-10" : "hover:scale-110"}`}
            >
              {String(idx + 1).padStart(2, "0")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Strip file extensions and normalize separators so alt text reads as prose. */
export function sanitizeAltTitle(raw: string): string {
  const noExt = raw.replace(/\.(png|jpe?g|webp|gif|bmp|tiff?|heic|mp4|mov|webm)$/i, "");
  const spaced = noExt.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return spaced || "design mockup";
}

export function ResultsView({
  payload,
  imageUrl,
  title,
  critiqueId,
  canEdit = false,
  shareUrl,
}: {
  payload: CritiquePayload;
  imageUrl: string;
  title: string;
  critiqueId?: string;
  canEdit?: boolean;
  shareUrl?: string;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);

  // Prioritization scheme — presentational only; persisted per critique so a
  // reviewer's chosen vocabulary survives navigation. Falls back to Severity.
  const storageKey = critiqueId ? `critique:${critiqueId}:priority-scheme` : null;
  const [scheme, setScheme] = useState<PriorityScheme>("severity");
  useEffect(() => {
    if (!storageKey) return;
    const saved = window.localStorage.getItem(storageKey);
    if (saved && (PRIORITY_SCHEME_ORDER as string[]).includes(saved)) {
      setScheme(saved as PriorityScheme);
    }
  }, [storageKey]);
  useEffect(() => {
    if (!storageKey) return;
    window.localStorage.setItem(storageKey, scheme);
  }, [scheme, storageKey]);
  const spec = PRIORITY_SCHEMES[scheme];

  return (
    <section className="grid grid-cols-1 md:grid-cols-12 gap-12">
      <div className="md:col-span-8 relative">
        <div className="md:sticky md:top-24">
          <AnnotatedCanvas
            imageUrl={imageUrl}
            issues={payload.issues}
            activeId={activeId}
            onSelect={setActiveId}
            title={title}
          />
        </div>
      </div>
      <div className="md:col-span-4">
        <div className="space-y-8">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground mb-2">
              Overall
            </p>
            <div className="flex items-baseline gap-4 border-b border-border pb-4 mb-4">
              <span className="font-serif italic text-5xl">{payload.overall_score.toFixed(1)}</span>
              <span className="text-sm text-muted-foreground">/ 10</span>
            </div>
            {payload.summary && (
              <p className="text-sm text-foreground leading-relaxed italic font-serif">
                "{payload.summary}"
              </p>
            )}
          </div>
          <RubricPanel rubric={payload.rubric} />
          <div>
            <label className="block">
              <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                Priority display
              </span>
              <select
                value={scheme}
                onChange={(e) => setScheme(e.target.value as PriorityScheme)}
                className="mt-1 w-full border border-border rounded-sm bg-white text-sm px-2 py-1.5"
              >
                {PRIORITY_SCHEME_ORDER.map((k) => (
                  <option key={k} value={k}>
                    {PRIORITY_SCHEMES[k].label}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
              {spec.description}
            </p>
          </div>
          <IssueList
            issues={payload.issues}
            activeId={activeId}
            onSelect={setActiveId}
            scheme={scheme}
          />

          {payload.perspectives && payload.perspectives.length > 0 && (
            <PerspectivesPanel perspectives={payload.perspectives} />
          )}

          {critiqueId && (
            <DecisionLog
              critiqueId={critiqueId}
              issues={payload.issues}
              canEdit={canEdit}
              title={title}
              summary={payload.summary ?? ""}
              overallScore={payload.overall_score}
              shareUrl={shareUrl}
            />
          )}
        </div>
      </div>
    </section>
  );
}

export function AnalyzingState() {
  return (
    <section className="grid grid-cols-1 md:grid-cols-12 gap-12">
      <div className="md:col-span-8">
        <div className="h-[600px] bg-white border border-border rounded-sm shadow-sm flex items-center justify-center overflow-hidden animate-pulse">
          <div className="font-mono text-[11px] uppercase tracking-widest text-primary">
            Scanning geometry…
          </div>
        </div>
      </div>
      <div className="md:col-span-4 font-mono text-[10px] space-y-1 text-muted-foreground">
        <div className="text-primary">[SYSTEM] Initializing rubric v4.2</div>
        <div>[HOOKS] Loading image…</div>
        <div>[HOOKS] Layout parity check…</div>
        <div>[HOOKS] Color contrast probe…</div>
        <div>[HOOKS] Type scale audit…</div>
        <div>[HOOKS] Assembling critique…</div>
      </div>
    </section>
  );
}
