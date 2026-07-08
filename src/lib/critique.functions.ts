import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// ---------- Projects ----------

export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("projects")
      .select("id, name, description, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ name: z.string().min(1).max(120), description: z.string().max(500).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("projects")
      .insert({ user_id: context.userId, name: data.name, description: data.description ?? null })
      .select("id, name, description, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const getProject = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: project, error } = await context.supabase
      .from("projects")
      .select("id, name, description, created_at")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!project) throw new Error("Project not found");

    const { data: critiques, error: cErr } = await context.supabase
      .from("critiques")
      .select("id, title, status, overall_score, image_path, created_at")
      .eq("project_id", data.id)
      .order("created_at", { ascending: false });
    if (cErr) throw new Error(cErr.message);

    return { project, critiques: critiques ?? [] };
  });

// ---------- Critiques ----------

export const listCritiques = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("critiques")
      .select("id, title, status, overall_score, image_path, project_id, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getCritique = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("critiques")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Critique not found");

    const { data: signed } = await context.supabase.storage
      .from("designs")
      .createSignedUrl(row.image_path, 60 * 60);

    const { share_password_hash, ...safe } = row;
    return {
      ...safe,
      has_password: !!share_password_hash,
      image_url: signed?.signedUrl ?? null,
    };
  });

export const uploadCritique = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        projectId: z.string().uuid().nullable(),
        title: z.string().min(1).max(160),
        fileBase64: z.string().min(20),
        mimeType: z.string().min(3),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ext = data.mimeType.split("/")[1] || "png";
    const path = `${context.userId}/${crypto.randomUUID()}.${ext}`;
    const bytes = Uint8Array.from(atob(data.fileBase64), (c) => c.charCodeAt(0));

    const { error: upErr } = await context.supabase.storage
      .from("designs")
      .upload(path, bytes, { contentType: data.mimeType, upsert: false });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    const { data: row, error } = await context.supabase
      .from("critiques")
      .insert({
        user_id: context.userId,
        project_id: data.projectId,
        title: data.title,
        image_path: path,
        status: "analyzing",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    return { id: row.id };
  });


export const analyzeCritique = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        mode: z
          .enum([
            "quick_take",
            "design_review",
            "accessibility_audit",
            "heuristic_eval",
            "ai_feature_review",
            "ethics_sweep",
          ])
          .default("design_review"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("critiques")
      .select("id, image_path, status")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !row) throw new Error("Critique not found");

    const { data: signed, error: sErr } = await context.supabase.storage
      .from("designs")
      .createSignedUrl(row.image_path, 60 * 10);
    if (sErr || !signed?.signedUrl) throw new Error("Could not access image");

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

    try {
      const { runDetectors } = await import("./detectors.server");
      const { RITUAL_MODES } = await import("./critique-types");
      const merged = await runDetectors(signed.signedUrl, apiKey, data.mode);
      const expectedPillars = RITUAL_MODES[data.mode].pillars.length;

      if (merged.detector_errors.length === expectedPillars) {
        throw new Error(
          `All detectors failed. First error: ${merged.detector_errors[0].error}`,
        );
      }

      const { error: updErr } = await context.supabase
        .from("critiques")
        .update({
          status: "complete",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          rubric: {
            ...merged.rubric,
            mode: merged.mode,
            pillar_scores: merged.pillar_scores,
            detector_errors: merged.detector_errors,
          } as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          issues: merged.detector_findings as any,
          summary: merged.summary,
          overall_score: merged.overall_score,
        })
        .eq("id", data.id);
      if (updErr) throw new Error(updErr.message);

      return { ok: true, pillar_scores: merged.pillar_scores };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await context.supabase
        .from("critiques")
        .update({ status: "failed", error_message: message })
        .eq("id", data.id);
      throw new Error(message);
    }
  });

export const toggleShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("critiques")
      .select("is_public, share_slug")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !row) throw new Error("Not found");

    const nextPublic = !row.is_public;
    const slug = row.share_slug ?? crypto.randomUUID().slice(0, 10);

    const { error: uErr } = await context.supabase
      .from("critiques")
      .update({ is_public: nextPublic, share_slug: slug })
      .eq("id", data.id);
    if (uErr) throw new Error(uErr.message);

    return { is_public: nextPublic, share_slug: slug };
  });

export const updateShareSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        isPublic: z.boolean().optional(),
        password: z.union([z.string().min(4).max(200), z.null()]).optional(),
        expiresAt: z.union([z.string().datetime(), z.null()]).optional(),
        rotateSlug: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("critiques")
      .select("share_slug, is_public")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !row) throw new Error("Not found");

    const update: {
      is_public?: boolean;
      share_slug?: string;
      share_password_hash?: string | null;
      share_expires_at?: string | null;
    } = {};

    if (typeof data.isPublic === "boolean") {
      update.is_public = data.isPublic;
      if (data.isPublic && !row.share_slug) {
        update.share_slug = crypto.randomUUID().slice(0, 10);
      }
    }

    if (data.rotateSlug) {
      update.share_slug = crypto.randomUUID().slice(0, 10);
    }

    if (data.password !== undefined) {
      if (data.password === null) {
        update.share_password_hash = null;
      } else {
        const { hashSharePassword } = await import("./share-password");
        update.share_password_hash = await hashSharePassword(data.password);
      }
    }

    if (data.expiresAt !== undefined) {
      update.share_expires_at = data.expiresAt;
    }

    const { error: uErr } = await context.supabase
      .from("critiques")
      .update(update)
      .eq("id", data.id);
    if (uErr) throw new Error(uErr.message);

    // Return the updated summary (never the hash)
    const { data: updated } = await context.supabase
      .from("critiques")
      .select("is_public, share_slug, share_expires_at, share_password_hash")
      .eq("id", data.id)
      .maybeSingle();

    return {
      is_public: updated?.is_public ?? false,
      share_slug: updated?.share_slug ?? null,
      share_expires_at: updated?.share_expires_at ?? null,
      has_password: !!updated?.share_password_hash,
    };
  });

export const deleteCritique = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("critiques")
      .select("image_path")
      .eq("id", data.id)
      .maybeSingle();
    if (row?.image_path) {
      await context.supabase.storage.from("designs").remove([row.image_path]);
    }
    const { error } = await context.supabase.from("critiques").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
