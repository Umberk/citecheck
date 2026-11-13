import type { Annotation, Claim, Evidence } from "../../api/types";
import type { HighlightTarget } from "./types";

let counter = 0;
const nextKey = () => {
  counter += 1;
  return counter;
};

function label(paper: string | null, section: string | null, page: number | null) {
  return [paper, section, page !== null ? `p. ${page}` : null].filter(Boolean).join(" · ");
}

export function targetFromClaim(claim: Claim, evidence: Evidence[]): HighlightTarget | null {
  if (!claim.document_id || claim.locate === "none") return null;
  const source = claim.evidence_id ? evidence.find((item) => item.evidence_id === claim.evidence_id) : undefined;
  const exact = claim.locate === "exact" && source && source.locations.length > 0;
  return {
    key: nextKey(),
    documentId: claim.document_id,
    pageIndex: claim.page_index ?? source?.page_index ?? null,
    level: exact ? "exact" : "page",
    locations: exact ? source.locations : [],
    focus: exact ? claim.focus : [],
    label: label(claim.paper_title, claim.section, claim.page),
  };
}

export function targetFromEvidence(item: Evidence): HighlightTarget | null {
  if (item.locate === "none" && item.page_index === null) return null;
  const exact = item.locate === "exact" && item.locations.length > 0;
  return {
    key: nextKey(),
    documentId: item.document_id,
    pageIndex: item.page_index,
    level: exact ? "exact" : "page",
    locations: exact ? item.locations : [],
    focus: [],
    label: label(item.paper_title, item.section, item.page),
  };
}

export function targetFromAnnotation(item: Annotation, title: string): HighlightTarget {
  const rects = item.anchor?.rects ?? [];
  return {
    key: nextKey(),
    documentId: item.document_id,
    pageIndex: item.page_index,
    level: rects.length ? "exact" : "page",
    locations: [],
    focus: rects.length ? [{ page_index: item.page_index, rects }] : [],
    label: label(title, item.section, item.page_index + 1),
  };
}
