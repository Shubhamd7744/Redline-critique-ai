import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Decision log for critique findings.
 *
 * Each finding on a critique can be marked accepted or rejected, with an
 * assigned owner, due date, and free-text decision note. Only the critique
 * owner can write; anyone who can already read the critique can read the
 * log (RLS enforces both). Reads happen client-side via the browser
 * Supabase client so the public share view works for anon viewers too.
 */

const decisionSchema = z.object({
  critiqueId: z.string().uuid(),
  findingId: z.string().min(1).max(64),
  decision: z.enum(["accepted", "rejected"]),
  owner: z.string().trim().max(120).nullable().optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
    .nullable()
    .optional(),
  decisionNote: z.string().trim().max(2000).nullable().optional(),
});

export const upsertFindingDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => decisionSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("finding_decisions")
      .upsert(
        {
          critique_id: data.critiqueId,
          finding_id: data.findingId,
          decision: data.decision,
          owner: data.owner ?? null,
          due_date: data.dueDate ?? null,
          decision_note: data.decisionNote ?? null,
          decided_by: context.userId,
        },
        { onConflict: "critique_id,finding_id" },
      )
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteFindingDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ critiqueId: z.string().uuid(), findingId: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("finding_decisions")
      .delete()
      .eq("critique_id", data.critiqueId)
      .eq("finding_id", data.findingId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
