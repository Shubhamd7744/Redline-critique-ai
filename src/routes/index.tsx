import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { SiteNav } from "@/components/site-nav";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function LandingPage() {
  const navigate = useNavigate();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const uploadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthed(!!data.user));
  }, []);

  function handleCTA() {
    if (authed) navigate({ to: "/dashboard" });
    else navigate({ to: "/auth" });
  }

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/10 selection:text-primary">
      <SiteNav />
      <main className="max-w-7xl mx-auto px-6 py-12">
        <section className="mb-32 animate-fade-in">
          <div className="max-w-3xl mb-12">
            <p className="font-mono text-[11px] uppercase tracking-widest text-primary mb-6">
              AI design critique · v1
            </p>
            <h1 className="font-serif italic text-6xl md:text-8xl text-balance leading-[0.9] mb-8">
              Critique is the <span className="text-primary">highest</span> form of respect.
            </h1>
            <p className="text-lg text-muted-foreground max-w-xl text-pretty leading-relaxed">
              Automated visual analysis for teams who value precision over speed. Upload your
              mockups for a senior-level redline of hierarchy, contrast, typography, and
              accessibility.
            </p>
            <div className="mt-8 flex gap-3">
              <button
                onClick={handleCTA}
                className="px-6 py-3 bg-foreground text-background text-sm font-medium rounded-sm hover:bg-foreground/90 transition-colors"
              >
                {authed ? "Go to archive" : "Sign in to critique"}
              </button>
              <a
                href="#methodology"
                className="px-6 py-3 border border-border text-sm font-medium rounded-sm hover:bg-muted transition-colors"
              >
                Methodology
              </a>
            </div>
          </div>

          <div
            ref={uploadRef}
            onClick={handleCTA}
            className="group relative border-2 border-dashed border-border rounded-sm h-[400px] flex flex-col items-center justify-center bg-white/50 transition-all hover:border-primary/40 hover:bg-white cursor-pointer"
          >
            <div className="flex flex-col items-center gap-4 text-center p-8">
              <div className="size-12 rounded-full border border-border flex items-center justify-center bg-background group-hover:scale-110 transition-transform">
                <div className="size-2 bg-primary rounded-full" />
              </div>
              <div>
                <p className="font-medium text-lg">Drop mockup to initiate critique</p>
                <p className="text-sm text-muted-foreground">
                  {authed ? "PNG, JPG or WebP · max 20MB" : "Sign in to upload"}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="methodology" className="mb-32 grid grid-cols-1 md:grid-cols-12 gap-12">
          <div className="md:col-span-4">
            <p className="font-mono text-[11px] uppercase tracking-widest text-primary mb-4">
              Methodology
            </p>
            <h2 className="font-serif italic text-4xl mb-4">The rubric.</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Every critique grades six principles on a 0–10 scale, then produces a prioritized
              list of issues tied to the principle they violate.
            </p>
          </div>
          <div className="md:col-span-8 space-y-3">
            {[
              ["Visual Hierarchy", "Where does the eye go first? Is priority correct?"],
              ["Color Contrast", "WCAG AA/AAA compliance for text and interactive elements."],
              ["Typography", "Scale, pairing, tracking, and rhythm."],
              ["Spacing", "Alignment, whitespace, and 8-point grid discipline."],
              ["Accessibility", "Focus states, tap targets, semantic clarity."],
              ["Consistency", "Component reuse, pattern discipline, style debt."],
            ].map(([name, desc]) => (
              <div key={name} className="flex items-start justify-between gap-8 border-b border-border pb-3">
                <div>
                  <p className="text-sm font-medium">{name}</p>
                  <p className="text-xs text-muted-foreground mt-1">{desc}</p>
                </div>
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  0.0 → 10.0
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-32 grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            ["01", "Upload", "Drop a screenshot, Figma export, or mockup image."],
            ["02", "Analyze", "The rubric grades six principles; issues are pinned to the canvas."],
            ["03", "Iterate", "Compare v1 → v2 to measure delta. Share a public critique link."],
          ].map(([n, t, d]) => (
            <div key={n} className="border-t border-border pt-6">
              <p className="font-mono text-[11px] uppercase text-primary mb-2">{n}</p>
              <h3 className="font-serif italic text-2xl mb-2">{t}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{d}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-border py-16 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between gap-8">
          <div className="max-w-sm">
            <span className="font-serif italic text-2xl tracking-tight mb-4 block">Redline Critique</span>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Precise, opinionated design critique for designers tired of generic feedback.
            </p>
          </div>
          <div className="flex gap-12 text-[12px] font-mono uppercase tracking-widest">
            <div className="space-y-2">
              <p className="font-bold">Index</p>
              <Link to="/" className="block text-muted-foreground hover:text-foreground">Home</Link>
              <Link to="/auth" className="block text-muted-foreground hover:text-foreground">Sign In</Link>
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto mt-12 pt-6 border-t border-border flex justify-between font-mono text-[10px] text-muted-foreground">
          <span>© {new Date().getFullYear()} Redline Critique</span>
          <span>Grounded in design principles</span>
        </div>
      </footer>
    </div>
  );
}
