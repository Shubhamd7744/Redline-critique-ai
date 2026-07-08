import { useServerFn } from "@tanstack/react-start";
import { useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { uploadCritique, analyzeCritique } from "@/lib/critique.functions";

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]); // strip data:image/...;base64,
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function UploadDropzone({ projectId }: { projectId: string | null }) {
  const router = useRouter();
  const upload = useServerFn(uploadCritique);
  const analyze = useServerFn(analyzeCritique);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file (PNG, JPG, WebP).");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Max file size is 20MB.");
      return;
    }
    setBusy(true);
    try {
      const base64 = await fileToBase64(file);
      const { id } = await upload({
        data: {
          projectId,
          title: file.name.replace(/\.[^.]+$/, ""),
          fileBase64: base64,
          mimeType: file.type,
        },
      });
      router.navigate({ to: "/critiques/$id", params: { id } });
      // fire analysis async; results page polls
      analyze({ data: { id } }).catch((e) => {
        console.error(e);
        toast.error(`Analysis failed: ${e.message ?? "unknown"}`);
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
      setBusy(false);
    }
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) handleFile(f);
      }}
      onClick={() => inputRef.current?.click()}
      className={`group relative border-2 border-dashed rounded-sm h-[360px] flex flex-col items-center justify-center bg-white/50 transition-all cursor-pointer ${
        dragOver ? "border-primary bg-white" : "border-border hover:border-primary/40 hover:bg-white"
      } ${busy ? "opacity-60 pointer-events-none" : ""}`}
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
          <p className="font-medium text-lg">
            {busy ? "Uploading…" : "Drop mockup to initiate critique"}
          </p>
          <p className="text-sm text-muted-foreground">PNG, JPG or WebP · max 20MB</p>
        </div>
      </div>
    </div>
  );
}
