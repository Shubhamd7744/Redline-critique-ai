/**
 * Browser-only helper: turn a short video OR a set of storyboard image frames
 * into a single labeled contact-sheet PNG that flows through the existing
 * image-based critique pipeline.
 *
 * The composed PNG has a header row baked in with total duration, frame count
 * and per-frame timestamps — that header is the motion detector's ground
 * truth (it can't measure playback, but it can reason about the numbers we
 * hand it plus the visible inter-frame displacement).
 */

const MAX_FRAMES = 8;
const MIN_FRAMES = 3;
const TILE_MAX_W = 720; // per-frame tile pixel width in the sheet
const GAP = 16;
const HEADER_H = 96;
const LABEL_H = 40;
const COLS = 3;

export interface StoryboardResult {
  blob: Blob; // image/png
  dataUrl: string;
  durationMs: number;
  frameCount: number;
  timestampsMs: number[];
  sourceKind: "video" | "frames";
}

export interface StoryboardOptions {
  frameCount?: number; // for video, how many samples to take
  onProgress?: (label: string, pct: number) => void;
}

// ─── public API ─────────────────────────────────────────────────────────────

export function isVideoFile(file: File): boolean {
  return file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(file.name);
}

export async function buildStoryboardFromVideo(
  file: File,
  opts: StoryboardOptions = {},
): Promise<StoryboardResult> {
  const count = clampInt(opts.frameCount ?? 6, MIN_FRAMES, MAX_FRAMES);
  const { frames, durationMs, timestampsMs } = await extractVideoFrames(
    file,
    count,
    opts.onProgress,
  );
  return compose(frames, timestampsMs, durationMs, "video");
}

export async function buildStoryboardFromImages(
  files: File[],
  opts: StoryboardOptions = {},
): Promise<StoryboardResult> {
  if (files.length < MIN_FRAMES) {
    throw new Error(
      `Motion storyboard needs at least ${MIN_FRAMES} frames — ${files.length} selected.`,
    );
  }
  if (files.length > MAX_FRAMES) {
    throw new Error(`Motion storyboard supports at most ${MAX_FRAMES} frames.`);
  }
  opts.onProgress?.("Decoding frames", 10);
  const bitmaps: ImageBitmap[] = [];
  for (let i = 0; i < files.length; i++) {
    bitmaps.push(await createImageBitmap(files[i]));
    opts.onProgress?.("Decoding frames", 10 + ((i + 1) / files.length) * 40);
  }
  // Assume even 100ms spacing when the user supplies keyframes (they carry no
  // real timing). We label them as "keyframes" in the header.
  const spacing = 100;
  const durationMs = (files.length - 1) * spacing;
  const timestampsMs = files.map((_, i) => i * spacing);
  return compose(bitmaps, timestampsMs, durationMs, "frames");
}

// ─── video decode ───────────────────────────────────────────────────────────

async function extractVideoFrames(
  file: File,
  count: number,
  onProgress?: (label: string, pct: number) => void,
): Promise<{ frames: ImageBitmap[]; durationMs: number; timestampsMs: number[] }> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.crossOrigin = "anonymous";

    await new Promise<void>((resolve, reject) => {
      const onErr = () => reject(new Error("Could not decode this video. Try MP4 or WebM."));
      video.addEventListener("loadedmetadata", () => resolve(), { once: true });
      video.addEventListener("error", onErr, { once: true });
    });

    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      throw new Error("Video has no readable duration.");
    }
    // Cap analysis window at 20s so long clips don't blow up the sheet.
    const analysedSec = Math.min(video.duration, 20);
    const durationMs = Math.round(analysedSec * 1000);

    const timestampsSec = Array.from({ length: count }, (_, i) =>
      // sample from ~5% in to ~95% in, so we don't grab a black opening/closing frame
      analysedSec * (0.05 + (0.9 * i) / (count - 1)),
    );

    const frames: ImageBitmap[] = [];
    for (let i = 0; i < timestampsSec.length; i++) {
      onProgress?.("Sampling frames", 10 + (i / timestampsSec.length) * 70);
      await seek(video, timestampsSec[i]);
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context unavailable.");
      ctx.drawImage(video, 0, 0);
      frames.push(await createImageBitmap(canvas));
    }
    return {
      frames,
      durationMs,
      timestampsMs: timestampsSec.map((s) => Math.round(s * 1000)),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function seek(video: HTMLVideoElement, timeSec: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onErr);
      resolve();
    };
    const onErr = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onErr);
      reject(new Error("Video seek failed."));
    };
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onErr, { once: true });
    video.currentTime = Math.min(timeSec, Math.max(0, video.duration - 0.05));
  });
}

// ─── contact sheet composition ──────────────────────────────────────────────

async function compose(
  frames: ImageBitmap[],
  timestampsMs: number[],
  durationMs: number,
  sourceKind: "video" | "frames",
): Promise<StoryboardResult> {
  const count = frames.length;
  const cols = Math.min(COLS, count);
  const rows = Math.ceil(count / cols);

  // Fit each frame into a tile of TILE_MAX_W × auto (preserve aspect).
  const first = frames[0];
  const aspect = first.height / first.width;
  const tileW = TILE_MAX_W;
  const tileH = Math.round(tileW * aspect);

  const width = cols * tileW + (cols + 1) * GAP;
  const height =
    HEADER_H + rows * (tileH + LABEL_H) + (rows + 1) * GAP;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable.");

  // Paper background matching the app's palette
  ctx.fillStyle = "#FDFCFB";
  ctx.fillRect(0, 0, width, height);

  // Header
  ctx.fillStyle = "#1A1918";
  ctx.font = "600 28px system-ui, -apple-system, 'Segoe UI', sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText(
    sourceKind === "video" ? "Motion Storyboard (from video)" : "Motion Storyboard (keyframes)",
    GAP,
    20,
  );

  ctx.fillStyle = "#C23934";
  ctx.font = "500 14px ui-monospace, 'JetBrains Mono', Menlo, monospace";
  const meta =
    sourceKind === "video"
      ? `TOTAL DURATION: ${durationMs} ms   FRAMES: ${count}   AVG FPS OF SAMPLE: ${(
          (count - 1) /
          (durationMs / 1000 || 1)
        ).toFixed(1)}   TIMESTAMPS(ms): [${timestampsMs.join(", ")}]`
      : `KEYFRAMES: ${count}   SPACING (assumed): 100 ms   TIMESTAMPS(ms): [${timestampsMs.join(", ")}]`;
  wrapText(ctx, meta, GAP, 56, width - GAP * 2, 18);

  // Divider
  ctx.fillStyle = "#E5E2DE";
  ctx.fillRect(0, HEADER_H - 1, width, 1);

  // Tiles
  frames.forEach((frame, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = GAP + col * (tileW + GAP);
    const y = HEADER_H + GAP + row * (tileH + LABEL_H + GAP);

    // frame
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(x, y, tileW, tileH);
    ctx.drawImage(frame, x, y, tileW, tileH);
    ctx.strokeStyle = "#E5E2DE";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, tileW - 1, tileH - 1);

    // label under frame
    ctx.fillStyle = "#1A1918";
    ctx.font = "600 18px system-ui, -apple-system, sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText(`Frame ${i + 1}`, x, y + tileH + 8);

    ctx.fillStyle = "#C23934";
    ctx.font = "500 14px ui-monospace, 'JetBrains Mono', Menlo, monospace";
    ctx.fillText(`t = ${timestampsMs[i]} ms`, x + 96, y + tileH + 10);
  });

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not encode storyboard image."))),
      "image/png",
    ),
  );
  const dataUrl = await blobToDataUrl(blob);
  return { blob, dataUrl, durationMs, frameCount: count, timestampsMs, sourceKind };
}

// ─── utils ──────────────────────────────────────────────────────────────────

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(" ");
  let line = "";
  let yy = y;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = w;
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error ?? new Error("read failed"));
    r.readAsDataURL(blob);
  });
}

function clampInt(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}
