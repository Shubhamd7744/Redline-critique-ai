import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

export const getPublicCritique = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ slug: z.string().min(4) }).parse(d))
  .handler(async ({ data }) => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("Backend not configured");

    const supabase = createClient<Database>(url, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });

    const { data: row, error } = await supabase
      .from("critiques")
      .select("id, title, image_path, rubric, issues, summary, overall_score, status, is_public, share_slug, created_at")
      .eq("share_slug", data.slug)
      .eq("is_public", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Not found");

    // Signed URL via admin (safe: only reached for public critiques)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed } = await supabaseAdmin.storage
      .from("designs")
      .createSignedUrl(row.image_path, 60 * 60);

    return { ...row, image_url: signed?.signedUrl ?? null };
  });
