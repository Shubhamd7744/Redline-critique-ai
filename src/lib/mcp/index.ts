import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listCritiquesTool from "./tools/list-critiques";
import getCritiqueTool from "./tools/get-critique";
import listProjectsTool from "./tools/list-projects";
import createProjectTool from "./tools/create-project";

// The OAuth issuer MUST be the direct Supabase host. On publish, SUPABASE_URL is
// rewritten to the `.lovable.cloud` proxy, which mcp-js rejects. The project ref
// is the only Supabase value that survives publish unchanged — Vite inlines
// import.meta.env.VITE_SUPABASE_PROJECT_ID as a literal at build time.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "redline-critique-mcp",
  title: "Redline Critique",
  version: "0.1.0",
  instructions:
    "Tools to read and manage the signed-in user's Redline Critique design reviews and projects. Use list_critiques to browse recent reviews, get_critique to read rubric scores and prioritized issues for one review, and list_projects / create_project to manage project groupings. All tools act as the authenticated user under row-level security.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listCritiquesTool, getCritiqueTool, listProjectsTool, createProjectTool],
});
