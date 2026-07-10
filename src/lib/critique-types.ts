export type Severity = "critical" | "suggested" | "polish";

export type Principle =
  | "hierarchy"
  | "contrast"
  | "typography"
  | "spacing"
  | "accessibility"
  | "consistency";

export interface RubricScores {
  hierarchy: number;
  contrast: number;
  typography: number;
  spacing: number;
  accessibility: number;
  consistency: number;
}

/**
 * Four-slot finding schema.
 *
 * Every finding must carry the four analytical slots professional reviewers use:
 *   - observation    → what was seen (neutral, descriptive)
 *   - evidence       → the measured value / concrete artefact backing it
 *   - user_impact    → who is harmed and how (grounds severity)
 *   - fix_suggestion → a direction, not a prescriptive solution
 *
 * Plus provenance:
 *   - criterion_id   → e.g. "nielsen.h5", "wcag.2.5.8", "hax.g3"
 *   - source_url     → canonical https:// framework URL (validated)
 *
 * Legacy fields `description` and `fix` are retained (mirrored from
 * observation + user_impact and fix_suggestion) so existing views keep
 * rendering without changes.
 */
export interface Issue {
  id: string;
  severity: Severity;
  principle: Principle;
  title: string;

  // Four-slot schema (required going forward)
  observation: string;
  evidence: string;
  user_impact: string;
  fix_suggestion: string;

  // Provenance
  criterion_id: string;
  source_url?: string; // validated https:// URL, omitted when invalid
  confidence?: number; // 0..1

  // Legacy mirrors — kept for backward compatibility with existing views
  description: string;
  fix: string;

  x: number; // 0..1
  y: number; // 0..1
}

// Validate that a candidate string is a well-formed https URL. Returns the
// normalized URL string on success, or undefined so callers can omit the
// field entirely — we prefer no source over an invalid one.
export function validateSourceUrl(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "https:") return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}

// Validate a criterion id like "nielsen.h5", "wcag.2.5.8", "hax.g3".
// Namespace + dot + alphanumeric segments. Falls back to a pillar-scoped
// "<pillar>.unspecified" so downstream code never sees an empty id.
const CRITERION_ID_RE = /^[a-z][a-z0-9_]*(\.[a-z0-9]+)+$/i;
export function validateCriterionId(input: unknown, fallback: string): string {
  if (typeof input !== "string") return fallback;
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return fallback;
  return CRITERION_ID_RE.test(trimmed) ? trimmed : fallback;
}

export interface CritiquePayload {
  rubric: RubricScores;
  issues: Issue[];
  summary: string;
  overall_score: number;
}

export const PRINCIPLE_LABELS: Record<Principle, string> = {
  hierarchy: "Visual Hierarchy",
  contrast: "Color Contrast",
  typography: "Typography",
  spacing: "Spacing & Rhythm",
  accessibility: "Accessibility",
  consistency: "Consistency",
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  suggested: "Suggested",
  polish: "Polish",
};

// ─────────────────────────────────────────────────────────────────────────────
// Ritual modes — a preset over the six-pillar detector layer.
// Each mode picks which pillars run and how they're weighted in the overall
// score. Mirrors the critique rituals used at Google, Microsoft, Airbnb,
// Figma, and Stripe: quick take, design review, a11y audit, heuristic eval,
// AI feature review, ethics/dark-pattern sweep.
// ─────────────────────────────────────────────────────────────────────────────

export type RitualMode =
  | "quick_take"
  | "design_review"
  | "accessibility_audit"
  | "heuristic_eval"
  | "ai_feature_review"
  | "ethics_sweep"
  | "motion_review";

export type PillarId =
  | "usability"
  | "accessibility"
  | "visual"
  | "ia_content"
  | "ai_native"
  | "ethics"
  | "motion";

export interface RitualModeSpec {
  id: RitualMode;
  label: string;
  short: string;
  description: string;
  pillars: PillarId[];
  weights: Partial<Record<PillarId, number>>;
}

export const RITUAL_MODES: Record<RitualMode, RitualModeSpec> = {
  quick_take: {
    id: "quick_take",
    label: "Quick Take",
    short: "Fast gut-check",
    description: "Usability and visual craft only. ~30s first pass.",
    pillars: ["usability", "visual"],
    weights: { usability: 0.6, visual: 0.4 },
  },
  design_review: {
    id: "design_review",
    label: "Design Review",
    short: "Full six-pillar audit",
    description: "The complete rubric — usability, WCAG 2.2, visual, IA, AI-native, ethics.",
    pillars: ["usability", "accessibility", "visual", "ia_content", "ai_native", "ethics"],
    weights: {
      usability: 0.25,
      accessibility: 0.25,
      visual: 0.2,
      ia_content: 0.15,
      ai_native: 0.08,
      ethics: 0.07,
    },
  },
  accessibility_audit: {
    id: "accessibility_audit",
    label: "Accessibility Audit",
    short: "WCAG 2.2 AA",
    description: "Focused pre-launch a11y sweep. Contrast, targets, focus, 2.2 additions.",
    pillars: ["accessibility"],
    weights: { accessibility: 1 },
  },
  heuristic_eval: {
    id: "heuristic_eval",
    label: "Heuristic Evaluation",
    short: "Nielsen 10",
    description: "Classic NN/g heuristic walkthrough. Usability heuristics only.",
    pillars: ["usability"],
    weights: { usability: 1 },
  },
  ai_feature_review: {
    id: "ai_feature_review",
    label: "AI Feature Review",
    short: "HAX + PAIR",
    description: "For AI-driven UI. Weighted toward AI-native patterns and usability.",
    pillars: ["usability", "ai_native", "ethics"],
    weights: { ai_native: 0.5, usability: 0.35, ethics: 0.15 },
  },
  ethics_sweep: {
    id: "ethics_sweep",
    label: "Ethics & Dark-Pattern Sweep",
    short: "Deceptive-pattern audit",
    description: "WSG sustainability + dark-pattern taxonomy + consent UX.",
    pillars: ["ethics", "accessibility"],
    weights: { ethics: 0.7, accessibility: 0.3 },
  },
  motion_review: {
    id: "motion_review",
    label: "Motion Review",
    short: "Timing · easing · reduced-motion",
    description:
      "Upload a short screen recording or storyboard frames. Audits perceived duration, easing, staging, and prefers-reduced-motion cues (WCAG 2.2.2 / 2.3.3, Material Motion, Apple HIG).",
    pillars: ["motion"],
    weights: { motion: 1 },
  },
};

export const RITUAL_MODE_ORDER: RitualMode[] = [
  "quick_take",
  "design_review",
  "accessibility_audit",
  "heuristic_eval",
  "ai_feature_review",
  "ethics_sweep",
  "motion_review",
];

