import { useEffect, useRef, useState } from "react";
import { Segmented } from "antd";
import { Hash, ListTree } from "lucide-react";
import { Thumbnail } from "react-pdf";
import type { DocumentDetail } from "../../api/types";
import { EmptyState } from "../../components/States";
import { useT } from "../../i18n";
import type { PDFDocumentProxy } from "./pdf";

function sectionDepth(name: string): number {
  const match = name.match(/^(\d+(?:\.\d+)*)\s/);
  return match ? match[1].split(".").length - 1 : 0;
}

function LazyThumb({ pdf, pageIndex, active, onClick }: { pdf: PDFDocumentProxy; pageIndex: number; active: boolean; onClick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: "200px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className={`flex w-full cursor-pointer flex-col items-center gap-1 rounded-md border-0 bg-transparent p-2 ${active ? "bg-brand-50" : "hover:bg-muted"}`}
    >
      <div
        className={`flex h-[150px] w-[116px] items-center justify-center overflow-hidden rounded-sm bg-white shadow-xs ring-1 ${active ? "ring-2 ring-brand-500" : "ring-line"}`}
      >
        {visible && <Thumbnail pdf={pdf} pageNumber={pageIndex + 1} width={116} loading="" />}
      </div>
      <span className={`text-2xs tabular-nums ${active ? "font-semibold text-brand-700" : "text-ink-3"}`}>{pageIndex + 1}</span>
    </button>
  );
}

export function OutlinePanel({
  document,
  pdf,
  currentPage,
  onJump,
}: {
  document: DocumentDetail | null;
  pdf: PDFDocumentProxy | null;
  currentPage: number;
  onJump: (pageIndex: number) => void;
}) {
  const t = useT();
  const [tab, setTab] = useState<"outline" | "pages">("outline");
  const sections = document?.outline ?? [];
  let activeIndex = -1;
  sections.forEach((section, index) => {
    if (section.page_index !== null && section.page_index <= currentPage) activeIndex = index;
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center px-3">
        <Segmented
          block
          size="small"
          value={tab}
          onChange={(value) => setTab(value as "outline" | "pages")}
          className="w-full"
          options={[
            { value: "outline", label: t("reader.outline") },
            { value: "pages", label: t("reader.thumbs") },
          ]}
        />
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {tab === "outline" ? (
          sections.length === 0 ? (
            <EmptyState compact icon={<ListTree size={16} />} title={t("reader.noOutline")} />
          ) : (
            <ul className="m-0 flex list-none flex-col gap-px p-0">
              {sections.map((section, index) => {
                const depth = sectionDepth(section.name);
                const active = index === activeIndex;
                return (
                  <li key={`${section.name}-${index}`}>
                    <button
                      type="button"
                      disabled={section.page_index === null}
                      onClick={() => section.page_index !== null && onJump(section.page_index)}
                      className={`group flex w-full cursor-pointer items-start gap-2 rounded-md border-0 py-1.5 pr-2 text-left text-sm transition-colors ${
                        active ? "bg-surface font-medium text-ink shadow-xs ring-1 ring-line" : "bg-transparent text-ink-2 hover:bg-muted"
                      }`}
                      style={{ paddingLeft: 8 + depth * 12 }}
                    >
                      <Hash size={12} className={`mt-[5px] shrink-0 ${active ? "text-brand-600" : "text-ink-4"}`} />
                      <span className="min-w-0 flex-1 leading-5">{section.name}</span>
                      {section.page !== null && (
                        <span className="mt-px shrink-0 text-2xs tabular-nums text-ink-4">{section.page}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        ) : pdf ? (
          <div className="flex flex-col items-center gap-1">
            {Array.from({ length: pdf.numPages }, (_, index) => (
              <LazyThumb key={index} pdf={pdf} pageIndex={index} active={index === currentPage} onClick={() => onJump(index)} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
