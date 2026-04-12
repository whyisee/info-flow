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

export type SubModuleForm = {
  key: string;
  title: string;
  type: "map" | "list";
  order: number;
  helpText: string;
  sentenceTemplate: string;
  fields: MapFieldForm[];
  attachments: AttachmentForm[];
  maxRows: number | null;
  toolbar: ToolbarForm;
  columns: ListColumnForm[];
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

function normalizeSubModule(raw: unknown, i: number, j: number): SubModuleForm {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const type = o.type === "list" ? "list" : "map";
  const fields = Array.isArray(o.fields) ? o.fields.map(normalizeMapField) : [];
  const attachments = Array.isArray(o.attachments) ? o.attachments.map(normalizeAttachment) : [];
  const columns = Array.isArray(o.columns) ? o.columns.map(normalizeColumn) : [];
  const tb = o.toolbar && typeof o.toolbar === "object" ? (o.toolbar as Record<string, unknown>) : {};
  const toolbar: ToolbarForm = {
    add: tb.add !== false,
    edit: tb.edit !== false,
    remove: tb.remove !== false,
    sort: tb.sort !== false,
  };
  const maxRows = o.maxRows;
  return {
    key: typeof o.key === "string" ? o.key : `sub_${i}_${j}`,
    title: typeof o.title === "string" ? o.title : "",
    type,
    order: typeof o.order === "number" ? o.order : j,
    helpText: typeof o.helpText === "string" ? o.helpText : "",
    sentenceTemplate: typeof o.sentenceTemplate === "string" ? o.sentenceTemplate : "",
    fields,
    attachments,
    maxRows: typeof maxRows === "number" ? maxRows : null,
    toolbar,
    columns,
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

function subModuleToApi(s: SubModuleForm, mi: number, sj: number): Record<string, unknown> {
  const base: Record<string, unknown> = {
    key: s.key.trim() || `sub_${mi}_${sj}`,
    title: s.title.trim(),
    type: s.type,
    order: sj,
    helpText: s.helpText.trim(),
  };
  if (s.type === "map") {
    base.sentenceTemplate = s.sentenceTemplate.trim();
    base.fields = (s.fields ?? [])
      .map((f, fi) => mapFieldToApi(f, mi, sj, fi))
      .filter((x) => (x.name as string).length);
    base.attachments = (s.attachments ?? [])
      .map((a, ai) => attachmentToApi(a, mi, sj, ai))
      .filter((x) => (x.key as string).length);
  } else {
    base.maxRows = s.maxRows != null && s.maxRows > 0 ? s.maxRows : 10;
    base.toolbar = { ...newDefaultToolbar(), ...s.toolbar };
    base.columns = (s.columns ?? [])
      .map((c, ci) => columnToApi(c, mi, sj, ci))
      .filter((x) => (x.name as string).length);
  }
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
