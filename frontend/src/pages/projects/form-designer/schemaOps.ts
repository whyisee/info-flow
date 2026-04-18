import type { FormNode } from "../../../features/form-designer/types";

export type DropPosition = "before" | "after" | "inside";

export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export function findNode(root: FormNode, id: string): FormNode | null {
  if (root.id === id) return root;
  if (root.kind === "Repeater") return findNode(root.itemSchema, id);
  if ("children" in root && Array.isArray((root as any).children)) {
    for (const c of (root as any).children as FormNode[]) {
      const hit = findNode(c, id);
      if (hit) return hit;
    }
  }
  return null;
}

export function removeNode(root: FormNode, id: string): { next: FormNode; removed: FormNode | null } {
  if (root.kind === "Repeater") {
    const r = removeNode(root.itemSchema, id);
    if (!r.removed) return { next: root, removed: null };
    return { next: { ...root, itemSchema: r.next }, removed: r.removed };
  }
  if (!("children" in root) || !Array.isArray((root as any).children)) return { next: root, removed: null };
  const children = (root as any).children as FormNode[];
  const idx = children.findIndex((c) => c.id === id);
  if (idx >= 0) {
    const removed = children[idx]!;
    const nextChildren = [...children.slice(0, idx), ...children.slice(idx + 1)];
    return { next: { ...(root as any), children: nextChildren } as FormNode, removed };
  }
  let removed: FormNode | null = null;
  const nextChildren = children.map((c) => {
    if (removed) return c;
    const r = removeNode(c, id);
    if (r.removed) removed = r.removed;
    return r.next;
  });
  return { next: { ...(root as any), children: nextChildren } as FormNode, removed };
}

export function insertNode(
  root: FormNode,
  targetId: string,
  pos: DropPosition,
  node: FormNode,
): FormNode {
  if (pos === "inside" && root.id === targetId) {
    if ("children" in root && Array.isArray((root as any).children)) {
      const children = (root as any).children as FormNode[];
      return { ...(root as any), children: [...children, node] } as FormNode;
    }
    // if target can't have children, fallback to after (handled by parent)
  }
  if (root.kind === "Repeater") {
    return { ...root, itemSchema: insertNode(root.itemSchema, targetId, pos, node) };
  }
  if (!("children" in root) || !Array.isArray((root as any).children)) return root;
  const children = (root as any).children as FormNode[];
  const idx = children.findIndex((c) => c.id === targetId);
  if (idx >= 0 && (pos === "before" || pos === "after")) {
    const at = pos === "before" ? idx : idx + 1;
    const nextChildren = [...children.slice(0, at), node, ...children.slice(at)];
    return { ...(root as any), children: nextChildren } as FormNode;
  }
  const nextChildren = children.map((c) => insertNode(c, targetId, pos, node));
  return { ...(root as any), children: nextChildren } as FormNode;
}

export function moveNode(root: FormNode, sourceId: string, targetId: string, pos: DropPosition): FormNode {
  if (sourceId === targetId) return root;
  const r = removeNode(root, sourceId);
  if (!r.removed) return root;
  return insertNode(r.next, targetId, pos, r.removed);
}

export function updateNode(root: FormNode, id: string, patch: Partial<FormNode>): FormNode {
  if (root.id === id) {
    return { ...root, ...patch } as FormNode;
  }
  if (root.kind === "Repeater") {
    return { ...root, itemSchema: updateNode(root.itemSchema, id, patch) };
  }
  if (!("children" in root) || !Array.isArray((root as any).children)) return root;
  const children = (root as any).children as FormNode[];
  const nextChildren = children.map((c) => updateNode(c, id, patch));
  return { ...(root as any), children: nextChildren } as FormNode;
}

