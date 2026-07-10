import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { logAndThrow, PublicMessages } from "./server-errors";


// ---------- Projects ----------

export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("projects")
      .select("id, name, description, created_at")
      .order("created_at", { ascending: false });
    if (error) logAndThrow(PublicMessages.loadFailed, error);
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
    if (error) logAndThrow(PublicMessages.saveFailed, error);
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
    if (error) logAndThrow(PublicMessages.loadFailed, error);
    if (!project) throw new Error("Project not found");

    const { data: critiques, error: cErr } = await context.supabase
      .from("critiques")
      .select("id, title, status, overall_score, image_path, created_at")
      .eq("project_id", data.id)
      .order("created_at", { ascending: false });
    if (cErr) logAndThrow(PublicMessages.loadFailed, cErr);


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
    if (error) logAndThrow(PublicMessages.loadFailed, error);
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
    if (error) logAndThrow(PublicMessages.loadFailed, error);
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

// Server-side hard cap on decoded image bytes. Client enforces 20MB;
// keep server slightly higher for encoding overhead but bounded so a
// malicious client can't stream unbounded data.
const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // 25 MB
// Base64 encodes 3 bytes as 4 chars, so max base64 length ≈ ceil(N/3)*4.
const MAX_IMAGE_B64_LEN = Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 4;

export const uploadCritique = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        projectId: z.string().uuid().nullable(),
        title: z.string().min(1).max(160),
        fileBase64: z
          .string()
          .min(20)
          .max(MAX_IMAGE_B64_LEN, "File is too large.")
          .regex(/^[A-Za-z0-9+/=]+$/, "Invalid file encoding."),
        mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const extMap: Record<string, string> = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
    };
    const ext = extMap[data.mimeType];
    // Path is scoped to the user's UUID folder — RLS on storage.objects
    // isolates each user's uploads. The filename is a random UUID so
    // uploads can't collide or overwrite existing objects.
    const path = `${context.userId}/${crypto.randomUUID()}.${ext}`;
    const bytes = Uint8Array.from(atob(data.fileBase64), (c) => c.charCodeAt(0));

    // Server-side size cap after decode (defense-in-depth vs. crafted base64).
    if (bytes.length > MAX_IMAGE_BYTES) {
      throw new Error("File is too large. Maximum 20MB.");
    }

    // Defense-in-depth: verify magic bytes match declared MIME type.
    // Rejects renamed/spoofed files, HTML/SVG disguised as an image,
    // and payloads that would never render as the claimed image type.
    const isPng =
      bytes.length > 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    const isJpeg =
      bytes.length > 3 &&
      bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isWebp =
      bytes.length > 12 &&
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
    const matches =
      (data.mimeType === "image/png" && isPng) ||
      (data.mimeType === "image/jpeg" && isJpeg) ||
      (data.mimeType === "image/webp" && isWebp);
    if (!matches) {
      throw new Error(
        "MIME_MISMATCH: The file's contents don't match its extension. It may be renamed, corrupted, or not a real image.",
      );
    }


    const { error: upErr } = await context.supabase.storage
      .from("designs")
      .upload(path, bytes, { contentType: data.mimeType, upsert: false });
    if (upErr) logAndThrow(PublicMessages.uploadFailed, upErr);

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
    if (error) logAndThrow(PublicMessages.uploadFailed, error);


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
            "motion_review",
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
    if (error || !row) {
      if (error) console.error("[server] analyzeCritique lookup:", error);
      throw new Error("Critique not found");
    }

    const { data: signed, error: sErr } = await context.supabase.storage
      .from("designs")
      .createSignedUrl(row.image_path, 60 * 10);
    if (sErr || !signed?.signedUrl) logAndThrow(PublicMessages.imageUnavailable, sErr);

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) logAndThrow(PublicMessages.serverMisconfigured, "Missing LOVABLE_API_KEY");


    try {
      const { runDetectors } = await import("./detectors.server");
      const { runPerspectives } = await import("./perspectives.server");
      const { RITUAL_MODES } = await import("./critique-types");

      // Detectors (six-pillar framework audit) and perspectives (four user
      // archetypes) are decorrelated — run them in parallel so the persona
      // read isn't gated on framework analysis.
      const [merged, perspectives] = await Promise.all([
        runDetectors(signed.signedUrl, apiKey, data.mode),
        runPerspectives(signed.signedUrl, apiKey),
      ]);
      const expectedPillars = RITUAL_MODES[data.mode].pillars.length;

      if (merged.detector_errors.length === expectedPillars) {
        throw new Error(PublicMessages.analysisFailed);
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
            perspectives,
          } as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          issues: merged.detector_findings as any,
          summary: merged.summary,
          overall_score: merged.overall_score,
        })
        .eq("id", data.id);
      if (updErr) logAndThrow(PublicMessages.saveFailed, updErr);

      return { ok: true, pillar_scores: merged.pillar_scores };
    } catch (e) {
      // Log full error server-side; store detail in the row for the owner UI,
      // but surface a generic message to the client.
      console.error("[server] analyzeCritique failed:", e);
      const internal = e instanceof Error ? e.message : String(e);
      await context.supabase
        .from("critiques")
        .update({ status: "failed", error_message: internal })
        .eq("id", data.id);
      throw new Error(PublicMessages.analysisFailed);
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
    if (error || !row) {
      if (error) console.error("[server] toggleShare lookup:", error);
      throw new Error(PublicMessages.notFound);
    }

    const nextPublic = !row.is_public;
    const slug = row.share_slug ?? crypto.randomUUID().slice(0, 10);

    const { error: uErr } = await context.supabase
      .from("critiques")
      .update({ is_public: nextPublic, share_slug: slug })
      .eq("id", data.id);
    if (uErr) logAndThrow(PublicMessages.saveFailed, uErr);


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
    if (error || !row) {
      if (error) console.error("[server] updateShareSettings lookup:", error);
      throw new Error(PublicMessages.notFound);
    }


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
    if (uErr) logAndThrow(PublicMessages.saveFailed, uErr);

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
    if (error) logAndThrow(PublicMessages.deleteFailed, error);
    return { ok: true };
  });
