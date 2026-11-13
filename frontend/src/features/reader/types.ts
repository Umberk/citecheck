import type { LocateLevel, PageLocation, Rect } from "../../api/types";

/** Where the viewer should scroll and what it should mark. */
export interface HighlightTarget {
  key: number;
  documentId: string;
  pageIndex: number | null;
  level: LocateLevel;
  locations: PageLocation[];
  focus: PageLocation[];
  label: string;
}

export interface SelectionInfo {
  documentId: string;
  text: string;
  pageIndex: number;
  rects: Rect[];
  context: string;
  textOffset: number | null;
  clientRect: { top: number; left: number; width: number; bottom: number };
}
