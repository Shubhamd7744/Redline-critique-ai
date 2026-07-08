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
      { title: "Archive — Redline" },
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
        <p className="font-mono text-[11px] uppercase tracking-widest text-primary mb-4">Archive</p>
        <div className="flex items-end justify-between mb-8 border-b border-border pb-4">
          <h1 className="font-serif italic text-5xl">Your critiques.</h1>
          <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            {critiques.data?.length ?? 0} entries · {projects.data?.length ?? 0} projects
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-12">
          <div className="md:col-span-8">
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground mb-4">
              Quick critique · unfiled
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
          <h2 className="font-serif italic text-4xl">Recent critiques</h2>
        </div>
        {critiques.data && critiques.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No critiques yet. Upload a mockup above to begin.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {critiques.data?.map((c) => (
              <Link
                key={c.id}
                to="/critiques/$id"
                params={{ id: c.id }}
                className="group cursor-pointer"
              >
                <div className="aspect-video bg-white border border-border p-2 mb-3 group-hover:border-primary transition-colors">
                  <div className="w-full h-full bg-stone-panel grid place-items-center">
                    <span className="font-mono text-[10px] uppercase text-muted-foreground">
                      {c.status === "analyzing" ? "Analyzing…" : c.status === "failed" ? "Failed" : "Complete"}
                    </span>
                  </div>
                </div>
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium truncate">{c.title}</p>
                    <p className="text-[11px] font-mono text-muted-foreground">
                      {new Date(c.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  {c.overall_score != null && (
                    <span className="font-mono text-[11px] px-1.5 py-0.5 bg-stone-100 rounded shrink-0">
                      {Number(c.overall_score).toFixed(1)}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
