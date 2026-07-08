/**
 * Parallel detector layer.
 *
 * Six pillar detectors run independently against the same design image, each
 * with a narrow, principle-grounded prompt. Results are merged into the legacy
 * CritiquePayload shape (rubric + issues) that the UI already renders, while
 * preserving per-pillar scores and pillar/criterion tags on each finding for
 * future views.
 *
 * Decorrelation: each detector is its own LLM call with its own system prompt
 * and no shared state, mirroring the "silent review" phase of professional
 * design critique. Failures in one pillar do not sink the run — Promise.allSettled
 * degrades gracefully.
 */

import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import {
  RITUAL_MODES,
  validateCriterionId,
  validateSourceUrl,
  type RitualMode,
} from "./critique-types";
import type { CritiquePayload, Issue, Principle, Severity } from "./critique-types";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type Pillar =
  | "usability"
  | "accessibility"
  | "visual"
  | "ia_content"
  | "ai_native"
  | "ethics";

export interface DetectorFinding {
  pillar: Pillar;
  criterion_id: string; // e.g. "nielsen.h5", "wcag.2.5.8" (validated)
  principle: Principle; // legacy mapping for existing UI
  severity: Severity;
  title: string;

  // Four-slot schema
  observation: string;
  evidence: string;
  user_impact: string;
  fix_suggestion: string;

  source_url?: string; // validated https URL
  confidence: number; // 0..1
  x: number; // 0..1
  y: number; // 0..1
}

export interface DetectorResult {
  pillar: Pillar;
  score: number; // 0..10
  findings: DetectorFinding[];
  ok: boolean;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pillar prompts — each detector is grounded in one authoritative framework
// ─────────────────────────────────────────────────────────────────────────────

const JSON_SHAPE = `Respond ONLY with a JSON object of this exact shape (no prose, no markdown):
{
  "score": 0-10,
  "findings": [
    {
      "criterion": "string (e.g. nielsen.h5, wcag.2.5.8, hax.g3)",
      "principle": "hierarchy" | "contrast" | "typography" | "spacing" | "accessibility" | "consistency",
      "severity": "critical" | "suggested" | "polish",
      "title": "short specific finding (max 80 chars)",
      "description": "what is wrong and why (cite the principle)",
      "fix": "concrete direction (not a prescriptive solution)",
      "evidence": "the measured value or observed thing",
      "source": "canonical URL for the framework/criterion",
      "confidence": 0.0-1.0,
      "x": 0.0-1.0,
      "y": 0.0-1.0
    }
  ]
}
Only include a finding when you can name the criterion and point to evidence in the image.
Return an empty findings array rather than inventing findings. Cap at 6 findings.`;

const PILLAR_PROMPTS: Record<Pillar, string> = {
  usability: `You are auditing this design against Nielsen Norman Group's 10 Usability Heuristics and Norman's affordance/signifier/feedback/mapping principles.

Check for: visibility of system status (H1), match to real world / vocabulary (H2), user control and freedom (H3), consistency and standards (H4), error prevention (H5), recognition rather than recall (H6), flexibility and shortcuts (H7), aesthetic and minimalist design / density (H8), error message quality (H9), help and documentation (H10).

Map to legacy principle: usability → typically "hierarchy" or "consistency".
${JSON_SHAPE}`,

  accessibility: `You are auditing this design against WCAG 2.2 Level AA, including the criteria new in 2.2.

Check for: text contrast (1.4.3), non-text contrast (1.4.11), text spacing (1.4.12), focus visible (2.4.7), focus not obscured (2.4.11 — NEW in 2.2), target size ≥24×24px (2.5.8 — NEW), dragging alternatives (2.5.7 — NEW), redundant entry (3.3.7 — NEW), accessible authentication (3.3.8 — NEW), info & relationships / heading order (1.3.1).

Cite the criterion id (e.g. wcag.2.5.8) and the measured value (e.g. "20×20 button, threshold 24×24") in evidence. Source URLs live under https://www.w3.org/WAI/WCAG22/Understanding/.
Map to legacy principle: always "accessibility" or "contrast" (contrast findings).
${JSON_SHAPE}`,

  visual: `You are auditing this design against Material Design 3, Apple HIG, and Refactoring UI craft principles.

Check for: type scale consistency, spacing rhythm (4/8pt grid), color token discipline, alignment, corner-radius consistency, elevation/shadow consistency, icon stroke consistency, and — where visible — motion (duration bounds 80–500ms, easing category, prefers-reduced-motion cues).

Map to legacy principle: typography, spacing, or consistency depending on the finding.
${JSON_SHAPE}`,

  ia_content: `You are auditing this design against Rosenfeld/Morville information architecture and GOV.UK content design.

Check for: heading hierarchy depth, F/Z scan alignment, CTA count per view (>1 primary is a failure), reading grade / jargon, label-noun consistency (Save vs Submit vs Confirm mixed usage), information scent, empty/loading/error state coverage.

Map to legacy principle: "hierarchy" for structure findings, "consistency" for label/copy drift.
${JSON_SHAPE}`,

  ai_native: `You are auditing this design against the HAX guidelines (Microsoft), Google PAIR, and IBM Carbon-for-AI patterns — but ONLY if this UI contains AI-generated content or AI-driven affordances.

Check for: confidence / uncertainty disclosure, "why this?" affordance on generated content, feedback capture (thumbs / regenerate / edit), stop / undo for generative actions, disclosure that AI is involved, source citations on generated content, graceful failure states.

If the design has no AI surface, return score 10 and empty findings. Do not invent AI critique for non-AI screens.
Map to legacy principle: "consistency".
${JSON_SHAPE}`,

  ethics: `You are auditing this design against the W3C Web Sustainability Guidelines and the deceptive-pattern taxonomy (Brignull/Mathur), plus consent/privacy UX obligations.

Check for: pre-checked opt-ins, roach-motel cancel flows, confirmshaming copy, disguised ads, forced continuity, hidden costs, cookie-banner design, consent granularity, page-weight signals (heavy hero imagery, autoplay video), and unnecessary attention traps.

If nothing applies, return score 10 and empty findings.
Map to legacy principle: "consistency" (or "accessibility" for cookie/consent findings).
${JSON_SHAPE}`,
};

// Default pillar weights (used when a ritual mode doesn't specify its own).
const DEFAULT_PILLAR_WEIGHTS: Record<Pillar, number> = {
  usability: 0.25,
  accessibility: 0.25,
  visual: 0.2,
  ia_content: 0.15,
  ai_native: 0.08,
  ethics: 0.07,
};

// ─────────────────────────────────────────────────────────────────────────────
// Single-detector runner
// ─────────────────────────────────────────────────────────────────────────────

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : lo));

const PRINCIPLES: Principle[] = [
  "hierarchy",
  "contrast",
  "typography",
  "spacing",
  "accessibility",
  "consistency",
];

const SEVERITIES: Severity[] = ["critical", "suggested", "polish"];

function coerceFinding(raw: unknown, pillar: Pillar): DetectorFinding | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const principle = PRINCIPLES.includes(r.principle as Principle)
    ? (r.principle as Principle)
    : pillar === "accessibility"
      ? "accessibility"
      : "consistency";
  const severity = SEVERITIES.includes(r.severity as Severity)
    ? (r.severity as Severity)
    : "suggested";
  const title = typeof r.title === "string" ? r.title.slice(0, 120) : null;
  const description = typeof r.description === "string" ? r.description : null;
  const fix = typeof r.fix === "string" ? r.fix : null;
  if (!title || !description || !fix) return null;

  return {
    pillar,
    criterion: typeof r.criterion === "string" ? r.criterion : `${pillar}.unspecified`,
    principle,
    severity,
    title,
    description,
    fix,
    evidence: typeof r.evidence === "string" ? r.evidence : undefined,
    source: typeof r.source === "string" ? r.source : undefined,
    confidence: clamp(Number(r.confidence ?? 0.7), 0, 1),
    x: clamp(Number(r.x ?? 0.5), 0.02, 0.98),
    y: clamp(Number(r.y ?? 0.5), 0.02, 0.98),
  };
}

async function runDetector(
  pillar: Pillar,
  imageUrl: string,
  apiKey: string,
): Promise<DetectorResult> {
  try {
    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-3-flash-preview");

    const result = await generateText({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PILLAR_PROMPTS[pillar] },
            { type: "image", image: new URL(imageUrl) },
          ],
        },
      ],
    });

    const match = result.text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in detector response");
    const parsed = JSON.parse(match[0]) as { score?: unknown; findings?: unknown };

    const score = clamp(Number(parsed.score ?? 5), 0, 10);
    const rawFindings = Array.isArray(parsed.findings) ? parsed.findings : [];
    const findings = rawFindings
      .map((f) => coerceFinding(f, pillar))
      .filter((f): f is DetectorFinding => f !== null)
      .slice(0, 6);

    return { pillar, score, findings, ok: true };
  } catch (e) {
    return {
      pillar,
      score: 5,
      findings: [],
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Parallel runner + merger
// ─────────────────────────────────────────────────────────────────────────────

export interface MergedCritique extends CritiquePayload {
  mode: RitualMode;
  pillar_scores: Partial<Record<Pillar, number>>;
  detector_findings: DetectorFinding[];
  detector_errors: { pillar: Pillar; error: string }[];
}

export async function runDetectors(
  imageUrl: string,
  apiKey: string,
  mode: RitualMode = "design_review",
): Promise<MergedCritique> {
  const spec = RITUAL_MODES[mode];
  const pillars = spec.pillars as Pillar[];

  const settled = await Promise.allSettled(
    pillars.map((p) => runDetector(p, imageUrl, apiKey)),
  );

  const results: DetectorResult[] = settled.map((s, i) =>
    s.status === "fulfilled"
      ? s.value
      : { pillar: pillars[i], score: 5, findings: [], ok: false, error: String(s.reason) },
  );

  // Dedupe findings by (criterion + normalized title)
  const seen = new Set<string>();
  const allFindings: DetectorFinding[] = [];
  for (const r of results) {
    for (const f of r.findings) {
      const key = `${f.criterion}::${f.title.toLowerCase().replace(/\s+/g, " ").trim()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      allFindings.push(f);
    }
  }

  // Severity ordering; then by confidence desc; cap at 12 for the UI
  const sevRank: Record<Severity, number> = { critical: 0, suggested: 1, polish: 2 };
  allFindings.sort((a, b) => {
    const s = sevRank[a.severity] - sevRank[b.severity];
    return s !== 0 ? s : b.confidence - a.confidence;
  });
  const topFindings = allFindings.slice(0, 12);

  // Lookup: pillar → score (only for pillars that ran)
  const scoreOf = new Map<Pillar, number>();
  for (const r of results) scoreOf.set(r.pillar, r.score);

  // Legacy rubric per principle. Only include pillars that ran; fall back to
  // a neutral 7 when a principle has no contributing pillar in this mode
  // (so single-pillar rituals like Heuristic Eval don't leave the rubric
  // half-empty in the existing UI).
  const contribs: Record<Principle, Pillar[]> = {
    hierarchy: ["usability", "ia_content"],
    contrast: ["accessibility"],
    typography: ["visual"],
    spacing: ["visual"],
    accessibility: ["accessibility"],
    consistency: ["visual", "ai_native", "ethics"],
  };
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 7);
  const rubricScore = (principle: Principle) => {
    const xs = contribs[principle]
      .map((p) => scoreOf.get(p))
      .filter((v): v is number => typeof v === "number");
    return clamp(avg(xs), 0, 10);
  };
  const rubric = {
    hierarchy: rubricScore("hierarchy"),
    contrast: rubricScore("contrast"),
    typography: rubricScore("typography"),
    spacing: rubricScore("spacing"),
    accessibility: rubricScore("accessibility"),
    consistency: rubricScore("consistency"),
  };

  // Weighted overall — mode weights over pillars that ran, renormalized.
  const rawWeights = pillars.map((p) => ({
    pillar: p,
    score: scoreOf.get(p) ?? 5,
    weight: spec.weights[p] ?? DEFAULT_PILLAR_WEIGHTS[p],
  }));
  const weightSum = rawWeights.reduce((a, w) => a + w.weight, 0) || 1;
  const overall_score = clamp(
    rawWeights.reduce((acc, w) => acc + w.score * (w.weight / weightSum), 0),
    0,
    10,
  );

  const issues: Issue[] = topFindings.map((f, idx) => ({
    id: String(idx + 1).padStart(2, "0"),
    severity: f.severity,
    principle: f.principle,
    title: f.title,
    description: f.description,
    fix: f.fix,
    x: f.x,
    y: f.y,
  }));

  const okCount = results.filter((r) => r.ok).length;
  const critical = topFindings.filter((f) => f.severity === "critical").length;
  const noun = spec.pillars.length === 1 ? "pillar" : "pillars";
  const summary = critical
    ? `${critical} critical issue${critical === 1 ? "" : "s"} across ${okCount} audited ${noun} (${spec.label}).`
    : `No critical issues across ${okCount} audited ${noun} (${spec.label}).`;

  const pillar_scores: Partial<Record<Pillar, number>> = {};
  for (const r of results) pillar_scores[r.pillar] = r.score;

  const detector_errors = results
    .filter((r) => !r.ok)
    .map((r) => ({ pillar: r.pillar, error: r.error ?? "unknown" }));

  return {
    mode,
    rubric,
    issues,
    summary,
    overall_score,
    pillar_scores,
    detector_findings: topFindings,
    detector_errors,
  };
}
