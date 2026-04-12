import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { Tabs } from "antd";
import type { TabsProps } from "antd";
import type { NavigateFunction } from "react-router-dom";
import type { TopMenuKey } from "../config/navigation";
import {
  decodeTabDataNodeKey,
  emptyTabBuckets,
  moveTabToIndex,
  reorderTabItems,
  TAB_DRAG_MIME,
  withActiveTab,
  type TabItem,
} from "./mainTabDragUtils";

type Props = {
  activeTabPath: string;
  setActiveTabPath: (path: string) => void;
  activeTop: TopMenuKey;
  locationPathname: string;
  locationState: unknown;
  navigate: NavigateFunction;
  openTabsByTop: Record<TopMenuKey, TabItem[]>;
  setOpenTabsByTop: React.Dispatch<
    React.SetStateAction<Record<TopMenuKey, TabItem[]>>
  >;
  onTabEdit: TabsProps["onEdit"];
};

/**
 * 标签条 + 拖拽逻辑独立成子组件：拖拽时只更新本组件 state，避免 MainLayout 整棵重渲染触发路由/页面重复请求。
 */
export default function MainLayoutTabStrip(props: Props) {
  const {
    activeTabPath,
    setActiveTabPath,
    activeTop,
    locationPathname,
    locationState,
    navigate,
    openTabsByTop,
    setOpenTabsByTop,
    onTabEdit,
  } = props;

  const [draggingTabPath, setDraggingTabPath] = useState<string | null>(null);
  const lastDragHoverSigRef = useRef<string>("");
  const lastDropHintElRef = useRef<HTMLElement | null>(null);
  const tabDragHostRef = useRef<HTMLDivElement | null>(null);
  const tabBarOrderDuringDragRef = useRef<TabItem[] | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{
    left: number;
    top: number;
    height: number;
    visible: boolean;
  }>({ left: 0, top: 0, height: 0, visible: false });

  const [tabBarOrderByTop, setTabBarOrderByTop] = useState<
    Record<TopMenuKey, TabItem[]>
  >(() => emptyTabBuckets());

  const clearDropHint = useCallback(() => {
    if (lastDropHintElRef.current) {
      lastDropHintElRef.current.classList.remove(
        "mainTabDropBefore",
        "mainTabDropAfter",
      );
      lastDropHintElRef.current = null;
    }
    setDropIndicator((p) => (p.visible ? { ...p, visible: false } : p));
  }, []);

  const computeTabDropPlan = useCallback(
    (clientX: number, clientY: number) => {
      const host = tabDragHostRef.current;
      if (!host) return null;
      const hostRect = host.getBoundingClientRect();

      const V_PAD = 28;
      if (clientY < hostRect.top - V_PAD || clientY > hostRect.bottom + V_PAD) {
        return null;
      }

      const EDGE = 24;
      if (clientX <= hostRect.left + EDGE) {
        return { kind: "edge" as const, edge: "start" as const, hostRect };
      }
      if (clientX >= hostRect.right - EDGE) {
        return { kind: "edge" as const, edge: "end" as const, hostRect };
      }

      const hit = document.elementFromPoint(clientX, clientY);
      const tabEl = hit?.closest(
        ".mainTabsStrip .ant-tabs-tab",
      ) as HTMLElement | null;

      const candidates: HTMLElement[] = Array.from(
        host.querySelectorAll(".mainTabsStrip .ant-tabs-tab"),
      ) as HTMLElement[];
      const fallbackTabEl =
        tabEl ??
        candidates.reduce<HTMLElement | null>((best, cur) => {
          const r = cur.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const d = Math.abs(clientX - cx);
          if (!best) return cur;
          const br = best.getBoundingClientRect();
          const bcx = br.left + br.width / 2;
          return d < Math.abs(clientX - bcx) ? cur : best;
        }, null);

      if (!fallbackTabEl) {
        return null;
      }
      const raw = fallbackTabEl.getAttribute("data-node-key");
      if (raw == null) return null;
      const toPath = decodeTabDataNodeKey(raw);
      if (!toPath) return null;
      const rect = fallbackTabEl.getBoundingClientRect();
      const placeAfter = clientX > rect.left + rect.width / 2;
      return {
        kind: "tab" as const,
        hostRect,
        tabEl: fallbackTabEl,
        rect,
        toPath,
        placeAfter,
      };
    },
    [],
  );

  useEffect(() => {
    if (draggingTabPath) return;
    setTabBarOrderByTop(openTabsByTop);
  }, [openTabsByTop, draggingTabPath]);

  const tabBarList = useMemo(() => {
    const list = tabBarOrderByTop[activeTop] ?? [];
    return withActiveTab(list, activeTabPath, locationState);
  }, [tabBarOrderByTop, activeTabPath, activeTop, locationState]);

  const handleTabStripDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";

      const fromPath = draggingTabPath;
      if (!fromPath) return;

      const plan = computeTabDropPlan(e.clientX, e.clientY);
      if (!plan) {
        clearDropHint();
        return;
      }

      if (plan.kind === "edge") {
        clearDropHint();
        const left = plan.edge === "start" ? 0 : plan.hostRect.width;
        setDropIndicator({
          left,
          top: 6,
          height: Math.max(0, plan.hostRect.height - 12),
          visible: true,
        });

        const sig = `${fromPath}=>${plan.edge}`;
        if (lastDragHoverSigRef.current === sig) return;
        lastDragHoverSigRef.current = sig;

        setTabBarOrderByTop((prev) => {
          const base = withActiveTab(prev[activeTop] ?? [], activeTabPath, locationState);
          const targetIndex = plan.edge === "start" ? 0 : base.length;
          const nextList = moveTabToIndex(base, fromPath, targetIndex);
          tabBarOrderDuringDragRef.current = nextList;
          return {
            ...prev,
            [activeTop]: nextList,
          };
        });
        return;
      }

      const { tabEl, rect, placeAfter, toPath, hostRect } = plan;
      if (fromPath === toPath) {
        clearDropHint();
        return;
      }

      const left = placeAfter ? rect.right - hostRect.left : rect.left - hostRect.left;
      const top = rect.top - hostRect.top;
      const height = rect.height;
      setDropIndicator({ left, top, height, visible: true });

      if (lastDropHintElRef.current !== tabEl) {
        clearDropHint();
        lastDropHintElRef.current = tabEl;
      } else {
        tabEl.classList.remove("mainTabDropBefore", "mainTabDropAfter");
      }
      tabEl.classList.add(placeAfter ? "mainTabDropAfter" : "mainTabDropBefore");

      const sig = `${fromPath}=>${toPath}:${placeAfter ? "after" : "before"}`;
      if (lastDragHoverSigRef.current === sig) return;
      lastDragHoverSigRef.current = sig;

      setTabBarOrderByTop((prev) => {
        const base = withActiveTab(prev[activeTop] ?? [], activeTabPath, locationState);
        const nextList = reorderTabItems(base, fromPath, toPath, placeAfter);
        tabBarOrderDuringDragRef.current = nextList;
        return { ...prev, [activeTop]: nextList };
      });
    },
    [activeTabPath, activeTop, clearDropHint, computeTabDropPlan, draggingTabPath, locationState],
  );

  const handleTabStripDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const orderSnapshot = tabBarOrderDuringDragRef.current;
      const fromPath =
        draggingTabPath ||
        e.dataTransfer.getData(TAB_DRAG_MIME) ||
        e.dataTransfer.getData("text/plain");
      if (!fromPath) return;
      setOpenTabsByTop((prev) => {
        const ordered = withActiveTab(
          (orderSnapshot && orderSnapshot.length > 0
            ? orderSnapshot
            : tabBarOrderByTop[activeTop] ?? prev[activeTop]) ?? [],
          activeTabPath,
          locationState,
        );
        return { ...prev, [activeTop]: ordered };
      });

      clearDropHint();
      lastDragHoverSigRef.current = "";
    },
    [
      activeTop,
      activeTabPath,
      clearDropHint,
      draggingTabPath,
      setOpenTabsByTop,
      tabBarOrderByTop,
      locationState,
    ],
  );

  const handleTabStripDragLeave = useCallback(
    (e: React.DragEvent) => {
      if (e.currentTarget === e.target) {
        clearDropHint();
      }
    },
    [clearDropHint],
  );

  const renderDraggableTabBar = useCallback<
    NonNullable<TabsProps["renderTabBar"]>
  >(
    (props, DefaultTabBar) => (
      <div
        className="mainTabsDragHost"
        ref={tabDragHostRef}
        onDragOver={handleTabStripDragOver}
        onDrop={handleTabStripDrop}
        onDragLeave={handleTabStripDragLeave}
      >
        <div
          className="mainTabDropIndicator"
          aria-hidden
          style={{
            transform: `translate3d(${dropIndicator.left}px, ${dropIndicator.top}px, 0)`,
            height: dropIndicator.height,
            opacity: dropIndicator.visible ? 1 : 0,
          }}
        />
        <DefaultTabBar
          {...props}
          children={(node) => {
            const el = node as unknown as React.ReactElement<any>;
            const rawKey = String((el.props as any)?.["data-node-key"] ?? "");
            const tabPath = rawKey ? decodeTabDataNodeKey(rawKey) : "";
            const draggable = tabBarList.length > 1 && Boolean(tabPath);

            return {
              ...el,
              props: {
                ...el.props,
                draggable,
                title: draggable ? "拖动排序" : el.props?.title,
                className: [el.props?.className, draggable ? "mainTabDraggable" : ""]
                  .filter(Boolean)
                  .join(" "),
                onDragStart: (ev: React.DragEvent) => {
                  if (!tabPath) return;
                  ev.dataTransfer.setData(TAB_DRAG_MIME, tabPath);
                  ev.dataTransfer.setData("text/plain", tabPath);
                  ev.dataTransfer.effectAllowed = "move";
                  lastDragHoverSigRef.current = "";
                  setActiveTabPath(tabPath);
                  const barBase =
                    tabBarOrderByTop[activeTop] ?? openTabsByTop[activeTop] ?? [];
                  tabBarOrderDuringDragRef.current = withActiveTab(
                    barBase,
                    tabPath,
                    locationState,
                  );
                  // 拖拽过程中不要 navigate：全局 URL 一变会触发 DataRouter 整树更新，
                  // 其它已挂载 Tab 仍可能被连带刷新/重复请求。松手后在 onDragEnd 再同步地址栏。
                  setDraggingTabPath(tabPath);
                  document.documentElement.classList.add("mainTabsDragging");
                  (el.props as any)?.onDragStart?.(ev);
                },
                onDragEnd: (ev: React.DragEvent) => {
                  document.documentElement.classList.remove("mainTabsDragging");
                  clearDropHint();
                  lastDragHoverSigRef.current = "";
                  requestAnimationFrame(() => {
                    tabBarOrderDuringDragRef.current = null;
                    setDraggingTabPath(null);
                    // 拖拽结束后再把地址栏同步到当前激活标签（与拖拽中不改 URL 配对）
                    queueMicrotask(() => {
                      if (locationPathname !== tabPath) {
                        navigate(tabPath, { replace: true });
                      }
                    });
                  });
                  (el.props as any)?.onDragEnd?.(ev);
                },
              },
            };
          }}
        />
      </div>
    ),
    [
      activeTop,
      clearDropHint,
      dropIndicator.height,
      dropIndicator.left,
      dropIndicator.top,
      dropIndicator.visible,
      handleTabStripDragOver,
      handleTabStripDragLeave,
      handleTabStripDrop,
      locationPathname,
      locationState,
      navigate,
      openTabsByTop,
      setActiveTabPath,
      tabBarOrderByTop,
      tabBarList.length,
    ],
  );

  const tabItems: TabsProps["items"] = tabBarList.map((t) => ({
    key: t.path,
    label: <span className="mainTabLabelText">{t.label}</span>,
    closable: tabBarList.length > 1,
  }));

  return (
    <Tabs
      className="mainTabs mainTabsStrip"
      type="editable-card"
      hideAdd
      size="small"
      activeKey={activeTabPath}
      items={tabItems}
      renderTabBar={renderDraggableTabBar}
      onChange={(key) => {
        setActiveTabPath(key);
        navigate(key, { replace: true });
      }}
      onEdit={onTabEdit}
    />
  );
}
