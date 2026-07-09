import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "@/integrations/supabase/client";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 font-sans">
      <div className="max-w-md text-center">
        <p className="font-mono text-[11px] uppercase tracking-widest text-primary mb-4">404 / Not Found</p>
        <h1 className="font-serif italic text-6xl mb-4">Off the grid.</h1>
        <p className="text-sm text-muted-foreground mb-6">
          The page you're looking for isn't in the archive.
        </p>
        <Link
          to="/"
          className="inline-flex items-center justify-center rounded-sm bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
        >
          Return home
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="font-mono text-[11px] uppercase tracking-widest text-primary mb-4">System error</p>
        <h1 className="font-serif italic text-4xl mb-4">Something didn't render.</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Try again, or return home.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="inline-flex items-center justify-center rounded-sm bg-foreground px-4 py-2 text-sm font-medium text-background"
          >
            Try again
          </button>
          <a href="/" className="inline-flex items-center justify-center rounded-sm border px-4 py-2 text-sm font-medium">
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Redline Critique — AI design critique" },
      {
        name: "description",
        content:
          "Redline Critique delivers a senior-level AI redline of your UX/UI — hierarchy, contrast, typography, spacing, and accessibility, grounded in real design principles.",
      },
      { name: "author", content: "Redline Critique" },
      { property: "og:title", content: "Redline Critique — AI design critique" },
      { property: "og:description", content: "Redline Critique delivers a senior-level AI redline of your UX/UI — hierarchy, contrast, typography, spacing, and accessibility, grounded in real design principles." },
      { property: "og:site_name", content: "Redline Critique" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Redline Critique — AI design critique" },
      { name: "twitter:description", content: "Redline Critique delivers a senior-level AI redline of your UX/UI — hierarchy, contrast, typography, spacing, and accessibility, grounded in real design principles." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/1d4caab2-21f1-41b5-a15d-b9a7c1f8827c/id-preview-c9c1a567--9c446c8c-ebbb-45ef-a3b4-0cfe5ce10dab.lovable.app-1783554247691.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/1d4caab2-21f1-41b5-a15d-b9a7c1f8827c/id-preview-c9c1a567--9c446c8c-ebbb-45ef-a3b4-0cfe5ce10dab.lovable.app-1783554247691.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@1,500;1,600;1,700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => sub.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster position="top-right" theme="light" />
    </QueryClientProvider>
  );
}
