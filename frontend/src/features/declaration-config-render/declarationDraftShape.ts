/** 与 content.declaration 对齐：按模块 key、子模块 key 存 map / list 填报值 */

export const DEFAULT_SECTION_KEY = "__default";

/**
 * 单个 section 的草稿值：section.kind=map 时用 map；section.kind=list 时用 list。
 * 允许并存是为了兼容历史数据/渐进扩展，但渲染与编辑会按 section.kind 使用对应部分。
 */
export type DeclarationSectionDraft = {
  map?: Record<string, unknown>;
  list?: { rows: Record<string, unknown>[] };
  form?: { values: Record<string, unknown> };
};

export type DeclarationAttachmentRef = {
  id: number;
  file_name: string;
  file_size?: number;
  file_type?: string;
  created_at?: string;
};

type MapDraft = Record<string, unknown> & {
  __attachments?: Record<string, DeclarationAttachmentRef[]>;
};

export type DeclarationDraftShape = {
  /**
   * modules[moduleKey][subKey][sectionKey] = sectionDraft
   * 兼容旧存储：modules[moduleKey][subKey] 可能直接是 {map|list}，normalize 时会包一层 sectionKey。
   */
  modules: Record<string, Record<string, Record<string, DeclarationSectionDraft>>>;
};

export function emptyDeclarationDraft(): DeclarationDraftShape {
  return { modules: {} };
}

function isSectionDraftLike(v: unknown): v is DeclarationSectionDraft {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  if ("map" in o || "list" in o) return true;
  return false;
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
  const modules = m as Record<string, unknown>;
  const nextModules: DeclarationDraftShape["modules"] = {};
  for (const [moduleKey, modVal] of Object.entries(modules)) {
    if (!modVal || typeof modVal !== "object" || Array.isArray(modVal)) continue;
    const modObj = modVal as Record<string, unknown>;
    const nextSub: Record<string, Record<string, DeclarationSectionDraft>> = {};
    for (const [subKey, subVal] of Object.entries(modObj)) {
      if (!subVal || typeof subVal !== "object" || Array.isArray(subVal)) continue;
      // 新结构：subVal 是 sections map
      const candidate = subVal as Record<string, unknown>;
      const keys = Object.keys(candidate);
      const looksLikeSections = keys.some((k) => {
        const sec = candidate[k];
        return isSectionDraftLike(sec);
      });
      if (looksLikeSections) {
        const secMap: Record<string, DeclarationSectionDraft> = {};
        for (const [sectionKey, secVal] of Object.entries(candidate)) {
          if (isSectionDraftLike(secVal)) secMap[sectionKey] = secVal;
        }
        nextSub[subKey] = Object.keys(secMap).length ? secMap : { [DEFAULT_SECTION_KEY]: {} };
        continue;
      }

      // 旧结构：subVal 直接是 {map|list}
      if (isSectionDraftLike(subVal)) {
        nextSub[subKey] = { [DEFAULT_SECTION_KEY]: subVal };
      }
    }
    nextModules[moduleKey] = nextSub;
  }
  return { modules: nextModules };
}

export function getMapFields(
  draft: DeclarationDraftShape,
  moduleKey: string,
  subKey: string,
  sectionKey: string = DEFAULT_SECTION_KEY,
): Record<string, unknown> {
  const sec = draft.modules[moduleKey]?.[subKey]?.[sectionKey];
  if (sec?.map && typeof sec.map === "object" && !Array.isArray(sec.map)) return sec.map;
  return {};
}

export function getMapAttachmentFiles(
  draft: DeclarationDraftShape,
  moduleKey: string,
  subKey: string,
  sectionKey: string,
  attachmentKey: string,
): DeclarationAttachmentRef[] {
  const map = getMapFields(draft, moduleKey, subKey, sectionKey) as MapDraft;
  const list = map.__attachments?.[attachmentKey];
  if (!Array.isArray(list)) return [];
  return list.filter((x) => x && typeof x === "object" && typeof x.id === "number") as DeclarationAttachmentRef[];
}

export function setMapAttachmentFiles(
  draft: DeclarationDraftShape,
  moduleKey: string,
  subKey: string,
  sectionKey: string,
  attachmentKey: string,
  files: DeclarationAttachmentRef[],
): DeclarationDraftShape {
  const prev = getMapFields(draft, moduleKey, subKey, sectionKey) as MapDraft;
  const nextAttach = { ...(prev.__attachments ?? {}) };
  nextAttach[attachmentKey] = files;
  return setMapField(draft, moduleKey, subKey, sectionKey, "__attachments", nextAttach);
}

export function setMapField(
  draft: DeclarationDraftShape,
  moduleKey: string,
  subKey: string,
  sectionKey: string,
  fieldName: string,
  value: unknown,
): DeclarationDraftShape {
  const mod = draft.modules[moduleKey] ? { ...draft.modules[moduleKey] } : {};
  const prevSub = mod[subKey] ? { ...mod[subKey] } : {};
  const prevSec = prevSub[sectionKey];
  const prevMap =
    prevSec?.map && typeof prevSec.map === "object" && !Array.isArray(prevSec.map)
      ? { ...prevSec.map }
      : {};
  prevMap[fieldName] = value;
  prevSub[sectionKey] = { ...prevSec, map: prevMap };
  mod[subKey] = prevSub;
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
  sectionKey: string = DEFAULT_SECTION_KEY,
): Record<string, unknown>[] | null {
  const sec = draft.modules[moduleKey]?.[subKey]?.[sectionKey];
  if (sec?.list && typeof sec.list === "object" && Array.isArray(sec.list.rows))
    return sec.list.rows;
  return null;
}

export function setListRows(
  draft: DeclarationDraftShape,
  moduleKey: string,
  subKey: string,
  sectionKey: string,
  rows: Record<string, unknown>[],
): DeclarationDraftShape {
  const mod = draft.modules[moduleKey] ? { ...draft.modules[moduleKey] } : {};
  const prevSub = mod[subKey] ? { ...mod[subKey] } : {};
  const prevSec = prevSub[sectionKey];
  prevSub[sectionKey] = { ...prevSec, list: { rows } };
  mod[subKey] = prevSub;
  return {
    ...draft,
    modules: { ...draft.modules, [moduleKey]: mod },
  };
}

export function getFormValues(
  draft: DeclarationDraftShape,
  moduleKey: string,
  subKey: string,
  sectionKey: string,
): Record<string, unknown> {
  const sec = draft.modules[moduleKey]?.[subKey]?.[sectionKey];
  const v = sec?.form?.values;
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}

export function setFormValue(
  draft: DeclarationDraftShape,
  moduleKey: string,
  subKey: string,
  sectionKey: string,
  fieldName: string,
  value: unknown,
): DeclarationDraftShape {
  const mod = draft.modules[moduleKey] ? { ...draft.modules[moduleKey] } : {};
  const prevSub = mod[subKey] ? { ...mod[subKey] } : {};
  const prevSec = prevSub[sectionKey];
  const prevValues = getFormValues(draft, moduleKey, subKey, sectionKey);
  const nextValues = { ...prevValues, [fieldName]: value };
  prevSub[sectionKey] = { ...prevSec, form: { values: nextValues } };
  mod[subKey] = prevSub;
  return { ...draft, modules: { ...draft.modules, [moduleKey]: mod } };
}

/** form_ref section stores its answers under a dedicated key */
export function getFormRefValues(
  draft: DeclarationDraftShape,
  moduleKey: string,
  subKey: string,
  sectionKey: string,
): Record<string, unknown> {
  const sec = draft.modules[moduleKey]?.[subKey]?.[sectionKey];
  const v = sec?.form?.values;
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}

export function setFormRefValues(
  draft: DeclarationDraftShape,
  moduleKey: string,
  subKey: string,
  sectionKey: string,
  values: Record<string, unknown>,
): DeclarationDraftShape {
  const mod = draft.modules[moduleKey] ? { ...draft.modules[moduleKey] } : {};
  const prevSub = mod[subKey] ? { ...mod[subKey] } : {};
  const prevSec = prevSub[sectionKey];
  prevSub[sectionKey] = { ...prevSec, form: { values } };
  mod[subKey] = prevSub;
  return { ...draft, modules: { ...draft.modules, [moduleKey]: mod } };
}
