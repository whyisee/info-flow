import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
} from "pdfjs-dist";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import "./PdfJsBlobViewer.css";

GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

type Props = {
  /** 通常为 blob: URL */
  url: string;
};

/**
 * 用 pdf.js 在页面内绘制 PDF，避免浏览器内置 PDF 查看器的深色 UI 与弹窗不协调。
 */
export default function PdfJsBlobViewer({ url }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const pageElsRef = useRef<Array<HTMLCanvasElement | null>>([]);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(true);
  const [scale, setScale] = useState(1.2);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [outline, setOutline] = useState<
    Array<{ title: string; dest: unknown; items?: unknown[] }>
  >([]);

  const zoomLabel = useMemo(() => `${Math.round(scale * 100)}%`, [scale]);

  const download = useCallback(() => {
    const a = document.createElement("a");
    a.href = url;
    a.download = "preview.pdf";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [url]);

  const scrollToPage = useCallback((pageIndex0: number) => {
    const el = pageElsRef.current[pageIndex0];
    const root = rootRef.current;
    if (!el || !root) return;
    // 让页面顶部滚入可视区
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const resolveDestToPageIndex0 = useCallback(
    async (dest: unknown) => {
      const doc = docRef.current;
      if (!doc) return null;
      try {
        // dest 可能是 string（named destination）或 array
        const realDest =
          typeof dest === "string" ? await (doc as any).getDestination(dest) : dest;
        if (!Array.isArray(realDest) || realDest.length === 0) return null;
        const ref = realDest[0];
        const idx = await (doc as any).getPageIndex(ref);
        return typeof idx === "number" ? idx : null;
      } catch {
        return null;
      }
    },
    [],
  );

  useEffect(() => {
    const el = innerRef.current;
    if (!url || !el) return;

    let cancelled = false;
    el.replaceChildren();
    pageElsRef.current = [];
    setError(null);
    setRendering(true);

    const loadingTask = getDocument({ url });
    let doc: PDFDocumentProxy | null = null;

    (async () => {
      try {
        doc = await loadingTask.promise;
        docRef.current = doc;
        if (cancelled) {
          await doc.destroy().catch(() => undefined);
          return;
        }
        try {
          const ol = await (doc as any).getOutline?.();
          if (!cancelled && Array.isArray(ol)) {
            setOutline(
              ol.map((x: any) => ({
                title: String(x?.title ?? ""),
                dest: x?.dest,
                items: Array.isArray(x?.items) ? x.items : [],
              })),
            );
          } else if (!cancelled) {
            setOutline([]);
          }
        } catch {
          if (!cancelled) setOutline([]);
        }

        for (let i = 1; i <= doc.numPages; i++) {
          if (cancelled) break;
          const page = await doc.getPage(i);
          const cssViewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d", { alpha: false });
          if (!ctx) continue;
          // 高清渲染：使用更大的 renderViewport（scale * DPR），CSS 保持原尺寸
          const outputScale = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
          const renderViewport = page.getViewport({ scale: scale * outputScale });
          canvas.width = Math.floor(renderViewport.width);
          canvas.height = Math.floor(renderViewport.height);
          canvas.style.width = `${Math.floor(cssViewport.width)}px`;
          canvas.style.height = `${Math.floor(cssViewport.height)}px`;
          // 清空画布，避免残影（某些合并 PDF/扫描件更明显）
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          canvas.className = "pdfJsBlobViewerPage";
          el.appendChild(canvas);
          pageElsRef.current[i - 1] = canvas;
          await page
            .render({
              canvasContext: ctx,
              viewport: renderViewport,
              background: "#ffffff",
            })
            .promise;
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "无法渲染 PDF");
        }
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();

    return () => {
      cancelled = true;
      el.replaceChildren();
      pageElsRef.current = [];
      docRef.current = null;
      void doc?.destroy().catch(() => undefined);
      void loadingTask.destroy().catch(() => undefined);
    };
  }, [url, scale]);

  const renderOutlineItems = useCallback(
    (items: Array<{ title: string; dest: unknown; items?: unknown[] }>, depth = 0) => {
      if (!items?.length) return null;
      return (
        <ul className="pdfJsBlobViewerOutlineList">
          {items
            .filter((x) => x.title)
            .map((x, idx) => (
              <li key={`${depth}-${idx}`} className="pdfJsBlobViewerOutlineItem">
                <button
                  type="button"
                  className="pdfJsBlobViewerOutlineBtn"
                  style={{ paddingLeft: 10 + depth * 12 }}
                  onClick={async () => {
                    const pageIndex0 = await resolveDestToPageIndex0(x.dest);
                    if (pageIndex0 != null) {
                      scrollToPage(pageIndex0);
                    }
                  }}
                >
                  {x.title}
                </button>
                {Array.isArray(x.items) && x.items.length
                  ? renderOutlineItems(
                      (x.items as any[]).map((y: any) => ({
                        title: String(y?.title ?? ""),
                        dest: y?.dest,
                        items: Array.isArray(y?.items) ? y.items : [],
                      })),
                      depth + 1,
                    )
                  : null}
              </li>
            ))}
        </ul>
      );
    },
    [resolveDestToPageIndex0, scrollToPage],
  );

  return (
    <div className="pdfJsBlobViewer" ref={rootRef}>
      <div className="pdfJsBlobViewerToolbar">
        <div className="pdfJsBlobViewerToolbarLeft">
          <button
            type="button"
            className="pdfJsBlobViewerToolBtn"
            onClick={() => setOutlineOpen((v) => !v)}
            disabled={!outline.length}
          >
            书签
          </button>
        </div>
        <div className="pdfJsBlobViewerToolbarRight">
          <button
            type="button"
            className="pdfJsBlobViewerToolBtn"
            onClick={() => setScale((s) => Math.max(0.5, Math.round((s - 0.1) * 10) / 10))}
          >
            −
          </button>
          <span className="pdfJsBlobViewerZoomLabel">{zoomLabel}</span>
          <button
            type="button"
            className="pdfJsBlobViewerToolBtn"
            onClick={() => setScale((s) => Math.min(2.5, Math.round((s + 0.1) * 10) / 10))}
          >
            +
          </button>
          <button type="button" className="pdfJsBlobViewerToolBtn" onClick={download}>
            下载
          </button>
        </div>
      </div>

      <div className="pdfJsBlobViewerBody">
        {outlineOpen ? (
          <div className="pdfJsBlobViewerOutline">
            <div className="pdfJsBlobViewerOutlineTitle">书签</div>
            {renderOutlineItems(outline)}
          </div>
        ) : null}
        <div className="pdfJsBlobViewerMain">
          {rendering ? (
            <div className="pdfJsBlobViewerStatus">正在渲染 PDF…</div>
          ) : null}
          {error ? (
            <div className="pdfJsBlobViewerStatus pdfJsBlobViewerError">
              {error}
            </div>
          ) : null}
          <div ref={innerRef} className="pdfJsBlobViewerPages" />
        </div>
      </div>
    </div>
  );
}
