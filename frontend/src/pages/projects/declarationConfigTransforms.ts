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
  colSpan: number;
};

export type ToolbarForm = {
  add: boolean;
  edit: boolean;
  remove: boolean;
  sort: boolean;
};

export type PrintTitleMode = "top" | "left_merged" | "hidden";
export type MapPrintMode = "text_block" | "field_table" | "statement_grid";

export type StatementColumnForm = {
  title: string;
  content: string;
  footer_label: string;
  date_label: string;
  col_span: number;
};

export type StatementLayoutForm = {
  /** @deprecated 声明签章布局不再展示顶部说明，仅保留兼容旧配置读取。 */
  intro_title?: string;
  /** @deprecated 声明签章布局不再展示顶部说明，仅保留兼容旧配置读取。 */
  intro_content?: string;
  /** @deprecated 声明签章布局不再展示顶部说明，仅保留兼容旧配置读取。 */
  intro_title_span?: number;
  columns: StatementColumnForm[];
};

export type ProfileBindingFieldForm = {
  field_key: string;
  required_in_project: boolean;
  visible_label: string;
  group: string;
};

export type ProfileBindingTableCellForm = {
  field_key: string;
  label: string;
  label_span: number;
  value_span: number;
  col_span: number;
};

export type ProfileBindingTableRowForm = {
  cells: ProfileBindingTableCellForm[];
};

export type ProfileBindingTableLayoutForm = {
  columns: number;
  rows: ProfileBindingTableRowForm[];
};

export type ProfileBindingForm = {
  enabled: boolean;
  fields: ProfileBindingFieldForm[];
  table_layout: ProfileBindingTableLayoutForm;
};

export type SubModuleSectionForm = {
  key: string;
  title: string;
  kind: "map" | "list" | "form_ref";
  order: number;
  // map
  sentenceTemplate: string;
  mapPrintMode: MapPrintMode;
  printColumns: number;
  printRows: number;
  printTitleMode: PrintTitleMode;
  printTitleSpan: number;
  statementLayout: StatementLayoutForm;
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
  profileBinding: ProfileBindingForm;
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
  const colSpan = o.colSpan ?? o.col_span ?? o.printColSpan ?? o.print_col_span;
  return {
    name: typeof o.name === "string" ? o.name : `col_${i}`,
    title: typeof o.title === "string" ? o.title : "",
    cellType: typeof o.cellType === "string" ? o.cellType : "text",
    width: typeof w === "number" ? w : null,
    colSpan: typeof colSpan === "number" && colSpan > 0 ? colSpan : 2,
  };
}

function defaultStatementLayout(): StatementLayoutForm {
  return {
    columns: [
      {
        title: "个人承诺:",
        content:
          "本人所提供的个人信息和证明材料真实准确，且无申报通知规定不予推荐申报的情形，如有任何不实、弄虚作假或违反政策规定的情况，愿按有关规定承担责任并接受相应处理。",
        footer_label: "签字:",
        date_label: "年    月    日",
        col_span: 4,
      },
      {
        title: "单位意见:",
        content:
          "经审查,该同志在本表中所列科研业绩成果真实 有效,同意推荐其申报国家级/黑龙江省政府特殊津贴。",
        footer_label: "单位盖章:",
        date_label: "年    月    日",
        col_span: 4,
      },
      {
        title: "中省直主管部门/市(地)人社部门意见:",
        content:
          "经审核,该同志在本表中的科研业绩成果 真实有效,同意推荐其申报国家级/黑龙江省 政府特殊津贴。",
        footer_label: "单位盖章:",
        date_label: "年    月    日",
        col_span: 4,
      },
    ],
  };
}

function normalizeStatementColumn(raw: unknown, i: number): StatementColumnForm {
  const defaults = defaultStatementLayout().columns[i] ?? defaultStatementLayout().columns[0];
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const colSpan = o.col_span ?? o.colSpan;
  return {
    title: typeof o.title === "string" ? o.title : defaults.title,
    content: typeof o.content === "string" ? o.content : defaults.content,
    footer_label:
      typeof o.footer_label === "string"
        ? o.footer_label
        : typeof o.footerLabel === "string"
          ? o.footerLabel
          : defaults.footer_label,
    date_label:
      typeof o.date_label === "string"
        ? o.date_label
        : typeof o.dateLabel === "string"
          ? o.dateLabel
          : defaults.date_label,
    col_span: typeof colSpan === "number" && colSpan > 0 ? colSpan : defaults.col_span,
  };
}

function normalizeStatementLayout(raw: unknown): StatementLayoutForm {
  const defaults = defaultStatementLayout();
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rawColumns = Array.isArray(o.columns) ? o.columns : defaults.columns;
  return {
    columns: rawColumns.map(normalizeStatementColumn),
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
  const printColumns = o.printColumns ?? o.print_columns;
  const printRows = o.printRows ?? o.print_rows;
  const rawPrintTitleMode = o.printTitleMode ?? o.print_title_mode;
  const printTitleSpan = o.printTitleSpan ?? o.print_title_span;
  const rawMapPrintMode = o.mapPrintMode ?? o.map_print_mode;
  return {
    key: typeof o.key === "string" ? o.key : `sec_${i}_${j}_${k}`,
    title: typeof o.title === "string" ? o.title : "",
    kind,
    order: typeof o.order === "number" ? o.order : k,
    sentenceTemplate: typeof o.sentenceTemplate === "string" ? o.sentenceTemplate : "",
    mapPrintMode:
      rawMapPrintMode === "field_table" || rawMapPrintMode === "statement_grid"
        ? rawMapPrintMode
        : "text_block",
    fields,
    attachments,
    maxRows: typeof maxRows === "number" ? maxRows : null,
    printColumns: typeof printColumns === "number" && printColumns > 0 ? printColumns : 12,
    printRows: typeof printRows === "number" && printRows > 0 ? printRows : 4,
    printTitleMode:
      rawPrintTitleMode === "left_merged" || rawPrintTitleMode === "hidden"
        ? rawPrintTitleMode
        : "top",
    printTitleSpan: typeof printTitleSpan === "number" && printTitleSpan > 0 ? printTitleSpan : 2,
    statementLayout: normalizeStatementLayout(o.statementLayout ?? o.statement_layout),
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
        const rawFieldsForForm = o.fields;
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

function normalizeProfileBindingField(raw: unknown, i: number): ProfileBindingFieldForm {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    field_key: typeof o.field_key === "string" ? o.field_key : `field_${i}`,
    required_in_project: o.required_in_project === true,
    visible_label: typeof o.visible_label === "string" ? o.visible_label : "",
    group: typeof o.group === "string" ? o.group : "",
  };
}

function normalizeProfileTableCell(raw: unknown, i: number): ProfileBindingTableCellForm {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rawSpan = o.col_span ?? o.colSpan;
  const rawLabelSpan = o.label_span ?? o.labelSpan;
  const rawValueSpan = o.value_span ?? o.valueSpan;
  const colSpan = typeof rawSpan === "number" && rawSpan > 0 ? rawSpan : 3;
  const labelSpan =
    typeof rawLabelSpan === "number" && rawLabelSpan > 0 ? rawLabelSpan : 1;
  return {
    field_key: typeof o.field_key === "string" ? o.field_key : `field_${i}`,
    label: typeof o.label === "string" ? o.label : "",
    label_span: labelSpan,
    value_span:
      typeof rawValueSpan === "number" && rawValueSpan > 0
        ? rawValueSpan
        : Math.max(1, colSpan - labelSpan),
    col_span: colSpan,
  };
}

function normalizeProfileTableRow(raw: unknown): ProfileBindingTableRowForm {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rawCells = Array.isArray(o.cells) ? o.cells : [];
  return {
    cells: rawCells.map(normalizeProfileTableCell),
  };
}

function normalizeProfileTableLayout(raw: unknown): ProfileBindingTableLayoutForm {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const columns = o.columns;
  const rawRows = Array.isArray(o.rows) ? o.rows : [];
  return {
    columns: typeof columns === "number" && columns > 0 ? columns : 12,
    rows: rawRows.map(normalizeProfileTableRow),
  };
}

function normalizeProfileBinding(raw: unknown): ProfileBindingForm {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rawFields = Array.isArray(o.fields) ? o.fields : [];
  return {
    enabled: o.enabled !== false,
    fields: rawFields.map(normalizeProfileBindingField),
    table_layout: normalizeProfileTableLayout(o.table_layout ?? o.tableLayout),
  };
}

export function configToFormValues(cfg: Record<string, unknown>): DeclarationFormValues {
  const modules = Array.isArray(cfg.modules) ? cfg.modules : [];
  return {
    profileBinding: normalizeProfileBinding(cfg.profileBinding),
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
    colSpan: c.colSpan != null && c.colSpan > 0 ? c.colSpan : 2,
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
    base.mapPrintMode = sec.mapPrintMode || "text_block";
    base.printColumns = sec.printColumns != null && sec.printColumns > 0 ? sec.printColumns : 12;
    base.printRows = sec.printRows != null && sec.printRows > 0 ? sec.printRows : 4;
    base.printTitleMode = sec.printTitleMode || "top";
    base.printTitleSpan = sec.printTitleSpan != null && sec.printTitleSpan > 0 ? sec.printTitleSpan : 2;
    base.statementLayout = {
      columns: (sec.statementLayout?.columns ?? []).map((column) => ({
        title: column.title.trim(),
        content: column.content.trim(),
        footer_label: column.footer_label.trim(),
        date_label: column.date_label.trim(),
        col_span: column.col_span != null && column.col_span > 0 ? column.col_span : 4,
      })),
    };
    base.fields = (sec.fields ?? [])
      .map((f, fi) => mapFieldToApi(f, mi, sj, fi))
      .filter((x) => (x.name as string).length);
    base.attachments = (sec.attachments ?? [])
      .map((a, ai) => attachmentToApi(a, mi, sj, ai))
      .filter((x) => (x.key as string).length);
  } else if (sec.kind === "list") {
    base.maxRows = sec.maxRows != null && sec.maxRows > 0 ? sec.maxRows : 10;
    base.printColumns = sec.printColumns != null && sec.printColumns > 0 ? sec.printColumns : 12;
    base.printTitleMode = sec.printTitleMode || "top";
    base.printTitleSpan = sec.printTitleSpan != null && sec.printTitleSpan > 0 ? sec.printTitleSpan : 2;
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
  const profileFields = (values?.profileBinding?.fields ?? [])
    .map((f, i) => ({
      field_key: f.field_key.trim() || `field_${i}`,
      required_in_project: f.required_in_project === true,
      visible_label: f.visible_label.trim(),
      group: f.group.trim(),
      order: i,
    }))
    .filter((f) => f.field_key.length > 0);
  const tableLayout = values?.profileBinding?.table_layout;
  const tableRows = (tableLayout?.rows ?? [])
    .map((row) => ({
      cells: (row.cells ?? [])
        .map((cell) => ({
          field_key: cell.field_key.trim(),
          label: cell.label.trim(),
          label_span:
            typeof cell.label_span === "number" && cell.label_span > 0
              ? cell.label_span
              : 1,
          value_span:
            typeof cell.value_span === "number" && cell.value_span > 0
              ? cell.value_span
              : Math.max(1, (cell.col_span || 3) - 1),
          col_span:
            (typeof cell.label_span === "number" && cell.label_span > 0
              ? cell.label_span
              : 1) +
            (typeof cell.value_span === "number" && cell.value_span > 0
              ? cell.value_span
              : Math.max(1, (cell.col_span || 3) - 1)),
        }))
        .filter((cell) => cell.field_key.length > 0),
    }))
    .filter((row) => row.cells.length > 0);
  const modules = (values?.modules ?? []).map((m, mi) => ({
    key: m.key.trim() || `module_${mi}`,
    title: m.title.trim(),
    order: mi,
    subModules: (m.subModules ?? []).map((s, sj) => subModuleToApi(s, mi, sj)),
  }));
  return {
    profileBinding: {
      enabled: values?.profileBinding?.enabled !== false,
      fields: profileFields,
      table_layout: {
        columns:
          typeof tableLayout?.columns === "number" && tableLayout.columns > 0
            ? tableLayout.columns
            : 12,
        rows: tableRows,
      },
    },
    modules,
  };
}

export const emptyDeclarationFormValues = (): DeclarationFormValues => ({
  profileBinding: { enabled: true, fields: [], table_layout: { columns: 12, rows: [] } },
  modules: [],
});
