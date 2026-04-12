/** 与 content.declaration 对齐：按模块 key、子模块 key 存 map / list 填报值 */

export type DeclarationSubDraft =
  | { map: Record<string, unknown> }
  | { list: { rows: Record<string, unknown>[] } };

export type DeclarationDraftShape = {
  modules: Record<string, Record<string, DeclarationSubDraft>>;
};

export function emptyDeclarationDraft(): DeclarationDraftShape {
  return { modules: {} };
}

export function normalizeDeclarationDraft(value: unknown): DeclarationDraftShape {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptyDeclarationDraft();
  }
  const v = value as Record<string, unknown>;
  const m = v.modules;
  if (!m || typeof m !== "object" || Array.isArray(m)) {
    return emptyDeclarationDraft();
  }
  return { modules: m as DeclarationDraftShape["modules"] };
}

export function getMapFields(
  draft: DeclarationDraftShape,
  moduleKey: string,
  subKey: string,
): Record<string, unknown> {
  const sub = draft.modules[moduleKey]?.[subKey];
  if (sub && "map" in sub && sub.map && typeof sub.map === "object" && !Array.isArray(sub.map)) {
    return sub.map as Record<string, unknown>;
  }
  return {};
}

export function setMapField(
  draft: DeclarationDraftShape,
  moduleKey: string,
  subKey: string,
  fieldName: string,
  value: unknown,
): DeclarationDraftShape {
  const mod = draft.modules[moduleKey] ? { ...draft.modules[moduleKey] } : {};
  const prevSub = mod[subKey];
  const prevMap =
    prevSub && "map" in prevSub && prevSub.map && typeof prevSub.map === "object" && !Array.isArray(prevSub.map)
      ? { ...(prevSub.map as Record<string, unknown>) }
      : {};
  prevMap[fieldName] = value;
  mod[subKey] = { map: prevMap };
  return {
    ...draft,
    modules: { ...draft.modules, [moduleKey]: mod },
  };
}

/** 未设置过 list 时返回 null，与「空数组」区分由调用方处理 */
export function getListRows(
  draft: DeclarationDraftShape,
  moduleKey: string,
  subKey: string,
): Record<string, unknown>[] | null {
  const sub = draft.modules[moduleKey]?.[subKey];
  if (sub && "list" in sub && sub.list && typeof sub.list === "object" && Array.isArray(sub.list.rows)) {
    return sub.list.rows as Record<string, unknown>[];
  }
  return null;
}

export function setListRows(
  draft: DeclarationDraftShape,
  moduleKey: string,
  subKey: string,
  rows: Record<string, unknown>[],
): DeclarationDraftShape {
  const mod = draft.modules[moduleKey] ? { ...draft.modules[moduleKey] } : {};
  mod[subKey] = { list: { rows } };
  return {
    ...draft,
    modules: { ...draft.modules, [moduleKey]: mod },
  };
}
