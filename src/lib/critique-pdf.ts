import { jsPDF } from "jspdf";
import {
  PRINCIPLE_LABELS,
  SEVERITY_LABEL,
  type CritiquePayload,
} from "./critique-types";

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function imageToDataUrl(img: HTMLImageElement): { dataUrl: string; w: number; h: number } {
  const canvas = document.createElement("canvas");
  const maxW = 1600;
  const scale = Math.min(1, maxW / img.naturalWidth);
  canvas.width = img.naturalWidth * scale;
  canvas.height = img.naturalHeight * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.9), w: canvas.width, h: canvas.height };
}

export async function downloadCritiquePdf({
  payload,
  imageUrl,
  title,
  createdAt,
}: {
  payload: CritiquePayload;
  imageUrl: string;
  title: string;
  createdAt?: string;
}) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentW = pageW - margin * 2;

  const RED: [number, number, number] = [194, 57, 52];
  const MUTED: [number, number, number] = [120, 113, 108];
  const BORDER: [number, number, number] = [220, 214, 208];

  // --- Header ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...RED);
  doc.text("REDLINE / CRITIQUE REPORT", margin, margin);

  doc.setFont("times", "italic");
  doc.setFontSize(26);
  doc.setTextColor(30, 27, 24);
  const titleLines = doc.splitTextToSize(title, contentW);
  doc.text(titleLines, margin, margin + 30);

  let y = margin + 30 + titleLines.length * 26;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  const meta = createdAt ? new Date(createdAt).toLocaleString() : new Date().toLocaleString();
  doc.text(meta.toUpperCase(), margin, y + 8);
  y += 20;

  doc.setDrawColor(...BORDER);
  doc.line(margin, y, pageW - margin, y);
  y += 20;

  // --- Overall + Summary ---
  doc.setFont("times", "italic");
  doc.setFontSize(44);
  doc.setTextColor(30, 27, 24);
  doc.text(payload.overall_score.toFixed(1), margin, y + 30);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text("/ 10 OVERALL", margin + 80, y + 30);

  if (payload.summary) {
    doc.setFont("times", "italic");
    doc.setFontSize(12);
    doc.setTextColor(60, 55, 50);
    const sumLines = doc.splitTextToSize(`"${payload.summary}"`, contentW - 140);
    doc.text(sumLines, margin + 140, y + 20);
  }
  y += 55;

  // --- Rubric ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text("ANALYSIS RUBRIC", margin, y);
  y += 10;

  const rubricEntries = Object.entries(payload.rubric);
  const colW = contentW / 3;
  const rowH = 24;
  rubricEntries.forEach((entry, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const rx = margin + col * colW;
    const ry = y + row * rowH;
    const [key, val] = entry as [keyof typeof payload.rubric, number];
    doc.setDrawColor(...BORDER);
    doc.line(rx, ry + rowH - 4, rx + colW - 12, ry + rowH - 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(30, 27, 24);
    doc.text(PRINCIPLE_LABELS[key], rx, ry + 12);
    doc.setFont("courier", "bold");
    doc.setFontSize(13);
    if (val < 6) doc.setTextColor(...RED);
    doc.text(val.toFixed(1), rx + colW - 20, ry + 14, { align: "right" });
  });
  y += Math.ceil(rubricEntries.length / 3) * rowH + 16;

  // --- Annotated image ---
  try {
    const img = await loadImage(imageUrl);
    const { dataUrl } = imageToDataUrl(img);
    const aspect = img.naturalHeight / img.naturalWidth;

    // Fit on same page if possible, else new page
    const remaining = pageH - margin - y - 10;
    let imgW = contentW;
    let imgH = imgW * aspect;
    if (imgH > remaining - 30) {
      doc.addPage();
      y = margin;
      imgW = contentW;
      imgH = Math.min(imgW * aspect, pageH - margin * 2 - 20);
      imgW = imgH / aspect;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`ANNOTATED / ${title.toUpperCase()}`, margin, y);
    y += 10;

    const imgX = margin + (contentW - imgW) / 2;
    doc.addImage(dataUrl, "JPEG", imgX, y, imgW, imgH);
    doc.setDrawColor(...BORDER);
    doc.rect(imgX, y, imgW, imgH);

    // Draw pins
    payload.issues.forEach((issue, idx) => {
      const px = imgX + issue.x * imgW;
      const py = y + issue.y * imgH;
      const isCritical = issue.severity === "critical";
      if (isCritical) {
        doc.setFillColor(...RED);
        doc.circle(px, py, 8, "F");
        doc.setTextColor(255, 255, 255);
      } else {
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(...RED);
        doc.circle(px, py, 8, "FD");
        doc.setTextColor(...RED);
      }
      doc.setFont("courier", "bold");
      doc.setFontSize(7);
      doc.text(String(idx + 1).padStart(2, "0"), px, py + 2.5, { align: "center" });
    });
    y += imgH + 20;
  } catch {
    // skip image
  }

  // --- Issues ---
  doc.addPage();
  y = margin;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...RED);
  doc.text("ISSUE LOG", margin, y);
  y += 20;

  payload.issues.forEach((issue, idx) => {
    const num = String(idx + 1).padStart(2, "0");
    const descLines = doc.splitTextToSize(issue.description, contentW - 20);
    const fixLines = doc.splitTextToSize(issue.fix, contentW - 20);
    const titleLines2 = doc.splitTextToSize(issue.title, contentW - 20);
    const blockH = 30 + titleLines2.length * 12 + descLines.length * 11 + fixLines.length * 11 + 20;

    if (y + blockH > pageH - margin) {
      doc.addPage();
      y = margin;
    }

    // Severity tag
    const sev = SEVERITY_LABEL[issue.severity].toUpperCase();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    if (issue.severity === "critical") {
      doc.setFillColor(...RED);
      doc.rect(margin, y, 46, 12, "F");
      doc.setTextColor(255, 255, 255);
    } else {
      doc.setFillColor(235, 231, 226);
      doc.rect(margin, y, 46, 12, "F");
      doc.setTextColor(60, 55, 50);
    }
    doc.text(sev, margin + 23, y + 8, { align: "center" });

    doc.setFont("courier", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`#${num}  ${PRINCIPLE_LABELS[issue.principle] ?? issue.principle}`, margin + 54, y + 8);

    y += 20;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(30, 27, 24);
    doc.text(titleLines2, margin, y);
    y += titleLines2.length * 12 + 4;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80, 74, 68);
    doc.text(descLines, margin, y);
    y += descLines.length * 11 + 8;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text("FIX", margin, y);
    y += 9;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(30, 27, 24);
    doc.text(fixLines, margin, y);
    y += fixLines.length * 11 + 12;

    doc.setDrawColor(...BORDER);
    doc.line(margin, y, pageW - margin, y);
    y += 14;
  });

  // Footer on every page
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFont("courier", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(`REDLINE // ${p} / ${pageCount}`, pageW - margin, pageH - 20, { align: "right" });
  }

  const safe = title.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60) || "critique";
  doc.save(`redline-${safe}.pdf`);
}
