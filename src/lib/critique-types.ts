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

export interface Issue {
  id: string;
  severity: Severity;
  principle: Principle;
  title: string;
  description: string;
  fix: string;
  x: number; // 0..1
  y: number; // 0..1
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
  | "ethics_sweep";

export interface RitualModeSpec {
  id: RitualMode;
  label: string;
  short: string;
  description: string;
  pillars: Array<"usability" | "accessibility" | "visual" | "ia_content" | "ai_native" | "ethics">;
  weights: Partial<
    Record<
      "usability" | "accessibility" | "visual" | "ia_content" | "ai_native" | "ethics",
      number
    >
  >;
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
};

export const RITUAL_MODE_ORDER: RitualMode[] = [
  "quick_take",
  "design_review",
  "accessibility_audit",
  "heuristic_eval",
  "ai_feature_review",
  "ethics_sweep",
];
