import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "get_critique",
  title: "Get critique",
  description:
    "Fetch a full Redline Critique review by id — rubric scores, prioritized issues, summary, and overall score.",
  inputSchema: {
    id: z.string().uuid().describe("Critique UUID (from list_critiques)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ id }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("critiques")
      .select("id, title, status, overall_score, summary, rubric, issues, project_id, created_at, image_path")
      .eq("id", id)
      .maybeSingle();
    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data)
      return { content: [{ type: "text", text: "Critique not found" }], isError: true };

    let imageUrl: string | null = null;
    if (data.image_path) {
      const { data: signed } = await supabase.storage
        .from("designs")
        .createSignedUrl(data.image_path, 60 * 60);
      imageUrl = signed?.signedUrl ?? null;
    }
    const { image_path, ...safe } = data;
    const payload = { ...safe, image_url: imageUrl };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
