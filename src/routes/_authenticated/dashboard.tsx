import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { listProjects, listCritiques, createProject } from "@/lib/critique.functions";
import { UploadDropzone } from "@/components/upload-dropzone";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Redline Critique" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const router = useRouter();
  const projectsFn = useServerFn(listProjects);
  const critiquesFn = useServerFn(listCritiques);
  const createProjectFn = useServerFn(createProject);
  const [newProjectName, setNewProjectName] = useState("");

  const projects = useQuery({ queryKey: ["projects"], queryFn: () => projectsFn() });
  const critiques = useQuery({ queryKey: ["critiques"], queryFn: () => critiquesFn() });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    try {
      const p = await createProjectFn({ data: { name: newProjectName.trim() } });
      setNewProjectName("");
      projects.refetch();
      if (p) router.navigate({ to: "/projects/$projectId", params: { projectId: p.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <main className="max-w-7xl mx-auto px-6 py-12">
      <section className="mb-16">
        <p className="font-mono text-[11px] uppercase tracking-widest text-primary mb-4">Overview</p>
        <div className="flex items-end justify-between mb-8 border-b border-border pb-4">
          <h1 className="font-serif italic text-5xl">Your critiques.</h1>
          <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            {critiques.data?.length ?? 0} entries · {projects.data?.length ?? 0} projects
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-12">
          <div className="md:col-span-8">
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground mb-4">
              New critique · saved unfiled
            </p>
            <UploadDropzone projectId={null} />
          </div>
          <div className="md:col-span-4">
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground mb-4">
              Projects
            </p>
            <form onSubmit={handleCreate} className="flex gap-2 mb-4">
              <input
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="New project"
                className="flex-1 border border-border rounded-sm px-3 py-2 text-sm bg-white focus:border-primary outline-none"
              />
              <button
                type="submit"
                className="px-3 py-2 bg-foreground text-background text-sm rounded-sm hover:bg-foreground/90"
              >
                Add
              </button>
            </form>
            <ul className="space-y-2">
              {projects.data?.map((p) => (
                <li key={p.id}>
                  <Link
                    to="/projects/$projectId"
                    params={{ projectId: p.id }}
                    className="flex items-center justify-between border-b border-border py-2 hover:text-primary transition-colors"
                  >
                    <span className="text-sm font-medium">{p.name}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {new Date(p.created_at).toLocaleDateString()}
                    </span>
                  </Link>
                </li>
              ))}
              {projects.data && projects.data.length === 0 && (
                <li className="text-sm text-muted-foreground">No projects yet.</li>
              )}
            </ul>
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-8 border-b border-border pb-4">
          <h2 className="font-serif italic text-4xl">Timeline</h2>
          <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            Chronological · newest first
          </span>
        </div>
        {critiques.data && critiques.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No critiques yet. Upload a mockup above to begin.
          </p>
        ) : (
          <CritiqueTimeline entries={critiques.data ?? []} projects={projects.data ?? []} />
        )}
      </section>
    </main>
  );
}

type CritiqueEntry = {
  id: string;
  title: string;
  status: string;
  overall_score: number | null;
  image_path: string;
  project_id: string | null;
  created_at: string;
};

type ProjectEntry = { id: string; name: string };

function groupLabel(date: Date): string {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayMs = 86_400_000;
  const diffDays = Math.floor((startOfDay(now) - startOfDay(date)) / dayMs);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return "Earlier this week";
  if (diffDays < 30) return "Earlier this month";
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(undefined, { month: "long" });
  }
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

const STATUS_STYLES: Record<string, string> = {
  analyzing: "bg-stone-100 text-muted-foreground",
  failed: "bg-primary/10 text-primary",
  complete: "bg-stone-200/60 text-foreground",
};

function CritiqueTimeline({
  entries,
  projects,
}: {
  entries: CritiqueEntry[];
  projects: ProjectEntry[];
}) {
  const projectMap = new Map(projects.map((p) => [p.id, p.name]));

  const groups: { label: string; items: CritiqueEntry[] }[] = [];
  for (const entry of entries) {
    const label = groupLabel(new Date(entry.created_at));
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(entry);
    else groups.push({ label, items: [entry] });
  }

  return (
    <div className="relative">
      <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" aria-hidden />
      <div className="space-y-12">
        {groups.map((group) => (
          <div key={group.label}>
            <div className="flex items-center gap-3 mb-4">
              <span className="relative z-10 size-[15px] rounded-full bg-primary ring-4 ring-background" />
              <p className="font-mono text-[11px] uppercase tracking-widest text-primary">
                {group.label}
              </p>
              <span className="flex-1 h-px bg-border" />
              <span className="font-mono text-[10px] text-muted-foreground">
                {group.items.length} {group.items.length === 1 ? "entry" : "entries"}
              </span>
            </div>
            <ul className="pl-8 space-y-3">
              {group.items.map((c) => {
                const time = new Date(c.created_at).toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                });
                const projectName = c.project_id ? projectMap.get(c.project_id) : null;
                return (
                  <li key={c.id} className="relative">
                    <span
                      className="absolute -left-[25px] top-4 size-[7px] rounded-full bg-border ring-2 ring-background"
                      aria-hidden
                    />
                    <Link
                      to="/critiques/$id"
                      params={{ id: c.id }}
                      className="group flex items-center gap-4 border border-border bg-white p-4 hover:border-primary transition-colors"
                    >
                      <span className="font-mono text-[10px] text-muted-foreground w-14 shrink-0">
                        {time}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                          {c.title}
                        </p>
                        <p className="text-[11px] font-mono text-muted-foreground truncate">
                          {projectName ? `${projectName} · ` : "Unfiled · "}
                          {new Date(c.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <span
                        className={`px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase shrink-0 ${
                          STATUS_STYLES[c.status] ?? STATUS_STYLES.complete
                        }`}
                      >
                        {c.status === "analyzing"
                          ? "Analyzing"
                          : c.status === "failed"
                            ? "Failed"
                            : "Complete"}
                      </span>
                      {c.overall_score != null && (
                        <span className="font-serif italic text-2xl shrink-0 w-10 text-right">
                          {Number(c.overall_score).toFixed(1)}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

