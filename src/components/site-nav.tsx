import { Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function SiteNav() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setEmail(s?.user?.email ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    router.navigate({ to: "/", replace: true });
  }

  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 bg-background/80 backdrop-blur-md border-b border-border">
      <div className="flex items-center gap-8">
        <Link to="/" className="font-serif italic text-2xl tracking-tight">
          Redline Critique
        </Link>
        <div className="hidden md:flex gap-6 text-[13px] font-medium tracking-wide uppercase text-muted-foreground">
          {email ? (
            <>
              <Link to="/dashboard" className="hover:text-foreground transition-colors">Archive</Link>
            </>
          ) : (
            <>
              <a href="/#methodology" className="hover:text-foreground transition-colors">Methodology</a>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4">
        {email ? (
          <>
            <span className="hidden md:inline text-[11px] font-mono text-muted-foreground">{email}</span>
            <button
              onClick={signOut}
              className="px-4 py-1.5 border border-border text-[13px] font-medium rounded-sm hover:bg-muted transition-colors"
            >
              Sign out
            </button>
          </>
        ) : (
          <Link to="/auth" className="px-4 py-1.5 bg-foreground text-background text-[13px] font-medium rounded-sm">
            Sign In
          </Link>
        )}
      </div>
    </nav>
  );
}
