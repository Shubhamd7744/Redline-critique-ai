import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { verifySharePassword } from "./share-password";

export type PublicCritiqueResult =
  | { kind: "not_found" }
  | { kind: "expired"; title: string; expires_at: string }
  | { kind: "locked"; title: string; error?: string }
  | {
      kind: "ok";
      id: string;
      title: string;
      image_path: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rubric: any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      issues: any;
      summary: string | null;
      overall_score: number | null;
      status: string;
      is_public: boolean;
      share_slug: string | null;
      share_expires_at: string | null;
      created_at: string;
      image_url: string | null;
    };

export const getPublicCritique = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ slug: z.string().min(4), password: z.string().max(200).optional() }).parse(d),
  )
  .handler(async ({ data }): Promise<PublicCritiqueResult> => {
    // Admin client so we can read password-protected rows and enforce the check in code.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row, error } = await supabaseAdmin
      .from("critiques")
      .select(
        "id, title, image_path, rubric, issues, summary, overall_score, status, is_public, share_slug, share_password_hash, share_expires_at, created_at",
      )
      .eq("share_slug", data.slug)
      .eq("is_public", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { kind: "not_found" };

    if (row.share_expires_at && new Date(row.share_expires_at).getTime() < Date.now()) {
      return { kind: "expired", title: row.title, expires_at: row.share_expires_at };
    }

    if (row.share_password_hash) {
      if (!data.password) return { kind: "locked", title: row.title };
      const ok = await verifySharePassword(data.password, row.share_password_hash);
      if (!ok) return { kind: "locked", title: row.title, error: "Incorrect password." };
    }

    const { data: signed } = await supabaseAdmin.storage
      .from("designs")
      .createSignedUrl(row.image_path, 60 * 60);

    const { share_password_hash: _pw, ...safe } = row;
    return { kind: "ok", ...safe, image_url: signed?.signedUrl ?? null };
  });
