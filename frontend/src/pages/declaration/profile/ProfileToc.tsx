import { useCallback, useEffect, useRef, useState } from "react";

import type { ProfileTocItem } from "./profileTocItems";

const SCROLL_ROOT_SELECTOR = ".mainOutletWrap";

function getScrollRoot(): HTMLElement | null {
  return document.querySelector(SCROLL_ROOT_SELECTOR);
}

/**
 * 优先：在「与滚动区相交」的节标题中，选标题垂直中心距滚动区中线最近的一节
 * （解决最后一节标题已进入视口但顶边仍在中线下方时仍高亮上一节的问题）。
 * 若无任何标题与滚动区相交（大段正文间隙），回退为「顶边 ≤ 中线」的最后一节。
 */
function computeActiveSection(items: ProfileTocItem[]): string | null {
  if (items.length === 0) return null;
  const root = getScrollRoot();
  if (!root) return items[0].id;
  const rootRect = root.getBoundingClientRect();
  const centerY = rootRect.top + rootRect.height / 2;

  let bestIdx = -1;
  let bestDist = Infinity;
  items.forEach((item, i) => {
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
  if (bestIdx >= 0) return items[bestIdx].id;

  let active = items[0].id;
  for (const { id } of items) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (el.getBoundingClientRect().top <= centerY) active = id;
  }
  return active;
}

export default function ProfileToc({ items }: { items: ProfileTocItem[] }) {
  const [activeId, setActiveId] = useState<string | null>(items[0]?.id ?? null);
  const rafRef = useRef<number | null>(null);
  const currentActiveId =
    activeId && items.some((item) => item.id === activeId)
      ? activeId
      : items[0]?.id ?? null;

  const go = useCallback((id: string) => {
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveId(id);
  }, []);

  useEffect(() => {
    if (items.length === 0) return undefined;
    const root = getScrollRoot();
    if (!root) return undefined;

    const tick = () => {
      rafRef.current = null;
      setActiveId(computeActiveSection(items));
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
  }, [items]);

  if (items.length === 0) return null;

  return (
    <nav className="profileToc" aria-label="本页目录">
      <ul className="profileTocList">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={
                item.id === currentActiveId
                  ? "profileTocLink profileTocLinkActive"
                  : "profileTocLink"
              }
              aria-current={item.id === currentActiveId ? "location" : undefined}
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
