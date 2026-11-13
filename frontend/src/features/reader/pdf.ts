import { pdfjs } from "react-pdf";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type { PDFDocumentProxy } from "pdfjs-dist";

export interface PageSize {
  width: number;
  height: number;
}

export const PAGE_GAP = 16;
export const PAGE_PADDING = 24;

/** Top offset of every page at a given scale, plus the total scroll height. */
export function pageOffsets(sizes: PageSize[], scale: number): { tops: number[]; total: number } {
  const tops: number[] = [];
  let y = PAGE_PADDING;
  for (const size of sizes) {
    tops.push(y);
    y += size.height * scale + PAGE_GAP;
  }
  return { tops, total: y + PAGE_PADDING - PAGE_GAP };
}

export function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}
