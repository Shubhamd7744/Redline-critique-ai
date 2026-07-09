import { useServerFn } from "@tanstack/react-start";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { uploadCritique, analyzeCritique } from "@/lib/critique.functions";
import { RITUAL_MODES, RITUAL_MODE_ORDER, type RitualMode } from "@/lib/critique-types";

type Phase = "idle" | "reading" | "uploading" | "finalizing" | "error";

function readFileAsBase64(
  file: File,
  onProgress: (pct: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (e) => {
      if (e.lengthComputable) onProgress((e.loaded / e.total) * 100);
    };
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

function friendlyUploadError(raw: string, file: File): string {
  const msg = raw || "";
  if (/MIME_MISMATCH/i.test(msg)) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "file";
    return `This .${ext} file doesn't look like a real image inside. It may have been renamed from another format, exported incorrectly, or corrupted. Try re-exporting as PNG, JPG, or WebP.`;
  }
  if (/does not match declared image type/i.test(msg)) {
    return "The file's contents don't match its extension. Try re-exporting it as PNG, JPG, or WebP.";
  }
  if (/mimeType/i.test(msg) && /enum|invalid/i.test(msg)) {
    return "That image type isn't supported. Please upload a PNG, JPG, or WebP.";
  }
  if (/Upload failed/i.test(msg) && /storage|bucket/i.test(msg)) {
    return "We couldn't save your image to storage. Please try again in a moment.";
  }
  if (/fileBase64|too_small|min/i.test(msg)) {
    return "That file looks empty or unreadable. Try selecting it again.";
  }
  if (/network|fetch|Failed to fetch/i.test(msg)) {
    return "Network hiccup while uploading. Check your connection and try again.";
  }
  if (/Unauthorized|auth/i.test(msg)) {
    return "Your session expired. Please sign in again and retry.";
  }
  return msg || "Upload failed. Please try again.";
}

export function UploadDropzone({ projectId }: { projectId: string | null }) {
  const router = useRouter();
  const upload = useServerFn(uploadCritique);
  const analyze = useServerFn(analyzeCritique);
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [mode, setMode] = useState<RitualMode>("design_review");
  const tickRef = useRef<number | null>(null);

  const busy = phase === "reading" || phase === "uploading" || phase === "finalizing";

  useEffect(() => {
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, []);

  function startFakeProgress(from: number, cap: number) {
    if (tickRef.current) window.clearInterval(tickRef.current);
    setProgress(from);
    tickRef.current = window.setInterval(() => {
      setProgress((p) => {
        if (p >= cap) return p;
        // ease out toward cap
        const remaining = cap - p;
        return p + Math.max(0.3, remaining * 0.04);
      });
    }, 120);
  }

  function stopFakeProgress() {
    if (tickRef.current) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }

  function validate(file: File): string | null {
    if (!file.type.startsWith("image/")) return "That file type isn't supported. Use PNG, JPG, or WebP.";
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) return "Only PNG, JPG, or WebP images are accepted.";
    if (file.size > 20 * 1024 * 1024) return "File is over the 20MB limit. Try compressing or resizing.";
    if (file.size === 0) return "That file appears to be empty.";
    return null;
  }

  async function handleFile(file: File) {
    setError(null);
    setPendingFile(file);
    const v = validate(file);
    if (v) {
      setPhase("error");
      setError(v);
      setProgress(0);
      return;
    }

    try {
      // Phase 1: read
      setPhase("reading");
      setProgress(0);
      const base64 = await readFileAsBase64(file, (p) => setProgress(p * 0.15));

      // Phase 2: server upload (no observable progress → animated)
      setPhase("uploading");
      startFakeProgress(15, 88);
      const { id } = await upload({
        data: {
          projectId,
          title: file.name.replace(/\.[^.]+$/, ""),
          fileBase64: base64,
          mimeType: file.type,
        },
      });
      stopFakeProgress();

      // Phase 3: finalize
      setPhase("finalizing");
      setProgress(100);

      router.navigate({ to: "/critiques/$id", params: { id } });
      analyze({ data: { id, mode } }).catch((e) => {
        console.error(e);
        toast.error(`Analysis failed: ${e.message ?? "unknown"}`);
      });
    } catch (e) {
      stopFakeProgress();
      const raw = e instanceof Error ? e.message : String(e);
      setPhase("error");
      setError(friendlyUploadError(raw, file));
      setProgress(0);
    }
  }

  function reset() {
    stopFakeProgress();
    setPhase("idle");
    setProgress(0);
    setError(null);
    setPendingFile(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function retry() {
    if (pendingFile) {
      void handleFile(pendingFile);
    } else {
      reset();
      inputRef.current?.click();
    }
  }

  const phaseLabel =
    phase === "reading"
      ? "Reading file…"
      : phase === "uploading"
        ? "Uploading to server…"
        : phase === "finalizing"
          ? "Handing off to analyzer…"
          : "";

  // ---------- Error state ----------
  if (phase === "error") {
    return (
      <div
        className="relative border-2 border-dashed border-primary/60 rounded-sm h-[360px] flex flex-col items-center justify-center bg-primary/5 p-8"
        role="alert"
        aria-live="assertive"
      >
        <div className="flex flex-col items-center gap-5 text-center max-w-md">
          <div className="size-12 rounded-full bg-primary text-white flex items-center justify-center font-mono text-lg font-bold">
            !
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-primary mb-2">
              Upload failed
            </p>
            <p className="font-medium text-lg leading-snug">{error}</p>
            {pendingFile && (
              <p className="text-xs font-mono text-muted-foreground mt-2 truncate">
                {pendingFile.name} · {(pendingFile.size / 1024 / 1024).toFixed(2)}MB
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={retry}
              className="px-4 py-2 bg-primary text-white text-sm rounded-sm hover:bg-primary/90"
            >
              {pendingFile && validate(pendingFile) === null ? "Retry" : "Choose different file"}
            </button>
            <button
              type="button"
              onClick={reset}
              className="px-4 py-2 border border-border text-sm rounded-sm hover:bg-white"
            >
              Cancel
            </button>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </div>
      </div>
    );
  }

  // ---------- Busy state ----------
  if (busy) {
    return (
      <div
        className="relative border-2 border-dashed border-primary rounded-sm h-[360px] flex flex-col items-center justify-center bg-white p-8"
        aria-live="polite"
        aria-busy="true"
      >
        <div className="flex flex-col items-center gap-5 text-center w-full max-w-md">
          <div className="font-mono text-[11px] uppercase tracking-widest text-primary">
            {phaseLabel}
          </div>
          {pendingFile && (
            <p className="text-sm font-medium truncate max-w-full">{pendingFile.name}</p>
          )}
          <div className="w-full">
            <div className="h-1.5 w-full bg-stone-100 rounded-sm overflow-hidden">
              <div
                className="h-full bg-primary transition-[width] duration-150 ease-out"
                style={{ width: `${Math.min(100, progress)}%` }}
              />
            </div>
            <div className="flex justify-between mt-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <span>{phase}</span>
              <span>{Math.round(Math.min(100, progress))}%</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Idle state ----------
  const selectedSpec = RITUAL_MODES[mode];
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-baseline justify-between mb-3">
          <p className="font-mono text-[11px] uppercase tracking-widest text-primary">
            Ritual · {selectedSpec.pillars.length} pillar
            {selectedSpec.pillars.length === 1 ? "" : "s"}
          </p>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {selectedSpec.short}
          </p>
        </div>
        <div
          role="radiogroup"
          aria-label="Critique ritual mode"
          className="grid grid-cols-2 md:grid-cols-3 gap-2"
        >
          {RITUAL_MODE_ORDER.map((m) => {
            const spec = RITUAL_MODES[m];
            const active = m === mode;
            return (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={(e) => {
                  e.stopPropagation();
                  setMode(m);
                }}
                className={`text-left px-3 py-2.5 border rounded-sm transition-colors ${
                  active
                    ? "border-primary bg-primary/5"
                    : "border-border bg-white/50 hover:border-primary/40 hover:bg-white"
                }`}
              >
                <p
                  className={`text-sm font-medium leading-tight ${
                    active ? "text-primary" : "text-foreground"
                  }`}
                >
                  {spec.label}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                  {spec.short}
                </p>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
          {selectedSpec.description}
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
        onClick={() => inputRef.current?.click()}
        className={`group relative border-2 border-dashed rounded-sm h-[320px] flex flex-col items-center justify-center bg-white/50 transition-all cursor-pointer ${
          dragOver ? "border-primary bg-white" : "border-border hover:border-primary/40 hover:bg-white"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        <div className="flex flex-col items-center gap-4 text-center p-8">
          <div className="size-12 rounded-full border border-border flex items-center justify-center bg-background group-hover:scale-110 transition-transform">
            <div className="size-2 bg-primary rounded-full" />
          </div>
          <div>
            <p className="font-medium text-lg">Drop mockup to initiate critique</p>
            <p className="text-sm text-muted-foreground">
              PNG, JPG or WebP · max 20MB · {selectedSpec.label}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
