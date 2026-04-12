import { useCallback, useEffect, useRef, useState } from "react";

const TOC_ITEMS: { id: string; label: string }[] = [
  { id: "profile-section-basic", label: "基本信息" },
  { id: "profile-section-tasks", label: "任务与关键词" },
  { id: "profile-section-contact", label: "联系方式" },
  { id: "profile-section-supervisors", label: "导师与回避" },
];

const SCROLL_ROOT_SELECTOR = ".mainOutletWrap";

function getScrollRoot(): HTMLElement | null {
  return document.querySelector(SCROLL_ROOT_SELECTOR);
}

/**
 * 优先：在「与滚动区相交」的节标题中，选标题垂直中心距滚动区中线最近的一节
 * （解决最后一节标题已进入视口但顶边仍在中线下方时仍高亮上一节的问题）。
 * 若无任何标题与滚动区相交（大段正文间隙），回退为「顶边 ≤ 中线」的最后一节。
 */
function computeActiveSection(): string {
  const root = getScrollRoot();
  if (!root) return TOC_ITEMS[0].id;
  const rootRect = root.getBoundingClientRect();
  const centerY = rootRect.top + rootRect.height / 2;

  let bestIdx = -1;
  let bestDist = Infinity;
  TOC_ITEMS.forEach((item, i) => {
    const el = document.getElementById(item.id);
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.bottom < rootRect.top || r.top > rootRect.bottom) return;
    const midY = r.top + r.height / 2;
    const dist = Math.abs(midY - centerY);
    if (dist < bestDist - 1e-3 || (Math.abs(dist - bestDist) < 1e-3 && i > bestIdx)) {
      bestDist = dist;
      bestIdx = i;
    }
  });
  if (bestIdx >= 0) return TOC_ITEMS[bestIdx].id;

  let active = TOC_ITEMS[0].id;
  for (const { id } of TOC_ITEMS) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (el.getBoundingClientRect().top <= centerY) active = id;
  }
  return active;
}

export default function ProfileToc() {
  const [activeId, setActiveId] = useState<string>(TOC_ITEMS[0].id);
  const rafRef = useRef<number | null>(null);

  const go = useCallback((id: string) => {
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveId(id);
  }, []);

  useEffect(() => {
    const root = getScrollRoot();
    if (!root) return undefined;

    const tick = () => {
      rafRef.current = null;
      setActiveId(computeActiveSection());
    };

    const onScroll = () => {
      if (rafRef.current != null) return;
      rafRef.current = window.requestAnimationFrame(tick);
    };

    tick();
    root.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    const ro = new ResizeObserver(onScroll);
    ro.observe(root);

    return () => {
      root.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      ro.disconnect();
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <nav className="profileToc" aria-label="本页目录">
      <ul className="profileTocList">
        {TOC_ITEMS.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={
                item.id === activeId
                  ? "profileTocLink profileTocLinkActive"
                  : "profileTocLink"
              }
              aria-current={item.id === activeId ? "location" : undefined}
              onClick={() => go(item.id)}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
