/** 与后端存储的 config 与表单之间的转换、缺省补全 */

export type MapFieldForm = {
  name: string;
  label: string;
  widget: string;
  required: boolean;
};

export type AttachmentForm = {
  key: string;
  label: string;
  required: boolean;
  accept: string;
  maxSize: number | null;
  templateUrl: string;
};

export type ListColumnForm = {
  name: string;
  title: string;
  cellType: string;
  width: number | null;
};

export type ToolbarForm = {
  add: boolean;
  edit: boolean;
  remove: boolean;
  sort: boolean;
};

export type SubModuleSectionForm = {
  key: string;
  title: string;
  kind: "map" | "list" | "form_ref";
  order: number;
  // map
  sentenceTemplate: string;
  fields: MapFieldForm[];
  attachments: AttachmentForm[];
  // list
  maxRows: number | null;
  toolbar: ToolbarForm;
  columns: ListColumnForm[];
  // form (designer)
  templateId?: number | null;
  templateVersion?: number | null;
  // 兼容旧自由表单配置：仍可被 normalize 进来，但编辑端不再生成
  formSchemaJson: string;
  formFieldsJson: string;
};

export type SubModuleForm = {
  key: string;
  title: string;
  order: number;
  helpText: string;
  sections: SubModuleSectionForm[];
};

export type ModuleForm = {
  key: string;
  title: string;
  order: number;
  subModules: SubModuleForm[];
};

export type DeclarationFormValues = {
  modules: ModuleForm[];
};

export const newDefaultToolbar = (): ToolbarForm => ({
  add: true,
  edit: true,
  remove: true,
  sort: true,
});

function normalizeMapField(raw: unknown, i: number): MapFieldForm {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const v = o.validation && typeof o.validation === "object" ? (o.validation as Record<string, unknown>) : {};
  return {
    name: typeof o.name === "string" ? o.name : `field_${i}`,
    label: typeof o.label === "string" ? o.label : "",
    widget: typeof o.widget === "string" ? o.widget : "input",
    required: v.required === true,
  };
}

function normalizeAttachment(raw: unknown, i: number): AttachmentForm {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const maxSize = o.maxSize;
  return {
    key: typeof o.key === "string" ? o.key : `file_${i}`,
    label: typeof o.label === "string" ? o.label : "",
    required: o.required === true,
    accept: typeof o.accept === "string" ? o.accept : ".pdf",
    maxSize: typeof maxSize === "number" ? maxSize : null,
    templateUrl: typeof o.templateUrl === "string" ? o.templateUrl : "",
  };
}

function normalizeColumn(raw: unknown, i: number): ListColumnForm {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const w = o.width;
  return {
    name: typeof o.name === "string" ? o.name : `col_${i}`,
    title: typeof o.title === "string" ? o.title : "",
    cellType: typeof o.cellType === "string" ? o.cellType : "text",
    width: typeof w === "number" ? w : null,
  };
}

function normalizeSection(
  raw: unknown,
  i: number,
  j: number,
  k: number,
): SubModuleSectionForm {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const kind =
    o.kind === "list"
      ? "list"
      : o.kind === "form_ref"
        ? "form_ref"
        : "map";

  const rawFields = o.fields;
  const fields = Array.isArray(rawFields)
    ? (rawFields as unknown[]).map(normalizeMapField)
    : [];

  const rawAttachments = o.attachments;
  const attachments = Array.isArray(rawAttachments)
    ? (rawAttachments as unknown[]).map(normalizeAttachment)
    : [];

  const rawColumns = o.columns;
  const columns = Array.isArray(rawColumns)
    ? (rawColumns as unknown[]).map(normalizeColumn)
    : [];

  const tb = o.toolbar && typeof o.toolbar === "object" ? (o.toolbar as Record<string, unknown>) : {};
  const toolbar: ToolbarForm = {
    add: tb.add !== false,
    edit: tb.edit !== false,
    remove: tb.remove !== false,
    sort: tb.sort !== false,
  };

  const maxRows = o.maxRows;
  return {
    key: typeof o.key === "string" ? o.key : `sec_${i}_${j}_${k}`,
    title: typeof o.title === "string" ? o.title : "",
    kind,
    order: typeof o.order === "number" ? o.order : k,
    sentenceTemplate: typeof o.sentenceTemplate === "string" ? o.sentenceTemplate : "",
    fields,
    attachments,
    maxRows: typeof maxRows === "number" ? maxRows : null,
    toolbar,
    columns,
    templateId:
      typeof o.templateId === "number"
        ? o.templateId
        : typeof o.templateId === "string"
          ? Number(o.templateId)
          : typeof o.template_id === "number"
            ? (o.template_id as number)
            : null,
    templateVersion:
      typeof o.templateVersion === "number"
        ? o.templateVersion
        : typeof o.templateVersion === "string"
          ? Number(o.templateVersion)
          : typeof o.template_version === "number"
            ? (o.template_version as number)
            : null,
    formSchemaJson: (() => {
      try {
        return typeof o.schema === "string"
          ? o.schema
          : o.schema != null
            ? JSON.stringify(o.schema, null, 2)
            : "";
      } catch {
        return "";
      }
    })(),
    formFieldsJson: (() => {
      try {
        // 注意：map 的 fields 是数组。这里只用于兼容旧 kind=form 的 fields（对象）
        const rawFieldsForForm = (o as any).fields;
        return typeof rawFieldsForForm === "string"
          ? rawFieldsForForm
          : rawFieldsForForm != null && !Array.isArray(rawFieldsForForm)
            ? JSON.stringify(rawFieldsForForm, null, 2)
            : "";
      } catch {
        return "";
      }
    })(),
  };
}

function normalizeSubModule(raw: unknown, i: number, j: number): SubModuleForm {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  // v3：sections
  const rawSections = Array.isArray(o.sections) ? (o.sections as unknown[]) : null;
  let sections: SubModuleSectionForm[] = [];
  if (rawSections && rawSections.length) {
    sections = rawSections.map((s, k) => normalizeSection(s, i, j, k));
  } else {
    // v2：map/list（最多各一个） -> sections（map 再 list）
    const mapPart =
      o.map && typeof o.map === "object" && !Array.isArray(o.map)
        ? (o.map as Record<string, unknown>)
        : null;
    const listPart =
      o.list && typeof o.list === "object" && !Array.isArray(o.list)
        ? (o.list as Record<string, unknown>)
        : null;
    if (mapPart) {
      sections.push(
        normalizeSection({ key: "map_0", kind: "map", order: 0, ...mapPart }, i, j, 0),
      );
    }
    if (listPart) {
      sections.push(
        normalizeSection(
          { key: "list_0", kind: "list", order: sections.length, ...listPart },
          i,
          j,
          sections.length,
        ),
      );
    }
    // v1：type + 平铺字段
    if (!sections.length) {
      const kind = o.type === "list" ? "list" : "map";
      sections = [
        normalizeSection(
          {
            key: "__default",
            kind,
            order: 0,
            sentenceTemplate: o.sentenceTemplate,
            fields: o.fields,
            attachments: o.attachments,
            maxRows: o.maxRows,
            toolbar: o.toolbar,
            columns: o.columns,
          },
          i,
          j,
          0,
        ),
      ];
    }
  }

  return {
    key: typeof o.key === "string" ? o.key : `sub_${i}_${j}`,
    title: typeof o.title === "string" ? o.title : "",
    order: typeof o.order === "number" ? o.order : j,
    helpText: typeof o.helpText === "string" ? o.helpText : "",
    sections,
  };
}

function normalizeModule(raw: unknown, i: number): ModuleForm {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const subs = Array.isArray(o.subModules) ? o.subModules : [];
  return {
    key: typeof o.key === "string" ? o.key : `module_${i}`,
    title: typeof o.title === "string" ? o.title : "",
    order: typeof o.order === "number" ? o.order : i,
    subModules: subs.map((s, j) => normalizeSubModule(s, i, j)),
  };
}

export function configToFormValues(cfg: Record<string, unknown>): DeclarationFormValues {
  const modules = Array.isArray(cfg.modules) ? cfg.modules : [];
  return {
    modules: modules.map(normalizeModule),
  };
}

function mapFieldToApi(f: MapFieldForm, mi: number, sj: number, fi: number): Record<string, unknown> {
  const name = f.name.trim() || `field_${mi}_${sj}_${fi}`;
  return {
    name,
    label: f.label.trim(),
    widget: f.widget || "input",
    validation: { required: f.required },
  };
}

function attachmentToApi(a: AttachmentForm, mi: number, sj: number, ai: number): Record<string, unknown> {
  const key = a.key.trim() || `file_${mi}_${sj}_${ai}`;
  const o: Record<string, unknown> = {
    key,
    label: a.label.trim(),
    required: a.required,
    accept: a.accept.trim() || ".pdf",
  };
  if (a.maxSize != null && a.maxSize > 0) o.maxSize = a.maxSize;
  if (a.templateUrl.trim()) o.templateUrl = a.templateUrl.trim();
  return o;
}

function columnToApi(c: ListColumnForm, mi: number, sj: number, ci: number): Record<string, unknown> {
  const name = c.name.trim() || `col_${mi}_${sj}_${ci}`;
  const o: Record<string, unknown> = {
    name,
    title: c.title.trim(),
    cellType: c.cellType || "text",
  };
  if (c.width != null && c.width > 0) o.width = c.width;
  return o;
}

function sectionToApi(
  sec: SubModuleSectionForm,
  mi: number,
  sj: number,
  k: number,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    key: sec.key.trim() || `sec_${mi}_${sj}_${k}`,
    title: sec.title.trim(),
    kind: sec.kind,
    order: k,
  };
  if (sec.kind === "map") {
    base.sentenceTemplate = sec.sentenceTemplate.trim();
    base.fields = (sec.fields ?? [])
      .map((f, fi) => mapFieldToApi(f, mi, sj, fi))
      .filter((x) => (x.name as string).length);
    base.attachments = (sec.attachments ?? [])
      .map((a, ai) => attachmentToApi(a, mi, sj, ai))
      .filter((x) => (x.key as string).length);
  } else if (sec.kind === "list") {
    base.maxRows = sec.maxRows != null && sec.maxRows > 0 ? sec.maxRows : 10;
    base.toolbar = { ...newDefaultToolbar(), ...sec.toolbar };
    base.columns = (sec.columns ?? [])
      .map((c, ci) => columnToApi(c, mi, sj, ci))
      .filter((x) => (x.name as string).length);
  } else {
    // form_ref
    base.templateId = sec.templateId ?? null;
    base.templateVersion = sec.templateVersion ?? null;
  }
  return base;
}

function subModuleToApi(s: SubModuleForm, mi: number, sj: number): Record<string, unknown> {
  const base: Record<string, unknown> = {
    key: s.key.trim() || `sub_${mi}_${sj}`,
    title: s.title.trim(),
    order: sj,
    helpText: s.helpText.trim(),
  };
  const sections = (s.sections ?? [])
    .map((sec, k) => sectionToApi(sec, mi, sj, k))
    .filter((x) => typeof x.key === "string" && (x.key as string).length > 0);
  base.sections = sections;
  // 兼容字段：type 取第一个 section.kind（便于旧逻辑粗略识别）
  base.type = sections[0]?.kind === "list" ? "list" : "map";
  return base;
}

export function formValuesToConfig(values: DeclarationFormValues): Record<string, unknown> {
  const modules = (values?.modules ?? []).map((m, mi) => ({
    key: m.key.trim() || `module_${mi}`,
    title: m.title.trim(),
    order: mi,
    subModules: (m.subModules ?? []).map((s, sj) => subModuleToApi(s, mi, sj)),
  }));
  return { modules };
}

export const emptyDeclarationFormValues = (): DeclarationFormValues => ({
  modules: [],
});
