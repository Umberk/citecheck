import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Input, InputNumber, Spin, Tooltip } from "antd";
import { ChevronDown, ChevronUp, Crosshair, Maximize2, Minus, Plus, Search, X } from "lucide-react";
import { Document, Page } from "react-pdf";
import type { PageLocation, Rect } from "../../api/types";
import { EmptyState } from "../../components/States";
import { useT } from "../../i18n";
import { normalize, pageOffsets, type PageSize, type PDFDocumentProxy } from "./pdf";
import type { HighlightTarget, SelectionInfo } from "./types";

export interface PdfViewerHandle {
  scrollToPage: (pageIndex: number) => void;
}

interface Props {
  documentId: string;
  fileUrl: string;
  target: HighlightTarget | null;
  onClearTarget: () => void;
  onSelection: (selection: SelectionInfo | null) => void;
  onLoaded?: (pdf: PDFDocumentProxy) => void;
  onPageChange?: (pageIndex: number) => void;
}

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

function Marks({ rects, focus, flashKey }: { rects: Rect[]; focus: Rect[]; flashKey: number }) {
  return (
    <div className="pdf-overlay" key={flashKey}>
      {rects.map((rect, index) => (
        <div
          key={`r${index}`}
          className="pdf-mark is-flash"
          style={{
            left: `${rect[0] * 100}%`,
            top: `${rect[1] * 100}%`,
            width: `${(rect[2] - rect[0]) * 100}%`,
            height: `${(rect[3] - rect[1]) * 100}%`,
          }}
        />
      ))}
      {focus.map((rect, index) => (
        <div
          key={`f${index}`}
          className="pdf-mark is-focus"
          style={{
            left: `${rect[0] * 100}%`,
            top: `${rect[1] * 100}%`,
            width: `${(rect[2] - rect[0]) * 100}%`,
            height: `${(rect[3] - rect[1]) * 100}%`,
          }}
        />
      ))}
    </div>
  );
}

const PageSlot = memo(function PageSlot({
  pageIndex,
  size,
  scale,
  visible,
  rects,
  focus,
  flashKey,
  flashPage,
  searchQuery,
}: {
  pageIndex: number;
  size: PageSize;
  scale: number;
  visible: boolean;
  rects: Rect[];
  focus: Rect[];
  flashKey: number;
  flashPage: boolean;
  searchQuery: string;
}) {
  const renderer = useMemo(() => {
    const needle = searchQuery.trim();
    if (needle.length < 2) return undefined;
    const pattern = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    return ({ str }: { str: string }) => escapeHtml(str).replace(pattern, (match) => `<mark class="search-hit">${match}</mark>`);
  }, [searchQuery]);

  return (
    <div data-page-index={pageIndex} className="pdf-page" style={{ width: size.width * scale, height: size.height * scale }}>
      {flashPage && <div key={`flash-${flashKey}`} className="pdf-overlay pdf-page-flash" />}
      {visible ? (
        <Page
          pageNumber={pageIndex + 1}
          scale={scale}
          renderAnnotationLayer={false}
          renderTextLayer
          customTextRenderer={renderer}
          loading={<div className="h-full w-full bg-white" />}
        />
      ) : null}
      {(rects.length > 0 || focus.length > 0) && <Marks rects={rects} focus={focus} flashKey={flashKey} />}
      <span className="pointer-events-none absolute -left-9 top-1 select-none text-2xs tabular-nums text-ink-4">
        {pageIndex + 1}
      </span>
    </div>
  );
});

function byPage(locations: PageLocation[]): Map<number, Rect[]> {
  const map = new Map<number, Rect[]>();
  for (const location of locations) {
    map.set(location.page_index, [...(map.get(location.page_index) ?? []), ...location.rects]);
  }
  return map;
}

export const PdfViewer = forwardRef<PdfViewerHandle, Props>(function PdfViewer(
  { documentId, fileUrl, target, onClearTarget, onSelection, onLoaded, onPageChange },
  ref,
) {
  const t = useT();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [sizes, setSizes] = useState<PageSize[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<"fit" | number>("fit");
  const [width, setWidth] = useState(800);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(800);
  const [current, setCurrent] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<{ page: number; count: number }[] | null>(null);
  const [hitIndex, setHitIndex] = useState(0);
  const pageTexts = useRef<string[] | null>(null);
  const pendingTarget = useRef<HighlightTarget | null>(null);

  const file = useMemo(() => ({ url: fileUrl, withCredentials: true }), [fileUrl]);

  useEffect(() => {
    setPdf(null);
    setSizes([]);
    setLoadError(null);
    setHits(null);
    setQuery("");
    pageTexts.current = null;
  }, [fileUrl]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(() => {
      setWidth(element.clientWidth);
      setViewportHeight(element.clientHeight);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const baseWidth = sizes.length ? Math.max(...sizes.map((size) => size.width)) : 612;
  const fitScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, (width - 96) / baseWidth));
  const scale = zoom === "fit" ? fitScale : zoom;
  const { tops, total } = useMemo(() => pageOffsets(sizes, scale), [sizes, scale]);

  const scrollToY = useCallback((y: number, smooth = true) => {
    scrollRef.current?.scrollTo({ top: Math.max(0, y), behavior: smooth ? "smooth" : "auto" });
  }, []);

  const scrollToPage = useCallback(
    (pageIndex: number) => {
      if (pageIndex < 0 || pageIndex >= tops.length) return;
      scrollToY(tops[pageIndex] - 12);
    },
    [tops, scrollToY],
  );

  useImperativeHandle(ref, () => ({ scrollToPage }), [scrollToPage]);

  const applyTarget = useCallback(
    (next: HighlightTarget) => {
      const first = next.focus[0] ?? next.locations[0];
      if (first && first.rects.length && first.page_index < tops.length) {
        const pageHeight = sizes[first.page_index].height * scale;
        const y = tops[first.page_index] + first.rects[0][1] * pageHeight - viewportHeight * 0.3;
        scrollToY(y);
      } else if (next.pageIndex !== null) {
        scrollToPage(next.pageIndex);
      }
    },
    [tops, sizes, scale, viewportHeight, scrollToY, scrollToPage],
  );

  useEffect(() => {
    if (!target || target.documentId !== documentId) return;
    if (!sizes.length) {
      pendingTarget.current = target;
      return;
    }
    applyTarget(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.key, documentId, sizes.length]);

  useEffect(() => {
    if (sizes.length && pendingTarget.current && pendingTarget.current.documentId === documentId) {
      const next = pendingTarget.current;
      pendingTarget.current = null;
      window.setTimeout(() => applyTarget(next), 50);
    }
  }, [sizes.length, documentId, applyTarget]);

  const onLoadSuccess = async (loaded: PDFDocumentProxy) => {
    const pages = await Promise.all(
      Array.from({ length: loaded.numPages }, (_, index) =>
        loaded.getPage(index + 1).then((page) => {
          const viewport = page.getViewport({ scale: 1 });
          return { width: viewport.width, height: viewport.height };
        }),
      ),
    );
    setPdf(loaded);
    setSizes(pages);
    onLoaded?.(loaded);
  };

  const onScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    setScrollTop(element.scrollTop);
    const probe = element.scrollTop + element.clientHeight * 0.35;
    let index = 0;
    for (let i = 0; i < tops.length; i += 1) {
      if (tops[i] <= probe) index = i;
    }
    if (index !== current) {
      setCurrent(index);
      onPageChange?.(index);
    }
  };

  const handleMouseUp = () => {
    window.setTimeout(() => {
      const selection = window.getSelection();
      const text = selection?.toString().replace(/\s+/g, " ").trim() ?? "";
      if (!selection || selection.rangeCount === 0 || text.length < 2) {
        onSelection(null);
        return;
      }
      const range = selection.getRangeAt(0);
      const startElement =
        range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
      const pageElement = startElement?.closest<HTMLElement>("[data-page-index]");
      if (!pageElement || !scrollRef.current?.contains(pageElement)) {
        onSelection(null);
        return;
      }
      const pageIndex = Number(pageElement.dataset.pageIndex);
      const box = pageElement.getBoundingClientRect();
      const rects: Rect[] = Array.from(range.getClientRects())
        .filter((rect) => rect.width > 1 && rect.height > 1)
        .slice(0, 40)
        .map((rect) => [
          Math.max(0, (rect.left - box.left) / box.width),
          Math.max(0, (rect.top - box.top) / box.height),
          Math.min(1, (rect.right - box.left) / box.width),
          Math.min(1, (rect.bottom - box.top) / box.height),
        ]);
      const layerText = (pageElement.querySelector(".textLayer")?.textContent ?? "").replace(/\s+/g, " ");
      const offset = normalize(layerText).indexOf(normalize(text));
      const context =
        offset >= 0 ? layerText.slice(Math.max(0, offset - 400), offset + text.length + 400) : layerText.slice(0, 1200);
      const bounds = range.getBoundingClientRect();
      onSelection({
        documentId,
        text: text.slice(0, 4000),
        pageIndex,
        rects,
        context,
        textOffset: offset >= 0 ? offset : null,
        clientRect: { top: bounds.top, left: bounds.left, width: bounds.width, bottom: bounds.bottom },
      });
    }, 10);
  };

  const runSearch = async (value: string) => {
    setQuery(value);
    const needle = normalize(value);
    if (!pdf || needle.length < 2) {
      setHits(null);
      return;
    }
    if (!pageTexts.current) {
      pageTexts.current = await Promise.all(
        Array.from({ length: pdf.numPages }, (_, index) =>
          pdf
            .getPage(index + 1)
            .then((page) => page.getTextContent())
            .then((content) =>
              normalize(content.items.map((item) => ("str" in item ? item.str : "")).join(" ")),
            ),
        ),
      );
    }
    const found = pageTexts.current
      .map((text, page) => ({ page, count: text.split(needle).length - 1 }))
      .filter((item) => item.count > 0);
    setHits(found);
    setHitIndex(0);
    if (found.length) scrollToPage(found[0].page);
  };

  const stepHit = (delta: number) => {
    if (!hits?.length) return;
    const next = (hitIndex + delta + hits.length) % hits.length;
    setHitIndex(next);
    scrollToPage(hits[next].page);
  };

  const activeTarget = target && target.documentId === documentId ? target : null;
  const markRects = useMemo(() => byPage(activeTarget?.locations ?? []), [activeTarget]);
  const focusRects = useMemo(() => byPage(activeTarget?.focus ?? []), [activeTarget]);
  const flashPageIndex = activeTarget && activeTarget.level !== "exact" ? activeTarget.pageIndex : null;

  const margin = viewportHeight * 1.5;
  const totalHits = hits?.reduce((sum, item) => sum + item.count, 0) ?? 0;

  return (
    <div className="flex h-full min-w-0 flex-col bg-[#eef0f3]">
      <div className="flex h-11 shrink-0 items-center gap-1 border-0 border-b border-solid border-line bg-surface px-2">
        <Tooltip title={t("reader.prev")}>
          <button type="button" className="icon-btn" disabled={current <= 0} onClick={() => scrollToPage(current - 1)}>
            <ChevronUp size={16} />
          </button>
        </Tooltip>
        <Tooltip title={t("reader.next")}>
          <button
            type="button"
            className="icon-btn"
            disabled={current >= sizes.length - 1}
            onClick={() => scrollToPage(current + 1)}
          >
            <ChevronDown size={16} />
          </button>
        </Tooltip>
        <div className="flex items-center gap-1 text-xs text-ink-3">
          <InputNumber
            size="small"
            min={1}
            max={Math.max(1, sizes.length)}
            value={current + 1}
            controls={false}
            onPressEnter={(event) => scrollToPage(Number((event.target as HTMLInputElement).value) - 1)}
            onStep={(value) => scrollToPage(Number(value) - 1)}
            className="!w-12 text-center"
          />
          <span className="tabular-nums">/ {sizes.length || "–"}</span>
        </div>
        <span className="mx-1.5 h-5 w-px bg-line" />
        <Tooltip title={t("reader.zoomOut")}>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setZoom(Math.max(MIN_SCALE, Math.round((scale - 0.1) * 10) / 10))}
          >
            <Minus size={15} />
          </button>
        </Tooltip>
        <span className="w-11 text-center text-xs tabular-nums text-ink-2">{Math.round(scale * 100)}%</span>
        <Tooltip title={t("reader.zoomIn")}>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setZoom(Math.min(MAX_SCALE, Math.round((scale + 0.1) * 10) / 10))}
          >
            <Plus size={15} />
          </button>
        </Tooltip>
        <Tooltip title={t("reader.fitWidth")}>
          <button
            type="button"
            className={`icon-btn ${zoom === "fit" ? "!bg-brand-50 !text-brand-600" : ""}`}
            onClick={() => setZoom("fit")}
          >
            <Maximize2 size={14} />
          </button>
        </Tooltip>
        <div className="flex-1" />
        {searchOpen ? (
          <div className="flex items-center gap-1">
            <Input
              size="small"
              autoFocus
              allowClear
              prefix={<Search size={13} className="text-ink-4" />}
              placeholder={t("reader.searchDoc")}
              onPressEnter={(event) => void runSearch((event.target as HTMLInputElement).value)}
              onChange={(event) => !event.target.value && void runSearch("")}
              className="!w-48"
            />
            {hits && (
              <span className="whitespace-nowrap text-xs text-ink-3">
                {hits.length ? t("reader.searchHits", { n: totalHits }) : t("reader.searchNone")}
              </span>
            )}
            <button type="button" className="icon-btn h-7 w-7" disabled={!hits?.length} onClick={() => stepHit(-1)}>
              <ChevronUp size={14} />
            </button>
            <button type="button" className="icon-btn h-7 w-7" disabled={!hits?.length} onClick={() => stepHit(1)}>
              <ChevronDown size={14} />
            </button>
            <button
              type="button"
              className="icon-btn h-7 w-7"
              onClick={() => {
                setSearchOpen(false);
                void runSearch("");
              }}
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <Tooltip title={t("reader.searchDoc")}>
            <button type="button" className="icon-btn" onClick={() => setSearchOpen(true)} disabled={!pdf}>
              <Search size={15} />
            </button>
          </Tooltip>
        )}
      </div>

      {activeTarget && (
        <div className="flex shrink-0 items-center gap-2 border-0 border-b border-solid border-line bg-brand-50 px-3 py-1.5 text-xs text-brand-900 animate-fade-up">
          <Crosshair size={13} className="shrink-0 text-brand-600" />
          <span className="min-w-0 flex-1 truncate">{activeTarget.label}</span>
          <span
            className={`chip shrink-0 ${activeTarget.level === "exact" ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"}`}
          >
            {t(`reader.locate.${activeTarget.level}`)}
          </span>
          {activeTarget.level === "page" && (
            <span className="hidden shrink-0 text-ink-3 xl:inline">{t("reader.locate.pageHint")}</span>
          )}
          <button type="button" className="icon-btn h-6 w-6" onClick={onClearTarget}>
            <X size={13} />
          </button>
        </div>
      )}

      <div ref={scrollRef} onScroll={onScroll} onMouseUp={handleMouseUp} className="scroll-thin relative min-h-0 flex-1 overflow-auto">
        <Document
          file={file}
          onLoadSuccess={(loaded) => void onLoadSuccess(loaded)}
          onLoadError={(error) => setLoadError(error.message)}
          loading={
            <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-3 text-sm text-ink-3">
              <Spin />
              {t("reader.loadingPdf")}
            </div>
          }
          error={<EmptyState title={t("reader.pdfError")} description={loadError ?? undefined} />}
        >
          {sizes.length > 0 && (
            <div className="relative" style={{ height: total, minWidth: baseWidth * scale + 96 }}>
              {sizes.map((size, index) => {
                const top = tops[index];
                const height = size.height * scale;
                const visible = top + height > scrollTop - margin && top < scrollTop + viewportHeight + margin;
                return (
                  <div key={index} className="absolute left-0 right-0" style={{ top }}>
                    <PageSlot
                      pageIndex={index}
                      size={size}
                      scale={scale}
                      visible={visible}
                      rects={markRects.get(index) ?? []}
                      focus={focusRects.get(index) ?? []}
                      flashKey={activeTarget?.key ?? 0}
                      flashPage={flashPageIndex === index}
                      searchQuery={query}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </Document>
      </div>
    </div>
  );
});
