import { resolveTabLabel } from "../utils/routeLabels";
import type { TopMenuKey } from "../config/navigation";

export type TabItem = { path: string; label: string };

/** 与 @rc-component/tabs 中 genDataNodeKey 一致 */
export const RC_TAB_DQ_ESC = "TABS_DQ";

export function decodeTabDataNodeKey(attr: string): string {
  return attr.split(RC_TAB_DQ_ESC).join('"');
}

export function withActiveTab(
  list: TabItem[],
  activePath: string,
  locationState?: unknown,
): TabItem[] {
  if (list.some((t) => t.path === activePath)) return list;
  return [
    ...list,
    { path: activePath, label: resolveTabLabel(activePath, locationState) },
  ];
}

export function reorderTabItems(
  list: TabItem[],
  fromPath: string,
  toPath: string,
  placeAfter: boolean,
): TabItem[] {
  const fromIdx = list.findIndex((t) => t.path === fromPath);
  const toIdx = list.findIndex((t) => t.path === toPath);
  if (fromIdx < 0 || toIdx < 0) return list;

  let insertIdx = placeAfter ? toIdx + 1 : toIdx;
  const next = [...list];
  const [item] = next.splice(fromIdx, 1);
  if (fromIdx < insertIdx) insertIdx -= 1;
  insertIdx = Math.min(Math.max(0, insertIdx), next.length);
  next.splice(insertIdx, 0, item);
  return next;
}

export function moveTabToIndex(
  list: TabItem[],
  fromPath: string,
  targetIndex: number,
): TabItem[] {
  const fromIdx = list.findIndex((t) => t.path === fromPath);
  if (fromIdx < 0) return list;
  const next = [...list];
  const [item] = next.splice(fromIdx, 1);
  let idx = Math.min(Math.max(0, targetIndex), next.length);
  if (fromIdx < idx) idx -= 1;
  next.splice(idx, 0, item);
  return next;
}

export const TAB_DRAG_MIME = "application/x-infoflow-tab-path";

export function emptyTabBuckets(): Record<TopMenuKey, TabItem[]> {
  return { declaration: [], survey: [], system: [] };
}
