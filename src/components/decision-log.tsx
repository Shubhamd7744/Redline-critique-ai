import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  upsertFindingDecision,
  deleteFindingDecision,
} from "@/lib/decisions.functions";
import {
  EXPORT_FORMATS,
  renderHandoff,
  type DecisionState,
  type ExportFormat,
  type FindingDecision,
} from "@/lib/decision-export";
import { PRINCIPLE_LABELS, SEVERITY_LABEL, type Issue } from "@/lib/critique-types";

interface DecisionLogProps {
  critiqueId: string;
  issues: Issue[];
  canEdit: boolean;
  title: string;
  summary: string;
  overallScore: number;
  shareUrl?: string;
}

type DecisionRow = {
  finding_id: string;
  decision: DecisionState;
  owner: string | null;
  due_date: string | null;
  decision_note: string | null;
  updated_at: string;
};

export function DecisionLog({
  critiqueId,
  issues,
  canEdit,
  title,
  summary,
  overallScore,
  shareUrl,
}: DecisionLogProps) {
  const [decisions, setDecisions] = useState<Record<string, DecisionRow>>({});
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("linear");
  const upsertFn = useServerFn(upsertFindingDecision);
  const deleteFn = useServerFn(deleteFindingDecision);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("finding_decisions")
        .select("finding_id, decision, owner, due_date, decision_note, updated_at")
        .eq("critique_id", critiqueId);
      if (cancelled) return;
      if (error) {
        toast.error(`Could not load decisions: ${error.message}`);
      } else {
        const map: Record<string, DecisionRow> = {};
        for (const row of data ?? []) map[row.finding_id] = row as DecisionRow;
        setDecisions(map);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [critiqueId]);

  const counts = useMemo(() => {
    let accepted = 0;
    let rejected = 0;
    for (const d of Object.values(decisions)) {
      if (d.decision === "accepted") accepted++;
      else rejected++;
    }
    return { accepted, rejected, pending: issues.length - accepted - rejected };
  }, [decisions, issues.length]);

  async function save(
    issue: Issue,
    patch: Partial<Omit<DecisionRow, "finding_id" | "updated_at">> & { decision: DecisionState },
  ) {
    const existing = decisions[issue.id];
    const next: DecisionRow = {
      finding_id: issue.id,
      decision: patch.decision,
      owner: patch.owner ?? existing?.owner ?? null,
      due_date: patch.due_date ?? existing?.due_date ?? null,
      decision_note: patch.decision_note ?? existing?.decision_note ?? null,
      updated_at: new Date().toISOString(),
    };
    setDecisions((prev) => ({ ...prev, [issue.id]: next }));
    try {
      await upsertFn({
        data: {
          critiqueId,
          findingId: issue.id,
          decision: next.decision,
          owner: next.owner,
          dueDate: next.due_date,
          decisionNote: next.decision_note,
        },
      });
    } catch (e) {
      // rollback
      setDecisions((prev) => {
        const clone = { ...prev };
        if (existing) clone[issue.id] = existing;
        else delete clone[issue.id];
        return clone;
      });
      toast.error(e instanceof Error ? e.message : "Failed to save decision");
    }
  }

  async function clear(issue: Issue) {
    const existing = decisions[issue.id];
    if (!existing) return;
    setDecisions((prev) => {
      const clone = { ...prev };
      delete clone[issue.id];
      return clone;
    });
    try {
      await deleteFn({ data: { critiqueId, findingId: issue.id } });
    } catch (e) {
      setDecisions((prev) => ({ ...prev, [issue.id]: existing }));
      toast.error(e instanceof Error ? e.message : "Failed to clear decision");
    }
  }

  const rendered = useMemo(
    () =>
      renderHandoff(exportFormat, {
        title,
        summary,
        overallScore,
        shareUrl,
        findings: issues.map((issue) => {
          const d = decisions[issue.id];
          const decision: FindingDecision | null = d
            ? {
                finding_id: d.finding_id,
                decision: d.decision,
                owner: d.owner,
                due_date: d.due_date,
                decision_note: d.decision_note,
                updated_at: d.updated_at,
              }
            : null;
          return { issue, decision };
        }),
      }),
    [exportFormat, issues, decisions, title, summary, overallScore, shareUrl],
  );

  async function copyExport() {
    try {
      await navigator.clipboard.writeText(rendered);
      toast.success(`Copied ${EXPORT_FORMATS[exportFormat].label} handoff`);
    } catch {
      toast.error("Clipboard write failed");
    }
  }

  return (
    <section className="border-t border-border pt-8 mt-8">
      <div className="flex items-baseline justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground mb-1">
            Decision Log
          </h3>
          <p className="text-xs text-muted-foreground">
            {loading
              ? "Loading decisions…"
              : `${counts.accepted} accepted · ${counts.rejected} rejected · ${counts.pending} pending`}
          </p>
        </div>
      </div>

      <div className="space-y-2 mb-6">
        {issues.map((issue) => {
          const d = decisions[issue.id];
          const open = openId === issue.id;
          return (
            <div
              key={issue.id}
              className={`border rounded-sm ${
                d?.decision === "accepted"
                  ? "border-emerald-500/40 bg-emerald-500/5"
                  : d?.decision === "rejected"
                    ? "border-primary/40 bg-primary/5"
                    : "border-border"
              }`}
            >
              <div className="flex items-center gap-2 px-3 py-2">
                <span className="font-mono text-[10px] text-muted-foreground w-8 shrink-0">
                  #{issue.id}
                </span>
                <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground w-20 shrink-0">
                  {SEVERITY_LABEL[issue.severity]}
                </span>
                <span className="text-sm truncate flex-1">{issue.title}</span>
                <span className="text-[10px] font-mono text-muted-foreground hidden sm:inline">
                  {PRINCIPLE_LABELS[issue.principle] ?? issue.principle}
                </span>
                {canEdit ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => save(issue, { decision: "accepted" })}
                      className={`px-2 py-1 text-[10px] font-mono uppercase tracking-widest border rounded-sm ${
                        d?.decision === "accepted"
                          ? "bg-emerald-600 text-white border-emerald-600"
                          : "border-border hover:bg-emerald-500/10"
                      }`}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => save(issue, { decision: "rejected" })}
                      className={`px-2 py-1 text-[10px] font-mono uppercase tracking-widest border rounded-sm ${
                        d?.decision === "rejected"
                          ? "bg-primary text-white border-primary"
                          : "border-border hover:bg-primary/10"
                      }`}
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : issue.id)}
                      className="px-2 py-1 text-[10px] font-mono uppercase tracking-widest border border-border rounded-sm hover:bg-muted"
                    >
                      {open ? "Close" : "Details"}
                    </button>
                  </div>
                ) : (
                  d && (
                    <span className="text-[10px] font-mono uppercase tracking-widest shrink-0">
                      {d.decision === "accepted" ? "✔ Accepted" : "✖ Rejected"}
                    </span>
                  )
                )}
              </div>

              {open && canEdit && (
                <DecisionForm
                  issue={issue}
                  current={d}
                  onSave={(patch) =>
                    save(issue, { decision: d?.decision ?? "accepted", ...patch })
                  }
                  onClear={() => clear(issue)}
                />
              )}

              {!open && d && (d.owner || d.due_date || d.decision_note) && (
                <div className="px-3 pb-2 -mt-1 text-[11px] text-muted-foreground flex gap-3 flex-wrap">
                  {d.owner && <span>Owner: {d.owner}</span>}
                  {d.due_date && <span>Due: {d.due_date}</span>}
                  {d.decision_note && <span className="italic truncate">"{d.decision_note}"</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="border border-border rounded-sm p-4">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground mb-1">
              Handoff Export
            </p>
            <p className="text-xs text-muted-foreground">
              {EXPORT_FORMATS[exportFormat].hint}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
              className="border border-border rounded-sm bg-white text-xs font-mono px-2 py-1"
            >
              {(Object.keys(EXPORT_FORMATS) as ExportFormat[]).map((k) => (
                <option key={k} value={k}>
                  {EXPORT_FORMATS[k].label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={copyExport}
              className="px-3 py-1.5 text-xs font-medium border border-primary bg-primary text-white rounded-sm hover:bg-primary/90"
            >
              Copy
            </button>
          </div>
        </div>
        <pre className="text-[11px] font-mono leading-relaxed whitespace-pre-wrap max-h-80 overflow-auto bg-stone-50 border border-border/60 rounded-sm p-3">
          {rendered}
        </pre>
      </div>
    </section>
  );
}

function DecisionForm({
  issue,
  current,
  onSave,
  onClear,
}: {
  issue: Issue;
  current: DecisionRow | undefined;
  onSave: (patch: {
    decision?: DecisionState;
    owner: string | null;
    due_date: string | null;
    decision_note: string | null;
  }) => void;
  onClear: () => void;
}) {
  const [owner, setOwner] = useState(current?.owner ?? "");
  const [dueDate, setDueDate] = useState(current?.due_date ?? "");
  const [note, setNote] = useState(current?.decision_note ?? "");

  useEffect(() => {
    setOwner(current?.owner ?? "");
    setDueDate(current?.due_date ?? "");
    setNote(current?.decision_note ?? "");
  }, [current?.finding_id, current?.owner, current?.due_date, current?.decision_note]);

  function commit(decision?: DecisionState) {
    onSave({
      decision,
      owner: owner.trim() || null,
      due_date: dueDate || null,
      decision_note: note.trim() || null,
    });
  }

  return (
    <div className="px-3 pb-3 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
      <label className="text-xs">
        <span className="block font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
          Owner
        </span>
        <input
          type="text"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          placeholder="e.g. @alex or Design team"
          maxLength={120}
          className="w-full border border-border rounded-sm px-2 py-1 bg-white"
        />
      </label>
      <label className="text-xs">
        <span className="block font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
          Due date
        </span>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="w-full border border-border rounded-sm px-2 py-1 bg-white"
        />
      </label>
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={() => commit()}
          className="px-3 py-1.5 text-xs border border-border rounded-sm hover:bg-muted"
        >
          Save
        </button>
        {current && (
          <button
            type="button"
            onClick={onClear}
            className="px-3 py-1.5 text-xs border border-border rounded-sm hover:bg-muted text-muted-foreground"
          >
            Clear
          </button>
        )}
      </div>
      <label className="text-xs sm:col-span-3">
        <span className="block font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
          Decision note {issue.criterion_id && <span className="opacity-60">· {issue.criterion_id}</span>}
        </span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="Why this decision? Context, tradeoffs, follow-ups…"
          className="w-full border border-border rounded-sm px-2 py-1 bg-white resize-y"
        />
      </label>
    </div>
  );
}
