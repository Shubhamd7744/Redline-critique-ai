
# Redline — AI Design Critique

Editorial-technical critique tool matching the selected direction: Cormorant Garamond italic serif + Inter + JetBrains Mono, warm off-white paper (#FDFCFB) with red-pen accent (#C23934).

## Scope (v1)

- Public landing with upload CTA
- Google + email/password auth
- Upload design → AI analyzes → results view (annotated canvas + scored rubric + prioritized issues)
- Projects dashboard (group multiple designs under a project)
- Side-by-side compare (v1 vs v2 with score delta)
- Public shareable critique link (read-only)

## Stack

- TanStack Start + TanStack Query + shadcn/ui + Tailwind v4
- Lovable Cloud (Supabase) for auth, storage, database
- Lovable AI Gateway with `google/gemini-3-flash-preview` (multimodal: image → structured JSON critique)

## Design tokens (`src/styles.css`)

Overwrite tokens with the prototype's palette (oklch):
- background `#FDFCFB`, foreground `#1A1918`, muted `#73716E`, primary `#C23934`, border `#E5E2DE`, card `#FFFFFF`
- Fonts loaded via `<link>` in `__root.tsx` head: Cormorant Garamond italic 600, Inter 400/500/600, JetBrains Mono 400/500
- `--font-serif`, `--font-sans`, `--font-mono` registered in `@theme`

## Database (Lovable Cloud)

```
projects (id, user_id, name, description, created_at)
critiques (
  id, project_id, user_id,
  title, image_path,        -- storage path
  status,                   -- 'analyzing' | 'complete' | 'failed'
  overall_score numeric,
  rubric jsonb,             -- {hierarchy, contrast, typography, spacing, accessibility, consistency}
  issues jsonb,             -- [{id, severity, principle, title, description, fix, x, y}]
  share_slug text unique,   -- for public links
  is_public boolean default false,
  created_at
)
profiles (id -> auth.users, display_name, avatar_url)
```

- Storage bucket `designs` (private) with signed URLs
- RLS: users read/write only their own rows; public SELECT on `critiques` where `is_public = true`
- GRANTs on all public-schema tables; profile auto-created via trigger

## Server functions (`src/lib/*.functions.ts`)

- `uploadCritique({ projectId, fileBase64, filename })` — auth'd; stores image, inserts row with `status='analyzing'`, kicks off AI call, returns critique id
- `analyzeCritique({ critiqueId })` — auth'd; fetches signed image URL, calls Lovable AI Gateway with multimodal prompt returning strict JSON (rubric + issues), updates row. Prompt asks for scores 0-10 per principle and 4-8 issues with severity + normalized x/y pin coordinates + concrete fix.
- `listProjects`, `listCritiques(projectId)`, `getCritique(id)` — auth'd
- `toggleShare(critiqueId)` — generates `share_slug`, flips `is_public`
- `getPublicCritique(slug)` — no auth; reads via server publishable client against public RLS policy

Handle 429/402 gateway errors surfaced as toast.

## Routes

Public:
- `/` — landing (hero, upload dropzone that redirects to `/auth` if not signed in, methodology teaser)
- `/auth` — Google + email/password
- `/c/$slug` — public read-only critique view (with proper `head()` og tags derived from critique)

Authenticated (`_authenticated/`):
- `/dashboard` — Archive: projects grid + recent critiques
- `/projects/$projectId` — project detail with its critiques + "New Critique" upload
- `/critiques/$id` — results view: sticky annotated canvas (left, col-span-8) + rubric & issues panel (right, col-span-4). Analyzing state overlay while `status='analyzing'`, polled via TanStack Query.
- `/critiques/$id/compare` — pick another critique from same project → 2-column delta view with score diff

## Components

- `UploadDropzone` — drag/drop, converts to base64, calls `uploadCritique`
- `AnnotatedCanvas` — image + absolutely-positioned pins from `issues[].x/y`
- `RubricPanel` — 4-6 score rows with red primary color when score < 6
- `IssueList` — cards with severity chip (Critical red / Suggested neutral / Polish stone), principle label, fix text
- `AnalyzingState` — grayscale placeholder with mono "[SYSTEM] Scanning..." log lines from prototype
- `ProjectCard`, `CritiqueThumb` — matching prototype's archive grid
- `CompareView` — 2-column with center divider

## Head metadata

- Root: title "Redline — AI design critique", proper og/twitter, no og:image
- `/c/$slug`: dynamic head from loader with critique title + og:image = signed public image URL

## What we skip in v1

- Real-time collaboration
- PDF export
- Team workspaces
- Figma direct integration (upload PNG only)

Ready to enable Lovable Cloud and build.
