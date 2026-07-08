/**
 * Handoff export formatters.
 *
 * Turn a critique's findings + decisions into the exact text the destination
 * tool expects to paste into a ticket, PR review, or Figma comment:
 *
 *   - Jira            → Atlassian Wiki Markup (h3, panels, {code}, tables)
 *   - Linear          → GitHub-flavored Markdown (Linear's native format)
 *   - GitHub          → GFM with task-list checkboxes + collapsibles
 *   - Figma comment   → Plain text with unicode bullets (Figma strips markdown)
 *
 * Every finding renders the full four-slot schema (observation, evidence,
 * user_impact, fix_suggestion), the criterion_id + source_url citation, and
 * the decision metadata (owner, due date, note) so the receiving tool has
 * the complete audit trail — not just the title.
 */

import type { Issue, Severity } from "./critique-types";

export type DecisionState = "accepted" | "rejected";

export interface FindingDecision {
  finding_id: string;
  decision: DecisionState;
  owner: string | null;
  due_date: string | null; // YYYY-MM-DD
  decision_note: string | null;
  updated_at?: string;
}

export interface DecoratedFinding {
  issue: Issue;
  decision: FindingDecision | null;
}

export interface ExportInput {
  title: string;
  overallScore: number;
  summary: string;
  findings: DecoratedFinding[];
  shareUrl?: string;
}

export type ExportFormat = "jira" | "linear" | "github" | "figma";

const SEV_LABEL: Record<Severity, string> = {
  critical: "Critical",
  suggested: "Suggested",
  polish: "Polish",
};

const DECISION_LABEL: Record<DecisionState, string> = {
  accepted: "Accepted",
  rejected: "Rejected",
};

const sortFindings = (a: DecoratedFinding, b: DecoratedFinding) => {
  const rank: Record<Severity, number> = { critical: 0, suggested: 1, polish: 2 };
  const s = rank[a.issue.severity] - rank[b.issue.severity];
  if (s !== 0) return s;
  return a.issue.id.localeCompare(b.issue.id);
};

const decisionsOnly = (findings: DecoratedFinding[]) =>
  findings.filter((f) => f.decision !== null).sort(sortFindings);

// ─────────────────────────────────────────────────────────────────────────────
// Jira — Atlassian Wiki Markup
// ─────────────────────────────────────────────────────────────────────────────

function formatJira(input: ExportInput): string {
  const lines: string[] = [];
  lines.push(`h2. Design critique handoff — ${input.title}`);
  lines.push("");
  lines.push(`*Overall score:* ${input.overallScore.toFixed(1)} / 10`);
  if (input.summary) lines.push(`*Summary:* ${input.summary}`);
  if (input.shareUrl) lines.push(`*Source:* [Critique|${input.shareUrl}]`);
  lines.push("");

  const decided = decisionsOnly(input.findings);
  if (decided.length === 0) {
    lines.push("_No decisions recorded yet._");
    return lines.join("\n");
  }

  lines.push("|| # || Severity || Decision || Owner || Due || Criterion || Title ||");
  for (const f of decided) {
    const d = f.decision!;
    lines.push(
      `| ${f.issue.id} | ${SEV_LABEL[f.issue.severity]} | ${DECISION_LABEL[d.decision]} | ${d.owner ?? "—"} | ${d.due_date ?? "—"} | ${f.issue.criterion_id ?? "—"} | ${f.issue.title} |`,
    );
  }
  lines.push("");

  for (const f of decided) {
    const d = f.decision!;
    const panel = d.decision === "accepted" ? "info" : "warning";
    lines.push(
      `h3. #${f.issue.id} · ${SEV_LABEL[f.issue.severity]} · ${DECISION_LABEL[d.decision]} — ${f.issue.title}`,
    );
    lines.push(`{panel:title=Decision|bgColor=${panel === "info" ? "#DEEBFF" : "#FFF0B3"}}`);
    lines.push(`*Owner:* ${d.owner ?? "unassigned"}   *Due:* ${d.due_date ?? "—"}`);
    if (d.decision_note) lines.push(`*Note:* ${d.decision_note}`);
    lines.push("{panel}");
    lines.push(`*Observation:* ${f.issue.observation ?? f.issue.description}`);
    if (f.issue.evidence) lines.push(`*Evidence:* {{${f.issue.evidence}}}`);
    if (f.issue.user_impact) lines.push(`*User impact:* ${f.issue.user_impact}`);
    lines.push(`*Fix direction:* ${f.issue.fix_suggestion ?? f.issue.fix}`);
    if (f.issue.criterion_id) {
      const cite = f.issue.source_url
        ? `[${f.issue.criterion_id}|${f.issue.source_url}]`
        : f.issue.criterion_id;
      lines.push(`*Criterion:* ${cite}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

// ─────────────────────────────────────────────────────────────────────────────
// Linear — GitHub-flavored Markdown (Linear renders it natively)
// ─────────────────────────────────────────────────────────────────────────────

function formatLinear(input: ExportInput): string {
  const lines: string[] = [];
  lines.push(`# Design critique handoff — ${input.title}`);
  lines.push("");
  lines.push(`**Overall:** ${input.overallScore.toFixed(1)} / 10`);
  if (input.summary) lines.push(`**Summary:** ${input.summary}`);
  if (input.shareUrl) lines.push(`**Source:** [Critique](${input.shareUrl})`);
  lines.push("");

  const decided = decisionsOnly(input.findings);
  if (decided.length === 0) {
    lines.push("_No decisions recorded yet._");
    return lines.join("\n");
  }

  lines.push("| # | Severity | Decision | Owner | Due | Criterion |");
  lines.push("|---|---|---|---|---|---|");
  for (const f of decided) {
    const d = f.decision!;
    lines.push(
      `| ${f.issue.id} | ${SEV_LABEL[f.issue.severity]} | ${DECISION_LABEL[d.decision]} | ${d.owner ?? "—"} | ${d.due_date ?? "—"} | ${f.issue.criterion_id ?? "—"} |`,
    );
  }
  lines.push("");

  for (const f of decided) {
    const d = f.decision!;
    const emoji = d.decision === "accepted" ? "✅" : "🚫";
    lines.push(
      `## ${emoji} #${f.issue.id} · ${SEV_LABEL[f.issue.severity]} — ${f.issue.title}`,
    );
    lines.push(
      `**Decision:** ${DECISION_LABEL[d.decision]} · **Owner:** ${d.owner ?? "unassigned"} · **Due:** ${d.due_date ?? "—"}`,
    );
    if (d.decision_note) lines.push(`> ${d.decision_note}`);
    lines.push("");
    lines.push(`- **Observation.** ${f.issue.observation ?? f.issue.description}`);
    if (f.issue.evidence) lines.push(`- **Evidence.** \`${f.issue.evidence}\``);
    if (f.issue.user_impact) lines.push(`- **User impact.** ${f.issue.user_impact}`);
    lines.push(`- **Fix direction.** ${f.issue.fix_suggestion ?? f.issue.fix}`);
    if (f.issue.criterion_id) {
      const cite = f.issue.source_url
        ? `[${f.issue.criterion_id}](${f.issue.source_url})`
        : f.issue.criterion_id;
      lines.push(`- **Criterion.** ${cite}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

// ─────────────────────────────────────────────────────────────────────────────
// GitHub — GFM with checkboxes + <details> collapsibles for scannability
// ─────────────────────────────────────────────────────────────────────────────

function formatGithub(input: ExportInput): string {
  const lines: string[] = [];
  lines.push(`## Design critique — ${input.title}`);
  lines.push("");
  lines.push(
    `**Score:** ${input.overallScore.toFixed(1)} / 10${input.shareUrl ? ` · [source](${input.shareUrl})` : ""}`,
  );
  if (input.summary) {
    lines.push("");
    lines.push(`> ${input.summary}`);
  }
  lines.push("");

  const decided = decisionsOnly(input.findings);
  if (decided.length === 0) {
    lines.push("_No decisions recorded yet._");
    return lines.join("\n");
  }

  lines.push("### Accepted work items");
  const accepted = decided.filter((f) => f.decision!.decision === "accepted");
  if (accepted.length === 0) {
    lines.push("_None._");
  } else {
    for (const f of accepted) {
      const d = f.decision!;
      const meta = [
        d.owner ? `@${d.owner.replace(/^@/, "")}` : null,
        d.due_date ? `due ${d.due_date}` : null,
        f.issue.criterion_id ?? null,
      ]
        .filter(Boolean)
        .join(" · ");
      lines.push(
        `- [ ] **#${f.issue.id} ${SEV_LABEL[f.issue.severity]}** — ${f.issue.title}${meta ? ` _(${meta})_` : ""}`,
      );
      lines.push(`  <details><summary>Details</summary>`);
      lines.push("");
      lines.push(`  **Observation.** ${f.issue.observation ?? f.issue.description}`);
      if (f.issue.evidence) lines.push(`  **Evidence.** \`${f.issue.evidence}\``);
      if (f.issue.user_impact) lines.push(`  **User impact.** ${f.issue.user_impact}`);
      lines.push(`  **Fix direction.** ${f.issue.fix_suggestion ?? f.issue.fix}`);
      if (d.decision_note) lines.push(`  **Note.** ${d.decision_note}`);
      if (f.issue.source_url) lines.push(`  **Criterion.** [${f.issue.criterion_id}](${f.issue.source_url})`);
      lines.push("  </details>");
    }
  }
  lines.push("");
  lines.push("### Rejected (won't fix)");
  const rejected = decided.filter((f) => f.decision!.decision === "rejected");
  if (rejected.length === 0) {
    lines.push("_None._");
  } else {
    for (const f of rejected) {
      const d = f.decision!;
      lines.push(
        `- ~~**#${f.issue.id}** — ${f.issue.title}~~${d.decision_note ? ` — _${d.decision_note}_` : ""}`,
      );
    }
  }
  return lines.join("\n").trimEnd();
}

// ─────────────────────────────────────────────────────────────────────────────
// Figma comment — plain text (Figma strips markdown; keep it readable)
// ─────────────────────────────────────────────────────────────────────────────

function formatFigma(input: ExportInput): string {
  const lines: string[] = [];
  lines.push(`◆ Design critique — ${input.title}`);
  lines.push(`Score: ${input.overallScore.toFixed(1)}/10`);
  if (input.summary) lines.push(`Summary: ${input.summary}`);
  if (input.shareUrl) lines.push(`Source: ${input.shareUrl}`);
  lines.push("");

  const decided = decisionsOnly(input.findings);
  if (decided.length === 0) {
    lines.push("No decisions recorded yet.");
    return lines.join("\n");
  }

  for (const f of decided) {
    const d = f.decision!;
    const mark = d.decision === "accepted" ? "✔" : "✖";
    const owner = d.owner ? ` @${d.owner.replace(/^@/, "")}` : "";
    const due = d.due_date ? ` · due ${d.due_date}` : "";
    lines.push(
      `${mark} #${f.issue.id} [${SEV_LABEL[f.issue.severity]}] ${f.issue.title}${owner}${due}`,
    );
    lines.push(`  • Observation: ${f.issue.observation ?? f.issue.description}`);
    if (f.issue.evidence) lines.push(`  • Evidence: ${f.issue.evidence}`);
    if (f.issue.user_impact) lines.push(`  • Impact: ${f.issue.user_impact}`);
    lines.push(`  • Fix: ${f.issue.fix_suggestion ?? f.issue.fix}`);
    if (d.decision_note) lines.push(`  • Note: ${d.decision_note}`);
    if (f.issue.criterion_id) {
      lines.push(
        `  • Criterion: ${f.issue.criterion_id}${f.issue.source_url ? ` — ${f.issue.source_url}` : ""}`,
      );
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

// ─────────────────────────────────────────────────────────────────────────────

export const EXPORT_FORMATS: Record<
  ExportFormat,
  { label: string; hint: string; format: (i: ExportInput) => string }
> = {
  jira: {
    label: "Jira",
    hint: "Atlassian Wiki Markup — paste into a ticket description or comment.",
    format: formatJira,
  },
  linear: {
    label: "Linear",
    hint: "GitHub-flavored Markdown — Linear renders it natively.",
    format: formatLinear,
  },
  github: {
    label: "GitHub",
    hint: "GFM with task-list checkboxes — paste into an issue or PR review.",
    format: formatGithub,
  },
  figma: {
    label: "Figma comment",
    hint: "Plain text — Figma strips markdown, so this stays readable.",
    format: formatFigma,
  },
};

export function renderHandoff(format: ExportFormat, input: ExportInput): string {
  return EXPORT_FORMATS[format].format(input);
}
