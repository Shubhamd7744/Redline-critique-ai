import { useState } from "react";
import {
  PRINCIPLE_LABELS,
  SEVERITY_LABEL,
  type CritiquePayload,
  type Issue,
  type RubricScores,
  type Severity,
} from "@/lib/critique-types";
import { DecisionLog } from "@/components/decision-log";

export function RubricPanel({ rubric }: { rubric: RubricScores }) {
  const entries = Object.entries(rubric) as [keyof RubricScores, number][];
  return (
    <div>
      <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground mb-4">
        Analysis Rubric
      </h3>
      <div className="space-y-3">
        {entries.map(([k, v]) => (
          <div key={k} className="flex items-end justify-between border-b border-border pb-1">
            <span className="text-sm">{PRINCIPLE_LABELS[k]}</span>
            <span className={`font-mono text-lg font-medium ${v < 6 ? "text-primary" : ""}`}>
              {v.toFixed(1)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const SEVERITY_STYLES: Record<Severity, string> = {
  critical: "bg-primary/10 text-primary",
  suggested: "bg-stone-200/60 text-foreground",
  polish: "bg-stone-100 text-muted-foreground",
};

export function IssueList({
  issues,
  activeId,
  onSelect,
}: {
  issues: Issue[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <div>
      <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground mb-4">
        Issue Log
      </h3>
      <div className="space-y-4">
        {issues.map((issue, idx) => {
          const active = activeId === issue.id;
          const isCritical = issue.severity === "critical";
          return (
            <button
              key={issue.id}
              type="button"
              onClick={() => onSelect(active ? null : issue.id)}
              className={`w-full text-left p-4 bg-white border transition-colors ${
                active ? "border-primary shadow-sm" : "border-border hover:border-primary/40"
              } ${isCritical && !active ? "border-l-4 border-l-primary" : ""}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={`px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase ${SEVERITY_STYLES[issue.severity]}`}
                >
                  {SEVERITY_LABEL[issue.severity]}
                </span>
                <span className="text-[10px] font-mono text-muted-foreground">
                  #{String(idx + 1).padStart(2, "0")} {PRINCIPLE_LABELS[issue.principle] ?? issue.principle}
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
  return (
    <div>
      <div className="flex items-center justify-between mb-4 font-mono text-[11px] uppercase tracking-tighter gap-4">
        <span className="truncate">Annotated / {title}</span>
        <span className="text-primary whitespace-nowrap">{issues.length} active issues</span>
      </div>
      <div className="relative bg-white border border-border shadow-2xl rounded-sm overflow-hidden">
        <img src={imageUrl} alt={title} className="w-full h-auto block" />
        {issues.map((issue, idx) => {
          const active = activeId === issue.id;
          const isCritical = issue.severity === "critical";
          return (
            <button
              key={issue.id}
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
          <IssueList issues={payload.issues} activeId={activeId} onSelect={setActiveId} />
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
