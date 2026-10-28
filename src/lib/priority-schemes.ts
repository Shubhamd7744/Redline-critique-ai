/**
 * Prioritization display schemes.
 *
 * A single run produces one set of findings; different teams triage them under
 * different vocabularies. Rather than re-scoring the underlying critique, each
 * scheme provides a deterministic mapping from a Finding's severity /
 * confidence / criterion to a triage label, a rank (for sorting), and a swatch
 * class (for the badge). Selecting a scheme is purely presentational — the
 * detector output is untouched.
 *
 * Schemes:
 *   - severity        (native critical / suggested / polish — the default)
 *   - nielsen         (Jakob Nielsen's 0–4 usability severity scale)
 *   - moscow          (Must / Should / Could / Won't)
 *   - blocker         (Blocker / Concern / Nit — code-review shorthand)
 *   - rice            (Reach · Impact · Confidence / Effort — numeric)
 */

import type { Issue, Severity } from "./critique-types";

export type PriorityScheme = "severity" | "nielsen" | "moscow" | "blocker" | "rice";

export interface PriorityBadge {
  label: string;
  short: string; // for compact badges, e.g. "N4", "M", "B"
  rank: number; // lower = higher priority (sort ascending)
  score?: number; // numeric schemes (RICE) — displayed alongside the label
  tone: "critical" | "high" | "medium" | "low" | "muted";
  hint?: string;
}

export interface PrioritySchemeSpec {
  id: PriorityScheme;
  label: string;
  description: string;
  badgeFor: (issue: Issue) => PriorityBadge;
}

const TONE_STYLES: Record<PriorityBadge["tone"], string> = {
  critical: "bg-primary text-white",
  high: "bg-primary/15 text-primary",
  medium: "bg-stone-200/70 text-foreground",
  low: "bg-stone-100 text-muted-foreground",
  muted: "bg-stone-50 text-muted-foreground border border-border",
};

export function badgeClass(tone: PriorityBadge["tone"]): string {
  return TONE_STYLES[tone];
}

const SEV_RANK: Record<Severity, number> = { critical: 0, suggested: 1, polish: 2 };
const SEV_IMPACT: Record<Severity, number> = { critical: 3, suggested: 2, polish: 1 };

// Reach proxy per pillar — accessibility failures affect the widest audience,
// AI-native findings the narrowest (only users hitting that feature). These are
// deliberate defaults; teams override by editing the map, not by re-scoring.
const PILLAR_REACH: Record<string, number> = {
  accessibility: 1.0,
  usability: 0.9,
  ethics: 0.85,
  ia_content: 0.75,
  visual: 0.6,
  ai_native: 0.5,
};

function reachFor(issue: Issue): number {
  // Infer pillar from criterion_id namespace (e.g. "wcag.2.5.8" → accessibility-ish).
  const ns = issue.criterion_id?.split(".")[0]?.toLowerCase();
  if (ns === "wcag") return PILLAR_REACH.accessibility;
  if (ns === "nielsen") return PILLAR_REACH.usability;
  if (ns === "hax" || ns === "pair" || ns === "carbon") return PILLAR_REACH.ai_native;
  if (ns === "wsg" || ns === "dark") return PILLAR_REACH.ethics;
  // Fall back on principle
  switch (issue.principle) {
    case "accessibility":
    case "contrast":
      return PILLAR_REACH.accessibility;
    case "hierarchy":
      return PILLAR_REACH.usability;
    case "typography":
    case "spacing":
      return PILLAR_REACH.visual;
    default:
      return 0.7;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Schemes
// ─────────────────────────────────────────────────────────────────────────────

const severityScheme: PrioritySchemeSpec = {
  id: "severity",
  label: "Severity",
  description: "Native labels: Critical, Suggested, Polish.",
  badgeFor: (issue) => {
    const tone: PriorityBadge["tone"] =
      issue.severity === "critical" ? "critical" : issue.severity === "suggested" ? "medium" : "low";
    return {
      label:
        issue.severity === "critical"
          ? "Critical"
          : issue.severity === "suggested"
            ? "Suggested"
            : "Polish",
      short: issue.severity[0].toUpperCase(),
      rank: SEV_RANK[issue.severity],
      tone,
    };
  },
};

const nielsenScheme: PrioritySchemeSpec = {
  id: "nielsen",
  label: "Nielsen 0–4",
  description: "Jakob Nielsen's usability-severity scale, from cosmetic to catastrophe.",
  badgeFor: (issue) => {
    const conf = issue.confidence ?? 0.7;
    // 4 Usability catastrophe — critical severity, high confidence
    // 3 Major — critical severity, lower confidence, OR suggested + accessibility
    // 2 Minor — suggested severity
    // 1 Cosmetic — polish severity
    // 0 Not a usability problem — polish + very low confidence (rare)
    let level: 0 | 1 | 2 | 3 | 4;
    if (issue.severity === "critical") level = conf >= 0.75 ? 4 : 3;
    else if (issue.severity === "suggested")
      level = issue.principle === "accessibility" || issue.principle === "contrast" ? 3 : 2;
    else level = conf < 0.35 ? 0 : 1;

    const labels = ["Not a problem", "Cosmetic", "Minor", "Major", "Catastrophe"] as const;
    const tones: PriorityBadge["tone"][] = ["muted", "low", "medium", "high", "critical"];
    return {
      label: `${level} · ${labels[level]}`,
      short: `N${level}`,
      rank: 4 - level, // higher level = higher priority (lower rank)
      tone: tones[level],
      hint: "Nielsen (1994) usability severity ratings",
    };
  },
};

const moscowScheme: PrioritySchemeSpec = {
  id: "moscow",
  label: "MoSCoW",
  description: "Must / Should / Could / Won't — release triage.",
  badgeFor: (issue) => {
    const conf = issue.confidence ?? 0.7;
    if (issue.severity === "critical")
      return { label: "Must have", short: "M", rank: 0, tone: "critical" };
    const a11yish = issue.principle === "accessibility" || issue.principle === "contrast";
    if (issue.severity === "suggested" && (a11yish || conf >= 0.75))
      return { label: "Should have", short: "S", rank: 1, tone: "high" };
    if (issue.severity === "suggested")
      return { label: "Could have", short: "C", rank: 2, tone: "medium" };
    if (conf >= 0.6) return { label: "Could have", short: "C", rank: 2, tone: "medium" };
    return { label: "Won't have (this run)", short: "W", rank: 3, tone: "muted" };
  },
};

const blockerScheme: PrioritySchemeSpec = {
  id: "blocker",
  label: "Blocker / Concern / Nit",
  description: "Code-review vocabulary. Blocker stops ship; Nit is a style note.",
  badgeFor: (issue) => {
    if (issue.severity === "critical")
      return { label: "Blocker", short: "B", rank: 0, tone: "critical" };
    if (issue.severity === "suggested")
      return { label: "Concern", short: "C", rank: 1, tone: "high" };
    return { label: "Nit", short: "N", rank: 2, tone: "low" };
  },
};

const riceScheme: PrioritySchemeSpec = {
  id: "rice",
  label: "RICE",
  description: "Reach × Impact × Confidence ÷ Effort. Effort is assumed 1 per finding.",
  badgeFor: (issue) => {
    const reach = reachFor(issue);
    const impact = SEV_IMPACT[issue.severity];
    const confidence = issue.confidence ?? 0.7;
    const effort = 1;
    const score = (reach * impact * confidence) / effort;
    // Buckets for tone: >=2 high critical, >=1.4 high, >=0.9 medium, >=0.5 low
    let tone: PriorityBadge["tone"];
    if (score >= 2) tone = "critical";
    else if (score >= 1.4) tone = "high";
    else if (score >= 0.9) tone = "medium";
    else if (score >= 0.5) tone = "low";
    else tone = "muted";
    return {
      label: `RICE ${score.toFixed(2)}`,
      short: score.toFixed(1),
      rank: -score, // higher score = higher priority
      score,
      tone,
      hint: `reach ${reach.toFixed(2)} · impact ${impact} · conf ${confidence.toFixed(2)} · effort ${effort}`,
    };
  },
};

export const PRIORITY_SCHEMES: Record<PriorityScheme, PrioritySchemeSpec> = {
  severity: severityScheme,
  nielsen: nielsenScheme,
  moscow: moscowScheme,
  blocker: blockerScheme,
  rice: riceScheme,
};

export const PRIORITY_SCHEME_ORDER: PriorityScheme[] = [
  "severity",
  "nielsen",
  "moscow",
  "blocker",
  "rice",
];
