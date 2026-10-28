import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getProject } from "@/lib/critique.functions";
import { UploadDropzone } from "@/components/upload-dropzone";

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  head: () => ({ meta: [{ title: "Project — Redline Critique" }, { name: "robots", content: "noindex" }] }),
  component: ProjectPage,
});

function ProjectPage() {
  const { projectId } = Route.useParams();
  const fn = useServerFn(getProject);
  const q = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => fn({ data: { id: projectId } }),
  });

  if (q.isLoading) {
    return <main className="max-w-7xl mx-auto px-6 py-12 font-mono text-[11px] text-muted-foreground">Loading…</main>;
  }
  if (q.error || !q.data) {
    return (
      <main className="max-w-7xl mx-auto px-6 py-12">
        <p className="text-sm text-muted-foreground">Project not found.</p>
        <Link to="/dashboard" className="text-primary text-sm">← Back to dashboard</Link>
      </main>
    );
  }

  const { project, critiques } = q.data;

  return (
    <main className="max-w-7xl mx-auto px-6 py-12">
      <Link to="/dashboard" className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-primary mb-4 inline-block">
        ← Dashboard
      </Link>
      <div className="flex items-end justify-between border-b border-border pb-6 mb-12">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-primary mb-2">Project</p>
          <h1 className="font-serif italic text-5xl">{project.name}</h1>
          {project.description && (
            <p className="text-sm text-muted-foreground mt-2">{project.description}</p>
          )}
        </div>
        <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          {critiques.length} critiques
        </span>
      </div>

      <div className="mb-16">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground mb-4">
          Add critique
        </p>
        <UploadDropzone projectId={projectId} />
      </div>

      <section>
        <h2 className="font-serif italic text-3xl mb-6">Iterations</h2>
        {critiques.length === 0 ? (
          <p className="text-sm text-muted-foreground">Upload a mockup above to start.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {critiques.map((c) => (
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

        {critiques.length >= 2 && (
          <div className="mt-8">
            <Link
              to="/critiques/$id/compare"
              params={{ id: critiques[0].id }}
              className="inline-block px-4 py-2 border border-border rounded-sm text-sm font-medium hover:bg-muted"
            >
              Compare iterations →
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
