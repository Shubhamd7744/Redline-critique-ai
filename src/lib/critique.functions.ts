import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { generateText } from "ai";
import type { CritiquePayload } from "./critique-types";

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

const SYSTEM_PROMPT = `You are a senior UX/UI design director doing a rigorous, opinionated redline of a design mockup.

Grade the design on six principles, each 0.0-10.0:
- hierarchy: visual hierarchy and information priority
- contrast: color contrast and legibility
- typography: type scale, rhythm, pairing
- spacing: alignment, rhythm, whitespace
- accessibility: WCAG contrast, tap targets, focus states
- consistency: components, patterns, styles

Also produce 4-8 prioritized issues. Each issue has:
- severity: "critical" (breaks core usability/WCAG), "suggested" (meaningful improvement), "polish" (nice-to-have)
- principle: one of the six above
- title: short, specific (max 80 chars)
- description: what's wrong and why
- fix: concrete, actionable instruction
- x, y: normalized coordinates 0-1 of where on the image the issue lives (0,0 top-left; 1,1 bottom-right)

Respond ONLY with a JSON object matching this exact shape:
{
  "rubric": { "hierarchy": n, "contrast": n, "typography": n, "spacing": n, "accessibility": n, "consistency": n },
  "issues": [{ "id": "01", "severity": "...", "principle": "...", "title": "...", "description": "...", "fix": "...", "x": 0.0, "y": 0.0 }],
  "summary": "one-sentence overall verdict",
  "overall_score": n
}

Be direct and specific. No generic advice. Ground every issue in a real principle.`;

export const analyzeCritique = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("critiques")
      .select("id, image_path, status")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !row) throw new Error("Critique not found");

    // Signed URL for the AI to fetch
    const { data: signed, error: sErr } = await context.supabase.storage
      .from("designs")
      .createSignedUrl(row.image_path, 60 * 10);
    if (sErr || !signed?.signedUrl) throw new Error("Could not access image");

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

    try {
      const gateway = createLovableAiGatewayProvider(apiKey);
      const model = gateway("google/gemini-3-flash-preview");

      const result = await generateText({
        model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: SYSTEM_PROMPT },
              { type: "image", image: new URL(signed.signedUrl) },
            ],
          },
        ],
      });

      const text = result.text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Model did not return JSON");
      const parsed = JSON.parse(jsonMatch[0]) as CritiquePayload;

      // Basic normalization
      const clamp = (n: number) => Math.max(0, Math.min(10, Number(n) || 0));
      parsed.rubric = {
        hierarchy: clamp(parsed.rubric.hierarchy),
        contrast: clamp(parsed.rubric.contrast),
        typography: clamp(parsed.rubric.typography),
        spacing: clamp(parsed.rubric.spacing),
        accessibility: clamp(parsed.rubric.accessibility),
        consistency: clamp(parsed.rubric.consistency),
      };
      parsed.overall_score = clamp(parsed.overall_score);
      parsed.issues = (parsed.issues ?? []).slice(0, 12).map((i, idx) => ({
        ...i,
        id: i.id ?? String(idx + 1).padStart(2, "0"),
        x: Math.max(0.02, Math.min(0.98, Number(i.x) || 0.5)),
        y: Math.max(0.02, Math.min(0.98, Number(i.y) || 0.5)),
      }));

      const { error: updErr } = await context.supabase
        .from("critiques")
        .update({
          status: "complete",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          rubric: parsed.rubric as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          issues: parsed.issues as any,
          summary: parsed.summary,
          overall_score: parsed.overall_score,
        })
        .eq("id", data.id);
      if (updErr) throw new Error(updErr.message);

      return { ok: true };
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: Record<string, any> = {};

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
