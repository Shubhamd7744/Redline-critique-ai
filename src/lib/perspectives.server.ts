/**
 * User-perspective critique layer.
 *
 * Four independent LLM calls, each role-playing a distinct user archetype
 * whose concerns map to *visible* design decisions. Every perspective must
 * produce concrete, checkable observations tied to what's on screen — not
 * generic opinion — so the reviewer can verify each claim against the image.
 *
 * Personas chosen for coverage (they don't overlap):
 *   1. First-Time Visitor   → discoverability, first 5s comprehension
 *   2. Power / Returning    → efficiency, density, shortcuts
 *   3. Accessibility User   → contrast, targets, focus, motion, alt-text cues
 *   4. Skeptical Buyer      → trust signals, credibility, dark-pattern radar
 */

import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

export type PerspectiveId = "first_time" | "power_user" | "accessibility" | "skeptic";

export interface PerspectiveObservation {
  observation: string; // what they see
  evidence: string;    // the concrete artefact grounding it
  impact: string;      // why it matters to this persona
}

export interface PerspectiveVerdict {
  id: PerspectiveId;
  persona: string;        // human-readable label
  goal: string;           // what this user is trying to do
  score: number;          // 0..10 from this persona's POV
  verdict: string;        // one-sentence gut reaction, first-person
  observations: PerspectiveObservation[]; // 2-3 items
  would_return: boolean;  // would this user come back / trust it?
  ok: boolean;
  error?: string;
}

const JSON_SHAPE = `Respond ONLY with JSON of this exact shape (no prose, no markdown):
{
  "score": 0-10,
  "verdict": "one sentence, first-person, natural voice — what you feel in the first few seconds",
  "would_return": true | false,
  "observations": [
    {
      "observation": "what you SEE (neutral, describes a visible element)",
      "evidence": "the concrete artefact — a label, a colour, a button size, a hierarchy choice",
      "impact": "why THIS persona reacts to it (not generic UX theory)"
    }
  ]
}
Return 2–3 observations. Every observation must be tied to a visible element — never invent copy or elements that aren't in the image. If the image is ambiguous, say so in the observation rather than guessing.`;

const PERSONAS: Record<
  PerspectiveId,
  { persona: string; goal: string; prompt: string }
> = {
  first_time: {
    persona: "First-Time Visitor",
    goal: "Understand what this is and whether it's for me — in under 5 seconds.",
    prompt: `You are a first-time visitor who has never seen this product before. You landed here from a link. You have 5 seconds to decide whether to keep reading or leave.

Judge only what you can see. Ask yourself:
- Is the primary value proposition legible without scrolling?
- Is there ONE obvious next action, or are you being asked to choose between several?
- Does the vocabulary match a normal person's mental model, or is it insider jargon?
- Do the visuals establish what category of product this is?

Speak in first person ("I see…", "I don't understand…"). Be honest about confusion. If something is clear and works, say so — do not manufacture criticism.
${JSON_SHAPE}`,
  },

  power_user: {
    persona: "Power / Returning User",
    goal: "Get to my task fast. I've used tools like this before.",
    prompt: `You are a returning power user who uses tools like this every day. You don't need onboarding. You want to complete your task with the fewest clicks and the least reading.

Judge only what you can see. Ask yourself:
- Where's the density? A power user tolerates — even prefers — information density.
- Are frequent actions promoted, or buried behind menus / modals?
- Are there visible shortcuts, keyboard hints, or bulk actions?
- Is the layout wasting screen real estate on marketing / whitespace where a control belongs?
- Is anything explaining what I already know (patronising empty states, "welcome" banners)?

Speak in first person. Be direct — power users are impatient. If the design respects your time, say so plainly.
${JSON_SHAPE}`,
  },

  accessibility: {
    persona: "Accessibility User",
    goal: "Use this the same way anyone else would — with a screen reader, keyboard, low vision, or limited motor control.",
    prompt: `You are a user who relies on assistive technology. You may be using a screen reader, keyboard-only navigation, a switch device, screen magnification, or you may have low vision or colour-vision deficiency.

Judge only what you can see. Ask yourself:
- Text contrast against its background — does body text look like it clears 4.5:1? Do UI controls clear 3:1?
- Target size — are interactive elements at least ~24×24px (WCAG 2.5.8)?
- Focus order and focus indicators — can you tell which element would be focused first?
- Is meaning carried by colour alone (red = error with no icon/text)?
- Are icon-only buttons paired with labels or are they ambiguous?
- Any motion/parallax that would need a reduced-motion fallback?

Cite specific WCAG 2.2 criteria in evidence when relevant (e.g. "1.4.3", "2.5.8"). Speak in first person about the friction you'd hit.
${JSON_SHAPE}`,
  },

  skeptic: {
    persona: "Skeptical Buyer",
    goal: "Decide whether to trust this and hand over my money or data.",
    prompt: `You are a cautious, skeptical buyer or evaluator. You've been burned before. You are actively scanning for reasons to leave.

Judge only what you can see. Ask yourself:
- Is pricing visible, or hidden behind "Contact us"?
- Are trust signals present (real logos, real testimonials with names, security marks, a company name in the footer)?
- Any dark patterns? Pre-checked opt-ins, confirmshaming ("No thanks, I hate saving money"), fake urgency countdowns, disguised ads, forced-continuity signup?
- Is the primary CTA honest, or does it obscure what happens on click ("Get started" vs "Start 14-day trial — card required")?
- Are claims backed with evidence, or are they vague superlatives ("world-class", "best-in-class") with nothing behind them?

Speak in first person. Be sharp. If the design earns trust, name what earned it.
${JSON_SHAPE}`,
  },
};

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : lo));

const str = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
};

function coerceObservation(raw: unknown): PerspectiveObservation | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const observation = str(r.observation);
  const evidence = str(r.evidence);
  const impact = str(r.impact);
  if (!observation || !evidence || !impact) return null;
  return { observation, evidence, impact };
}

async function runPerspective(
  id: PerspectiveId,
  imageUrl: string,
  apiKey: string,
): Promise<PerspectiveVerdict> {
  const spec = PERSONAS[id];
  try {
    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-3-flash-preview");

    const result = await generateText({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: spec.prompt },
            { type: "image", image: new URL(imageUrl) },
          ],
        },
      ],
    });

    const match = result.text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in perspective response");
    const parsed = JSON.parse(match[0]) as {
      score?: unknown;
      verdict?: unknown;
      would_return?: unknown;
      observations?: unknown;
    };

    const score = clamp(Number(parsed.score ?? 5), 0, 10);
    const verdict = str(parsed.verdict) ?? "No verdict provided.";
    const would_return = typeof parsed.would_return === "boolean" ? parsed.would_return : score >= 6;
    const observations = (Array.isArray(parsed.observations) ? parsed.observations : [])
      .map(coerceObservation)
      .filter((o): o is PerspectiveObservation => o !== null)
      .slice(0, 3);

    return {
      id,
      persona: spec.persona,
      goal: spec.goal,
      score,
      verdict,
      observations,
      would_return,
      ok: true,
    };
  } catch (e) {
    return {
      id,
      persona: spec.persona,
      goal: spec.goal,
      score: 5,
      verdict: "This perspective could not be generated.",
      observations: [],
      would_return: false,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function runPerspectives(
  imageUrl: string,
  apiKey: string,
): Promise<PerspectiveVerdict[]> {
  const ids: PerspectiveId[] = ["first_time", "power_user", "accessibility", "skeptic"];
  const settled = await Promise.allSettled(ids.map((id) => runPerspective(id, imageUrl, apiKey)));
  return settled.map((s, i) =>
    s.status === "fulfilled"
      ? s.value
      : {
          id: ids[i],
          persona: PERSONAS[ids[i]].persona,
          goal: PERSONAS[ids[i]].goal,
          score: 5,
          verdict: "This perspective could not be generated.",
          observations: [],
          would_return: false,
          ok: false,
          error: String(s.reason),
        },
  );
}
