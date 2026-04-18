import type { DeclarationDraftShape } from "./declarationDraftShape";
import {
  normalizeDeclarationDraft,
  getMapAttachmentFiles,
  getFormValues,
  DEFAULT_SECTION_KEY,
} from "./declarationDraftShape";
import type { Expr, FieldDef, FormNode } from "../form-designer/types";

type RawModule = Record<string, unknown>;
type RawSubModule = Record<string, unknown>;
type RawSection = Record<string, unknown>;

function sortByOrder<T extends { order?: unknown }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => {
    const ao = typeof a.order === "number" ? a.order : 0;
    const bo = typeof b.order === "number" ? b.order : 0;
    return ao - bo;
  });
}

function normalizeSubSections(sub: RawSubModule): RawSection[] {
  const sectionsRaw = sub.sections;
  if (Array.isArray(sectionsRaw)) {
    const list = sectionsRaw.filter((x) => x && typeof x === "object" && !Array.isArray(x)) as RawSection[];
    return sortByOrder(list);
  }

  const sections: RawSection[] = [];
  if (sub.map && typeof sub.map === "object" && !Array.isArray(sub.map)) {
    sections.push({ key: "map_0", kind: "map", order: 0, ...(sub.map as Record<string, unknown>) });
  }
  if (sub.list && typeof sub.list === "object" && !Array.isArray(sub.list)) {
    sections.push({ key: "list_0", kind: "list", order: sections.length, ...(sub.list as Record<string, unknown>) });
  }
  if (sections.length) return sections;

  const kind = sub.type === "list" ? "list" : "map";
  return [{ key: DEFAULT_SECTION_KEY, kind, order: 0, ...sub }];
}

export type DeclarationValidationError = {
  moduleKey: string;
  subKey: string;
  sectionKey: string;
  attachmentKey: string;
  message: string;
};

function evalExpr(expr: Expr | undefined, values: Record<string, unknown>): boolean {
  if (!expr) return true;
  if (expr.op === "and") return expr.items.every((x) => evalExpr(x, values));
  if (expr.op === "or") return expr.items.some((x) => evalExpr(x, values));
  if (expr.op === "not") return !evalExpr(expr.item, values);
  const leftVal = values[expr.left.var];
  if (expr.op === "eq") return leftVal === expr.right;
  if (expr.op === "ne") return leftVal !== expr.right;
  if (expr.op === "in") return Array.isArray(expr.right) && expr.right.includes(leftVal as any);
  return true;
}

function safeFormSchema(raw: unknown): { schema: FormNode | null; fields: Record<string, FieldDef> } {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const schema = o.schema && typeof o.schema === "object" ? (o.schema as FormNode) : null;
  const fields =
    o.fields && typeof o.fields === "object" && !Array.isArray(o.fields)
      ? (o.fields as Record<string, FieldDef>)
      : {};
  return { schema, fields };
}

function walkFormFields(node: FormNode, visit: (name: string) => void): void {
  if (node.kind === "Field") {
    visit(node.name);
    return;
  }
  if (node.kind === "Repeater") {
    // 只校验 repeater 本身由上层处理；此处遍历 itemSchema 的字段名（按 item record 校验）
    walkFormFields(node.itemSchema, visit);
    return;
  }
  if ("children" in node && Array.isArray((node as any).children)) {
    ((node as any).children as FormNode[]).forEach((c) => walkFormFields(c, visit));
  }
}

export function validateDeclarationDraftAttachments(args: {
  config: Record<string, unknown>;
  draft: DeclarationDraftShape | Record<string, unknown> | undefined;
}): { ok: true; errors: [] } | { ok: false; errors: DeclarationValidationError[] } {
  const normalizedDraft = normalizeDeclarationDraft(args.draft ?? {});
  const modulesRaw = Array.isArray(args.config?.modules) ? (args.config.modules as unknown[]) : [];
  const modules = modulesRaw.filter((m) => m && typeof m === "object" && !Array.isArray(m)) as RawModule[];
  const errors: DeclarationValidationError[] = [];

  for (let mi = 0; mi < modules.length; mi++) {
    const mod = modules[mi]!;
    const moduleKey = typeof mod.key === "string" ? mod.key : `module_${mi}`;
    const subsRaw = Array.isArray(mod.subModules) ? (mod.subModules as unknown[]) : [];
    const subs = subsRaw.filter((s) => s && typeof s === "object" && !Array.isArray(s)) as RawSubModule[];
    const subsSorted = sortByOrder(subs);
    for (let si = 0; si < subsSorted.length; si++) {
      const sub = subsSorted[si]!;
      const subKey = typeof sub.key === "string" ? sub.key : `sub_${si}`;
      const sections = normalizeSubSections(sub);
      for (let k = 0; k < sections.length; k++) {
        const sec = sections[k]!;
        const sectionKey = typeof sec.key === "string" ? sec.key : `sec_${k}`;
        const kind = sec.kind === "list" ? "list" : sec.kind === "form" ? "form" : "map";
        if (kind !== "map") continue;
        const attsRaw = Array.isArray(sec.attachments) ? (sec.attachments as unknown[]) : [];
        for (let ai = 0; ai < attsRaw.length; ai++) {
          const a = attsRaw[ai];
          const o = a && typeof a === "object" ? (a as Record<string, unknown>) : {};
          const attachmentKey = typeof o.key === "string" ? o.key : `att_${ai}`;
          const required = o.required === true;
          if (!required) continue;
          const files = getMapAttachmentFiles(normalizedDraft, moduleKey, subKey, sectionKey, attachmentKey);
          if (!files.length) {
            const label = typeof o.label === "string" ? o.label : attachmentKey;
            errors.push({
              moduleKey,
              subKey,
              sectionKey,
              attachmentKey,
              message: `请上传必填附件：${label}`,
            });
          }
        }
      }
    }
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, errors: [] };
}

export function validateDeclarationDraftForm(args: {
  config: Record<string, unknown>;
  draft: DeclarationDraftShape | Record<string, unknown> | undefined;
}): { ok: true; errors: [] } | { ok: false; errors: DeclarationValidationError[] } {
  const normalizedDraft = normalizeDeclarationDraft(args.draft ?? {});
  const modulesRaw = Array.isArray(args.config?.modules) ? (args.config.modules as unknown[]) : [];
  const modules = modulesRaw.filter((m) => m && typeof m === "object" && !Array.isArray(m)) as RawModule[];
  const errors: DeclarationValidationError[] = [];

  for (let mi = 0; mi < modules.length; mi++) {
    const mod = modules[mi]!;
    const moduleKey = typeof mod.key === "string" ? mod.key : `module_${mi}`;
    const subsRaw = Array.isArray(mod.subModules) ? (mod.subModules as unknown[]) : [];
    const subs = subsRaw.filter((s) => s && typeof s === "object" && !Array.isArray(s)) as RawSubModule[];
    const subsSorted = sortByOrder(subs);
    for (let si = 0; si < subsSorted.length; si++) {
      const sub = subsSorted[si]!;
      const subKey = typeof sub.key === "string" ? sub.key : `sub_${si}`;
      const sections = normalizeSubSections(sub);
      for (let k = 0; k < sections.length; k++) {
        const sec = sections[k]!;
        if (sec.kind !== "form") continue;
        const sectionKey = typeof sec.key === "string" ? sec.key : `sec_${k}`;
        const { schema, fields } = safeFormSchema(sec);
        if (!schema) continue;
        const values = getFormValues(normalizedDraft, moduleKey, subKey, sectionKey);

        // 先校验普通字段 required（按 showWhen/requiredWhen）
        const fieldNames = new Set<string>();
        walkFormFields(schema, (n) => fieldNames.add(n));
        for (const name of fieldNames) {
          const def = fields[name];
          if (!def) continue;
          const visible = evalExpr(def.rules?.showWhen, values);
          if (!visible) continue;
          const req =
            def.rules?.required === true || evalExpr(def.rules?.requiredWhen, values);
          if (!req) continue;
          const v = values[name];
          const empty =
            v == null ||
            (typeof v === "string" && v.trim() === "") ||
            (Array.isArray(v) && v.length === 0);
          if (!empty) continue;
          errors.push({
            moduleKey,
            subKey,
            sectionKey,
            attachmentKey: name,
            message: `请填写必填项：${def.label || name}`,
          });
        }

        // 校验 attachment 字段：required 时必须有数组且非空
        for (const name of fieldNames) {
          const def = fields[name];
          if (!def || def.type !== "attachment") continue;
          const visible = evalExpr(def.rules?.showWhen, values);
          if (!visible) continue;
          const req =
            def.rules?.required === true || evalExpr(def.rules?.requiredWhen, values);
          if (!req) continue;
          const v = values[name];
          if (!Array.isArray(v) || v.length === 0) {
            errors.push({
              moduleKey,
              subKey,
              sectionKey,
              attachmentKey: name,
              message: `请上传必填附件：${def.label || name}`,
            });
          }
        }
      }
    }
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, errors: [] };
}

