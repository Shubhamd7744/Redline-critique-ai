import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  getCritique,
  updateShareSettings,
  deleteCritique,
  analyzeCritique,
} from "@/lib/critique.functions";
import { ResultsView, AnalyzingState } from "@/components/critique-view";
import type { CritiquePayload } from "@/lib/critique-types";
import { RITUAL_MODE_ORDER, type RitualMode } from "@/lib/critique-types";
import { downloadCritiquePdf } from "@/lib/critique-pdf";

// A run that started more than this long ago and is still "analyzing" is
// almost certainly stranded (dropped request / worker restart), not live.
const STALE_RUN_MS = 3 * 60 * 1000;

export const Route = createFileRoute("/_authenticated/critiques/$id")({
  validateSearch: (search: Record<string, unknown>) => ({
    mode:
      typeof search.mode === "string" && (RITUAL_MODE_ORDER as string[]).includes(search.mode)
        ? (search.mode as RitualMode)
        : undefined,
  }),
  head: () => ({ meta: [{ title: "Critique — Redline" }, { name: "robots", content: "noindex" }] }),
  component: CritiquePage,
});

function CritiquePage() {
  const { id } = Route.useParams();
  const { mode: pendingMode } = Route.useSearch();
  const fn = useServerFn(getCritique);
  const updateFn = useServerFn(updateShareSettings);
  const deleteFn = useServerFn(deleteCritique);
  const analyzeFn = useServerFn(analyzeCritique);
  const [shareOpen, setShareOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const startedRef = useRef(false);

  const q = useQuery({
    queryKey: ["critique", id],
    queryFn: () => fn({ data: { id } }),
    refetchInterval: (query) => {
      const d = query.state.data;
      return d && d.status === "analyzing" ? 2500 : false;
    },
  });

  const runAnalysis = useCallback(
    async (mode: RitualMode) => {
      setRunning(true);
      try {
        await analyzeFn({ data: { id, mode } });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Analysis failed. Please try again.");
      } finally {
        setRunning(false);
        void q.refetch();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [analyzeFn, id],
  );

  // Kick off the run for a freshly uploaded critique. Owned here so the
  // request lives as long as the page the user is actually looking at.
  useEffect(() => {
    if (!pendingMode || startedRef.current) return;
    if (q.data?.status !== "analyzing") return;
    startedRef.current = true;
    void runAnalysis(pendingMode);
  }, [pendingMode, q.data?.status, runAnalysis]);

  async function handleDelete() {
    if (!confirm("Delete this critique? This cannot be undone.")) return;
    try {
      await deleteFn({ data: { id } });
      window.location.href = "/dashboard";
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }


  if (q.isLoading) {
    return (
      <main className="max-w-7xl mx-auto px-6 py-12">
        <AnalyzingState />
      </main>
    );
  }
  if (q.error || !q.data) {
    return (
      <main className="max-w-7xl mx-auto px-6 py-12">
        <p className="text-sm text-muted-foreground">Not found.</p>
      </main>
    );
  }

  const c = q.data;

  const runMeta = (c.rubric ?? null) as { mode?: string; started_at?: string } | null;
  const lastMode: RitualMode =
    runMeta?.mode && (RITUAL_MODE_ORDER as string[]).includes(runMeta.mode)
      ? (runMeta.mode as RitualMode)
      : (pendingMode ?? "design_review");
  const startedAt = runMeta?.started_at ? Date.parse(runMeta.started_at) : Date.parse(c.created_at);
  const isStranded =
    c.status === "analyzing" && !running && Date.now() - startedAt > STALE_RUN_MS;



  return (
    <main className="max-w-7xl mx-auto px-6 py-12">
      <div className="flex items-end justify-between border-b border-border pb-6 mb-12 gap-4">
        <div className="min-w-0">
          <Link
            to="/dashboard"
            className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-primary mb-2 inline-block"
          >
            ← Archive
          </Link>
          <h1 className="font-serif italic text-4xl truncate">{c.title}</h1>
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground mt-2">
            {new Date(c.created_at).toLocaleString()}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={async () => {
              if (c.status !== "complete" || !c.image_url || !c.rubric || !c.issues) return;
              try {
                await downloadCritiquePdf({
                  payload: {
                    rubric: c.rubric as unknown as CritiquePayload["rubric"],
                    issues: c.issues as unknown as CritiquePayload["issues"],
                    summary: c.summary ?? "",
                    overall_score: Number(c.overall_score ?? 0),
                  },
                  imageUrl: c.image_url,
                  title: c.title,
                  createdAt: c.created_at,
                });
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "PDF export failed");
              }
            }}
            disabled={c.status !== "complete"}
            className="px-3 py-2 border border-border rounded-sm text-sm font-medium hover:bg-primary hover:text-white hover:border-primary disabled:opacity-50"
          >
            Download PDF
          </button>
          <button
            onClick={() => setShareOpen(true)}
            disabled={c.status !== "complete"}
            className="px-3 py-2 border border-border rounded-sm text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            {c.is_public ? "Sharing…" : "Share"}
          </button>
          <button
            onClick={handleDelete}
            className="px-3 py-2 border border-border rounded-sm text-sm font-medium hover:bg-primary hover:text-white hover:border-primary"
          >
            Delete
          </button>
        </div>
      </div>

      {c.is_public && c.share_slug && (
        <div className="mb-8 p-3 border border-primary/20 bg-primary/5 rounded-sm text-xs font-mono flex items-center justify-between gap-3">
          <span className="flex items-center gap-3 flex-wrap">
            <span>Public link: /c/{c.share_slug}</span>
            {c.has_password && (
              <span className="px-1.5 py-0.5 bg-primary text-white text-[10px] uppercase tracking-widest">
                Password
              </span>
            )}
            {c.share_expires_at && (
              <span className="text-muted-foreground">
                Expires {new Date(c.share_expires_at).toLocaleString()}
              </span>
            )}
          </span>
          <span className="flex gap-3 shrink-0">
            <button
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/c/${c.share_slug}`);
                toast.success("Copied");
              }}
              className="text-primary underline"
            >
              Copy
            </button>
            <button onClick={() => setShareOpen(true)} className="text-primary underline">
              Manage
            </button>
          </span>
        </div>
      )}

      {shareOpen && (
        <ShareSettingsDialog
          critique={{
            id: c.id,
            is_public: c.is_public,
            share_slug: c.share_slug,
            share_expires_at: c.share_expires_at,
            has_password: c.has_password,
          }}
          onClose={() => setShareOpen(false)}
          onChange={() => q.refetch()}
          submit={(payload) => updateFn({ data: payload })}
        />
      )}

      {c.status === "analyzing" && (
        <>
          <AnalyzingState />
          {isStranded && !running && (
            <div className="mt-6 p-6 border border-primary/30 bg-primary/5 rounded-sm flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-widest text-primary mb-2">
                  This run stalled
                </p>
                <p className="text-sm text-muted-foreground max-w-xl">
                  The analysis didn't report back — usually a dropped connection on a very large
                  image. Your upload is safe; run it again.
                </p>
              </div>
              <RetryButton onClick={() => runAnalysis(lastMode)} running={running} />
            </div>
          )}
        </>
      )}
      {c.status === "failed" && (
        <div className="p-8 border border-primary/30 bg-primary/5 rounded-sm flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-primary mb-2">
              Analysis failed
            </p>
            <p className="text-sm text-muted-foreground max-w-xl">
              {c.error_message ?? "Unknown error"}
            </p>
          </div>
          <RetryButton onClick={() => runAnalysis(lastMode)} running={running} />
        </div>
      )}

      {c.status === "complete" && c.image_url && c.rubric && c.issues && (
        <ResultsView
          payload={{
            rubric: c.rubric as unknown as CritiquePayload["rubric"],
            issues: c.issues as unknown as CritiquePayload["issues"],
            summary: c.summary ?? "",
            overall_score: Number(c.overall_score ?? 0),
            perspectives:
              (c.rubric as { perspectives?: CritiquePayload["perspectives"] } | null)
                ?.perspectives ?? undefined,
          }}
          imageUrl={c.image_url}
          title={c.title}
          critiqueId={c.id}
          canEdit
          shareUrl={
            c.is_public && c.share_slug
              ? `${typeof window !== "undefined" ? window.location.origin : ""}/c/${c.share_slug}`
              : undefined
          }
        />
      )}
    </main>
  );
}

type ShareCritique = {
  id: string;
  is_public: boolean;
  share_slug: string | null;
  share_expires_at: string | null;
  has_password: boolean;
};

type SharePayload = {
  id: string;
  isPublic?: boolean;
  password?: string | null;
  expiresAt?: string | null;
  rotateSlug?: boolean;
};

function ShareSettingsDialog({
  critique,
  onClose,
  onChange,
  submit,
}: {
  critique: ShareCritique;
  onClose: () => void;
  onChange: () => void;
  submit: (payload: SharePayload) => Promise<unknown>;
}) {
  const [isPublic, setIsPublic] = useState(critique.is_public);
  const [passwordMode, setPasswordMode] = useState<"keep" | "set" | "clear">("keep");
  const [password, setPassword] = useState("");
  const [expiryMode, setExpiryMode] = useState<"keep" | "set" | "clear">("keep");
  const [expiresAt, setExpiresAt] = useState<string>(() => {
    if (!critique.share_expires_at) return "";
    // format for datetime-local
    const d = new Date(critique.share_expires_at);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const payload: SharePayload = { id: critique.id, isPublic };

    if (passwordMode === "set") {
      if (password.length < 4) {
        toast.error("Password must be at least 4 characters.");
        return;
      }
      payload.password = password;
    } else if (passwordMode === "clear") {
      payload.password = null;
    }

    if (expiryMode === "set") {
      if (!expiresAt) {
        toast.error("Pick an expiration date.");
        return;
      }
      const iso = new Date(expiresAt).toISOString();
      if (new Date(iso).getTime() <= Date.now()) {
        toast.error("Expiration must be in the future.");
        return;
      }
      payload.expiresAt = iso;
    } else if (expiryMode === "clear") {
      payload.expiresAt = null;
    }

    setSaving(true);
    try {
      await submit(payload);
      toast.success("Share settings updated");
      onChange();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  async function handleRevoke() {
    if (!confirm("Revoke the public link? Anyone with the URL will lose access.")) return;
    setSaving(true);
    try {
      await submit({ id: critique.id, isPublic: false, password: null, expiresAt: null });
      toast.success("Share revoked");
      onChange();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleRotate() {
    if (
      !confirm("Regenerate the share URL? The old link will stop working immediately.")
    )
      return;
    setSaving(true);
    try {
      await submit({ id: critique.id, rotateSlug: true });
      toast.success("New link generated");
      onChange();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSave}
        onClick={(e) => e.stopPropagation()}
        className="bg-background border border-border rounded-sm w-full max-w-lg p-6 shadow-2xl"
      >
        <div className="flex items-baseline justify-between mb-6">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-primary mb-1">
              Share settings
            </p>
            <h2 className="font-serif italic text-2xl">Public access</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-xs text-muted-foreground hover:text-primary"
          >
            Close
          </button>
        </div>

        {/* Public toggle */}
        <label className="flex items-center justify-between border-b border-border pb-4 mb-4 cursor-pointer">
          <span>
            <span className="block text-sm font-medium">Publicly accessible</span>
            <span className="block text-xs text-muted-foreground">
              Anyone with the link can view this critique.
            </span>
          </span>
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
            className="size-4 accent-primary"
          />
        </label>

        {/* Password */}
        <fieldset className="border-b border-border pb-4 mb-4" disabled={!isPublic}>
          <legend className="text-sm font-medium mb-2">Password protection</legend>
          <p className="text-xs text-muted-foreground mb-3">
            {critique.has_password
              ? "This link currently requires a password."
              : "No password is set."}
          </p>
          <div className="flex flex-col gap-2 font-mono text-xs">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="pw"
                checked={passwordMode === "keep"}
                onChange={() => setPasswordMode("keep")}
              />
              Keep as-is
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="pw"
                checked={passwordMode === "set"}
                onChange={() => setPasswordMode("set")}
              />
              Set a new password
            </label>
            {passwordMode === "set" && (
              <input
                type="text"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 4 characters"
                className="ml-6 border border-border rounded-sm px-2 py-1 bg-white text-sm"
              />
            )}
            {critique.has_password && (
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="pw"
                  checked={passwordMode === "clear"}
                  onChange={() => setPasswordMode("clear")}
                />
                Remove password
              </label>
            )}
          </div>
        </fieldset>

        {/* Expiration */}
        <fieldset className="border-b border-border pb-4 mb-6" disabled={!isPublic}>
          <legend className="text-sm font-medium mb-2">Expiration</legend>
          <p className="text-xs text-muted-foreground mb-3">
            {critique.share_expires_at
              ? `Currently expires ${new Date(critique.share_expires_at).toLocaleString()}.`
              : "No expiration set."}
          </p>
          <div className="flex flex-col gap-2 font-mono text-xs">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="exp"
                checked={expiryMode === "keep"}
                onChange={() => setExpiryMode("keep")}
              />
              Keep as-is
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="exp"
                checked={expiryMode === "set"}
                onChange={() => setExpiryMode("set")}
              />
              Set expiration
            </label>
            {expiryMode === "set" && (
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="ml-6 border border-border rounded-sm px-2 py-1 bg-white text-sm"
              />
            )}
            {critique.share_expires_at && (
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="exp"
                  checked={expiryMode === "clear"}
                  onChange={() => setExpiryMode("clear")}
                />
                Never expires
              </label>
            )}
          </div>
        </fieldset>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-foreground text-background text-sm rounded-sm hover:bg-foreground/90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          {critique.is_public && critique.share_slug && (
            <>
              <button
                type="button"
                onClick={handleRotate}
                disabled={saving}
                className="px-3 py-2 border border-border text-sm rounded-sm hover:bg-muted disabled:opacity-50"
              >
                Regenerate URL
              </button>
              <button
                type="button"
                onClick={handleRevoke}
                disabled={saving}
                className="px-3 py-2 border border-primary/40 text-primary text-sm rounded-sm hover:bg-primary hover:text-white ml-auto disabled:opacity-50"
              >
                Revoke access
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}


function RetryButton({ onClick, running }: { onClick: () => void; running: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={running}
      className="px-4 py-2 bg-primary text-white rounded-sm text-sm font-medium hover:opacity-90 disabled:opacity-50 shrink-0"
    >
      {running ? "Re-running…" : "Retry analysis"}
    </button>
  );
}
