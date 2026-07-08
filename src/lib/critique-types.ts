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
