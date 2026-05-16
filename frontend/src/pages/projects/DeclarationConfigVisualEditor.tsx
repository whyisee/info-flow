import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Spin,
  Switch,
  Tabs,
  Typography,
} from "antd";
import type { FormInstance } from "antd/es/form";
import {
  EditOutlined,
  LeftOutlined,
  MinusCircleOutlined,
  PlusOutlined,
  RightOutlined,
} from "@ant-design/icons";
import type { DeclarationFormValues, ListColumnForm } from "./declarationConfigTransforms";
import { newDefaultToolbar } from "./declarationConfigTransforms";
import "./DeclarationConfigVisualEditor.css";
import {
  listSurveyTemplates,
  type SurveyTemplate,
} from "../../services/surveyTemplates";
import {
  listEnabledProfileFieldCatalog,
  type ProfileFieldCatalogRow,
} from "../../services/profileFieldCatalog";
import { getPublicVersion } from "../../services/surveyResponses";
import { SurveyPreview } from "../../pages/survey/SurveyPreview";

const CELL_TYPES = [
  { value: "text", label: "文本" },
  { value: "number", label: "数字" },
  { value: "file", label: "附件" },
  { value: "date", label: "日期" },
  { value: "boolean", label: "是否" },
];

const PRINT_TITLE_MODE_OPTIONS = [
  { value: "top", label: "顶部标题" },
  { value: "left_merged", label: "左侧合并" },
  { value: "hidden", label: "隐藏标题" },
];

const MAP_PRINT_MODE_OPTIONS = [
  { value: "text_block", label: "大文本说明" },
  { value: "field_table", label: "字段表格" },
  { value: "statement_grid", label: "声明签章" },
];

const setEditorFieldValue = (
  form: FormInstance<DeclarationFormValues>,
  path: string | (string | number)[],
  value: unknown,
) => {
  (form as unknown as { setFieldValue: (name: unknown, value: unknown) => void }).setFieldValue(path, value);
};

const getEditorFieldValue = (
  form: FormInstance<DeclarationFormValues>,
  path: string | (string | number)[],
): unknown => (
  form as unknown as { getFieldValue: (name: unknown) => unknown }
).getFieldValue(path);

const newDefaultStatementLayout = () => ({
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
});

// FormDesignerPreview 已由 FormDesignerEditor 内置

const SECTION_KIND_OPTIONS = [
  { value: "map", label: "表单汇总 (map)" },
  { value: "list", label: "列表 (list)" },
  { value: "form_ref", label: "问卷模板引用 (form_ref)" },
] as const;

function FormRefTemplateSelectorInline({
  form,
  modName,
  subName,
  secName,
  templateOptions,
  templateOptionsMap,
}: {
  form: FormInstance<DeclarationFormValues>;
  modName: number;
  subName: number;
  secName: number;
  templateOptions: { value: number; label: string }[];
  templateOptionsMap: Record<number, SurveyTemplate>;
}) {
  const kind = Form.useWatch(
    ["modules", modName, "subModules", subName, "sections", secName, "kind"],
    { form, preserve: true },
  ) as string | undefined;

  const currentTemplateId = Form.useWatch(
    ["modules", modName, "subModules", subName, "sections", secName, "templateId"],
    { form, preserve: true },
  ) as number | undefined;

  const handleChange = (newTemplateId: number) => {
    const tpl = templateOptionsMap[newTemplateId];
    const ver = tpl?.published_version ?? 1;
    setEditorFieldValue(form, ["modules", modName, "subModules", subName, "sections", secName, "templateId"], newTemplateId);
    setEditorFieldValue(form, ["modules", modName, "subModules", subName, "sections", secName, "templateVersion"], ver);
  };

  if (kind !== "form_ref") return null;

  return (
    <Form.Item label="选择模板" name={[secName, "templateId"]}>
      <Select
        showSearch
        placeholder="请选择问卷模板"
        style={{ width: 200 }}
        options={templateOptions}
        optionFilterProp="label"
        value={currentTemplateId}
        onChange={handleChange}
      />
    </Form.Item>
  );
}

type Props = {
  form: FormInstance<DeclarationFormValues>;
};

type SectionLocator = {
  modIndex: number;
  subIndex: number;
  sectionIndex: number;
  sectionKey: string;
};

function sectionLocatorKey(locator: SectionLocator): string {
  return locator.sectionKey || `${locator.modIndex}_${locator.subIndex}_${locator.sectionIndex}`;
}

const PROFILE_MODULE_LABELS: Record<string, string> = {
  declaration_basic: "基本信息",
  declaration_task: "任务与关键词",
  declaration_contact: "联系方式",
  declaration_supervisor: "导师与回避",
};

function getRequiredDefault(row: ProfileFieldCatalogRow): boolean {
  const v = row.validation_json;
  return Boolean(v && typeof v === "object" && v.required_default === true);
}

function ModuleTabTitle({
  fieldName,
  form,
  editing,
  /** 由父组件根据 modules 快照传入；标签不在 Form.List 子树内，不能依赖对 title 的 useWatch */
  displayTitle,
  onStartEdit,
  onEndEdit,
}: {
  /** Form.List 子项 name，可能是 number 或 string */
  fieldName: number | string;
  form: FormInstance<DeclarationFormValues>;
  editing: boolean;
  displayTitle: string | undefined;
  onStartEdit: () => void;
  onEndEdit: () => void;
}) {
  /** 标签在 Tabs 内，不用 Form.Item 绑定 title（会与 Form.List 内字段冲突）；本地草稿提交时用 setFieldsValue 整段替换 modules */
  const [draft, setDraft] = useState("");
  const skipBlurCommitRef = useRef(false);

  useEffect(() => {
    if (!editing) return;
    skipBlurCommitRef.current = false;
    const modules = getEditorFieldValue(form, "modules") as
      | DeclarationFormValues["modules"]
      | undefined;
    const idx = Number(fieldName);
    const t = modules?.[idx]?.title;
    setDraft(typeof t === "string" ? t : "");
  }, [editing, fieldName, form]);

  const commitTitle = () => {
    const modules =
      (getEditorFieldValue(form, "modules") as DeclarationFormValues["modules"]) ?? [];
    const idx = Number(fieldName);
    if (!Number.isFinite(idx) || idx < 0 || idx >= modules.length) {
      onEndEdit();
      return;
    }
    const nextModules = modules.map((m, i) =>
      i === idx ? { ...m, title: draft } : m,
    );
    form.setFieldsValue({ modules: nextModules });
    onEndEdit();
  };

  if (editing) {
    return (
      <div
        className="declCfgVisualModuleTabEdit"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <Input
          placeholder="模块标题"
          className="declCfgVisualModuleTabInput"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            /** editable-card 的 Tabs 会响应 Delete/Backspace 删除标签，须阻止冒泡 */
            e.stopPropagation();
          }}
          onBlur={() => {
            if (skipBlurCommitRef.current) {
              skipBlurCommitRef.current = false;
              return;
            }
            commitTitle();
          }}
          onPressEnter={(e) => {
            e.preventDefault();
            skipBlurCommitRef.current = true;
            commitTitle();
          }}
          onMouseDown={(e) => e.stopPropagation()}
        />
      </div>
    );
  }

  return (
    <span className="declCfgVisualModuleTabRead">
      {/** 标题区不 stopPropagation，点击可正常交给 Tabs 切换；仅铅笔按钮阻止冒泡 */}
      <span className="declCfgVisualModuleTabReadText">
        {displayTitle?.trim() ? displayTitle : "未命名模块"}
      </span>
      <button
        type="button"
        className="declCfgVisualModuleTabEditBtn"
        aria-label="编辑标题"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onStartEdit();
        }}
      >
        <EditOutlined />
      </button>
    </span>
  );
}

function ProfileBindingEditor({
  form,
  catalog,
  loading,
}: {
  form: FormInstance<DeclarationFormValues>;
  catalog: ProfileFieldCatalogRow[];
  loading: boolean;
}) {
  const fields =
    (Form.useWatch(["profileBinding", "fields"], { form, preserve: true }) as
      | DeclarationFormValues["profileBinding"]["fields"]
      | undefined) ?? [];
  const tableLayout =
    (Form.useWatch(["profileBinding", "table_layout"], {
      form,
      preserve: true,
    }) as DeclarationFormValues["profileBinding"]["table_layout"] | undefined) ??
    { columns: 12, rows: [] };

  const catalogByKey = useMemo(
    () => new Map(catalog.map((row) => [row.field_key, row])),
    [catalog],
  );

  const fieldOptions = useMemo(() => {
    return [...catalog]
      .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
      .map((row) => ({
        value: row.field_key,
        label: `${PROFILE_MODULE_LABELS[row.module_code] ?? row.module_code} / ${row.default_label}`,
      }));
  }, [catalog]);

  const setFields = (next: DeclarationFormValues["profileBinding"]["fields"]) => {
    setEditorFieldValue(form, ["profileBinding", "fields"], next);
  };

  const setTableLayout = (
    next: DeclarationFormValues["profileBinding"]["table_layout"],
  ) => {
    setEditorFieldValue(form, ["profileBinding", "table_layout"], next);
  };

  const labelForKey = (key: string) => {
    const selected = fields.find((field) => field.field_key === key);
    if (selected?.visible_label.trim()) return selected.visible_label.trim();
    return catalogByKey.get(key)?.default_label ?? key;
  };

  const onSelectChange = (keys: string[]) => {
    const existing = new Map(fields.map((field) => [field.field_key, field]));
    setFields(
      keys.map((key) => {
        const old = existing.get(key);
        if (old) return old;
        const row = catalogByKey.get(key);
        return {
          field_key: key,
          required_in_project: row ? getRequiredDefault(row) : false,
          visible_label: "",
          group: "",
        };
      }),
    );
    const selected = new Set(keys);
    setTableLayout({
      ...tableLayout,
      rows: (tableLayout.rows ?? [])
        .map((row) => ({
          cells: (row.cells ?? []).filter((cell) => selected.has(cell.field_key)),
        }))
        .filter((row) => row.cells.length > 0),
    });
  };

  const generateDefaultLayout = () => {
    const rows: DeclarationFormValues["profileBinding"]["table_layout"]["rows"] = [];
    for (let i = 0; i < fields.length; i += 4) {
      rows.push({
        cells: fields.slice(i, i + 4).map((field) => ({
          field_key: field.field_key,
          label: field.visible_label.trim() || catalogByKey.get(field.field_key)?.default_label || field.field_key,
          label_span: 1,
          value_span: 2,
          col_span: 3,
        })),
      });
    }
    setTableLayout({ columns: tableLayout.columns || 12, rows });
  };

  const addLayoutRow = () => {
    setTableLayout({
      ...tableLayout,
      rows: [
        ...(tableLayout.rows ?? []),
        {
          cells: [
            {
              field_key: fields[0]?.field_key ?? "",
              label: fields[0] ? labelForKey(fields[0].field_key) : "",
              label_span: 1,
              value_span: 2,
              col_span: 3,
            },
          ],
        },
      ],
    });
  };

  return (
    <Card
      size="small"
      className="declCfgProfileBindingCard"
      title="基本信息字段选用"
      bordered={false}
    >
      <Space direction="vertical" size={10} style={{ width: "100%" }}>
        <div className="declCfgProfileCompactControls">
          <Form.Item
            name={["profileBinding", "enabled"]}
            valuePropName="checked"
            className="declCfgProfileBindingEnabled"
          >
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
          <Select
            mode="multiple"
            allowClear
            showSearch
            loading={loading}
            placeholder="选择本项目需要的基本信息字段"
            options={fieldOptions}
            value={fields.map((field) => field.field_key).filter(Boolean)}
            onChange={onSelectChange}
            optionFilterProp="label"
            className="declCfgProfileBindingPicker"
            maxTagCount="responsive"
          />
        </div>
        <div className="declCfgProfileLayout">
          <div className="declCfgProfileLayoutToolbar">
            <Typography.Text strong>打印布局</Typography.Text>
            <Space size={8} wrap>
              <span className="declCfgProfileLayoutColumnsLabel">总列数</span>
              <InputNumber
                min={4}
                max={24}
                value={tableLayout.columns ?? 12}
                onChange={(v) =>
                  setTableLayout({
                    ...tableLayout,
                    columns: typeof v === "number" && v > 0 ? v : 12,
                  })
                }
                className="declCfgProfileLayoutColumns"
              />
              <Button size="small" onClick={generateDefaultLayout} disabled={fields.length === 0}>
                按字段生成
              </Button>
              <Button size="small" onClick={addLayoutRow} disabled={fields.length === 0}>
                加行
              </Button>
            </Space>
          </div>
        </div>
      </Space>
    </Card>
  );
}

function ProfileBindingLayoutEditor({
  form,
  catalog,
}: {
  form: FormInstance<DeclarationFormValues>;
  catalog: ProfileFieldCatalogRow[];
}) {
  const enabled =
    (Form.useWatch(["profileBinding", "enabled"], { form, preserve: true }) as
      | boolean
      | undefined) !== false;
  const fields =
    (Form.useWatch(["profileBinding", "fields"], { form, preserve: true }) as
      | DeclarationFormValues["profileBinding"]["fields"]
      | undefined) ?? [];
  const tableLayout =
    (Form.useWatch(["profileBinding", "table_layout"], {
      form,
      preserve: true,
    }) as DeclarationFormValues["profileBinding"]["table_layout"] | undefined) ??
    { columns: 12, rows: [] };

  const catalogByKey = useMemo(
    () => new Map(catalog.map((row) => [row.field_key, row])),
    [catalog],
  );

  const setTableLayout = (
    next: DeclarationFormValues["profileBinding"]["table_layout"],
  ) => {
    setEditorFieldValue(form, ["profileBinding", "table_layout"], next);
  };

  const labelForKey = (key: string) => {
    const selected = fields.find((field) => field.field_key === key);
    if (selected?.visible_label.trim()) return selected.visible_label.trim();
    return catalogByKey.get(key)?.default_label ?? key;
  };

  const moveLayoutCell = (
    fromRow: number,
    fromCell: number,
    toRow: number,
    toCell: number,
  ) => {
    if (fromRow === toRow && fromCell === toCell) return;
    const rows = (tableLayout.rows ?? []).map((row) => ({
      cells: [...(row.cells ?? [])],
    }));
    const moved = rows[fromRow]?.cells[fromCell];
    if (!moved || !rows[toRow]) return;
    rows[fromRow].cells.splice(fromCell, 1);
    rows[toRow].cells.splice(toCell, 0, moved);
    setTableLayout({
      ...tableLayout,
      rows: rows.filter((row) => row.cells.length > 0),
    });
  };

  const changeLayoutCellSpan = (
    rowIndex: number,
    cellIndex: number,
    part: "label" | "value",
    delta: -1 | 1,
  ) => {
    const max = tableLayout.columns ?? 12;
    setTableLayout({
      ...tableLayout,
      rows: (tableLayout.rows ?? []).map((row, ri) =>
        ri === rowIndex
          ? {
              cells: (row.cells ?? []).map((cell, ci) => {
                if (ci !== cellIndex) return cell;
                const labelSpan = cell.label_span || 1;
                const valueSpan =
                  cell.value_span || Math.max(1, (cell.col_span || 3) - labelSpan);
                const nextLabelSpan =
                  part === "label"
                    ? Math.min(max, Math.max(1, labelSpan + delta))
                    : labelSpan;
                const nextValueSpan =
                  part === "value"
                    ? Math.min(max, Math.max(1, valueSpan + delta))
                    : valueSpan;
                return {
                  ...cell,
                  label_span: nextLabelSpan,
                  value_span: nextValueSpan,
                  col_span: nextLabelSpan + nextValueSpan,
                };
              }),
            }
          : row,
      ),
    });
  };

  const onDragStartCell = (
    e: DragEvent<HTMLDivElement>,
    rowIndex: number,
    cellIndex: number,
  ) => {
    e.dataTransfer.setData(
      "application/x-profile-layout-cell",
      JSON.stringify({ rowIndex, cellIndex }),
    );
    e.dataTransfer.effectAllowed = "move";
  };

  const onDropCell = (
    e: DragEvent<HTMLDivElement>,
    rowIndex: number,
    cellIndex: number,
  ) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData("application/x-profile-layout-cell");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { rowIndex?: unknown; cellIndex?: unknown };
      if (typeof parsed.rowIndex !== "number" || typeof parsed.cellIndex !== "number") return;
      moveLayoutCell(parsed.rowIndex, parsed.cellIndex, rowIndex, cellIndex);
    } catch {
      // ignore malformed drag payload
    }
  };

  if (!enabled) return null;

  if ((tableLayout.rows ?? []).length === 0) {
    return (
      <div className="declCfgProfileLayoutPreviewEmpty">
        尚未配置基本信息表格。请在右侧选择字段后点击“按字段生成”。
      </div>
    );
  }

  return (
    <div
      className="declCfgProfileLayoutPreview declCfgProfileLayoutPreviewInCanvas"
      style={{
        gridTemplateColumns: `repeat(${tableLayout.columns ?? 12}, minmax(0, 1fr))`,
      }}
    >
      {(tableLayout.rows ?? []).flatMap((row, rowIndex) =>
        (row.cells ?? []).flatMap((cell, cellIndex) => {
          const labelSpan = cell.label_span || 1;
          const valueSpan =
            cell.value_span || Math.max(1, (cell.col_span || 3) - labelSpan);
          return [
            <div
              key={`${rowIndex}_${cellIndex}_label`}
              className="declCfgProfileLayoutPreviewLabel"
              style={{ gridColumn: `span ${Math.max(1, labelSpan)}` }}
              draggable
              onDragStart={(e) => onDragStartCell(e, rowIndex, cellIndex)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDropCell(e, rowIndex, cellIndex)}
              title="拖拽调整字段位置"
            >
              {cell.label.trim() || labelForKey(cell.field_key)}
              <span className="declCfgProfileLayoutSpanTools">
                <button
                  type="button"
                  disabled={labelSpan <= 1}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    changeLayoutCellSpan(rowIndex, cellIndex, "label", -1);
                  }}
                  aria-label="减少标题占格"
                >
                  -
                </button>
                <span>名{labelSpan}</span>
                <button
                  type="button"
                  disabled={labelSpan >= (tableLayout.columns ?? 12)}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    changeLayoutCellSpan(rowIndex, cellIndex, "label", 1);
                  }}
                  aria-label="增加标题占格"
                >
                  +
                </button>
              </span>
            </div>,
            <div
              key={`${rowIndex}_${cellIndex}_value`}
              className="declCfgProfileLayoutPreviewValue"
              style={{ gridColumn: `span ${Math.max(1, valueSpan)}` }}
              draggable
              onDragStart={(e) => onDragStartCell(e, rowIndex, cellIndex)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDropCell(e, rowIndex, cellIndex)}
              title="拖拽调整字段位置"
            >
              <span className="declCfgProfileLayoutSpanTools">
                <button
                  type="button"
                  disabled={valueSpan <= 1}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    changeLayoutCellSpan(rowIndex, cellIndex, "value", -1);
                  }}
                  aria-label="减少内容占格"
                >
                  -
                </button>
                <span>值{valueSpan}</span>
                <button
                  type="button"
                  disabled={valueSpan >= (tableLayout.columns ?? 12)}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    changeLayoutCellSpan(rowIndex, cellIndex, "value", 1);
                  }}
                  aria-label="增加内容占格"
                >
                  +
                </button>
              </span>
            </div>,
          ];
        }),
      )}
    </div>
  );
}

function orderedWithIndex<T extends { order?: number; key?: string }>(items: T[] | undefined) {
  return (items ?? [])
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const ao = typeof a.item?.order === "number" ? a.item.order : a.index;
      const bo = typeof b.item?.order === "number" ? b.item.order : b.index;
      return ao - bo || a.index - b.index;
    });
}

function ConfigDesignPrintPreview({
  form,
  modules,
  catalog,
  activeSectionKey,
  onSelectSection,
}: {
  form: FormInstance<DeclarationFormValues>;
  modules: DeclarationFormValues["modules"] | undefined;
  catalog: ProfileFieldCatalogRow[];
  activeSectionKey: string;
  onSelectSection: (locator: SectionLocator) => void;
}) {
  return (
    <>
      <ProfileBindingLayoutEditor form={form} catalog={catalog} />
      {orderedWithIndex(modules).map(({ item: mod, index: modIndex }) =>
        orderedWithIndex(mod.subModules).map(({ item: sub, index: subIndex }) =>
          orderedWithIndex(sub.sections).map(({ item: section, index: sectionIndex }) => (
            <SectionDesignPrintPreview
              key={`${mod.key || modIndex}_${sub.key || subIndex}_${section.key || sectionIndex}`}
              form={form}
              modIndex={modIndex}
              subIndex={subIndex}
              sectionIndex={sectionIndex}
              sectionKey={
                typeof section.key === "string" && section.key
                  ? section.key
                  : `${modIndex}_${subIndex}_${sectionIndex}`
              }
              active={
                activeSectionKey ===
                (typeof section.key === "string" && section.key
                  ? section.key
                  : `${modIndex}_${subIndex}_${sectionIndex}`)
              }
              onSelect={onSelectSection}
            />
          )),
        ),
      )}
    </>
  );
}

function SectionDesignPrintPreview({
  form,
  modIndex,
  subIndex,
  sectionIndex,
  sectionKey,
  active,
  onSelect,
}: {
  form: FormInstance<DeclarationFormValues>;
  modIndex: number;
  subIndex: number;
  sectionIndex: number;
  sectionKey: string;
  active: boolean;
  onSelect: (locator: SectionLocator) => void;
}) {
  const locator = { modIndex, subIndex, sectionIndex, sectionKey };
  const sectionPath = [
    "modules",
    modIndex,
    "subModules",
    subIndex,
    "sections",
    sectionIndex,
  ] as const;
  const section = Form.useWatch(sectionPath, {
    form,
    preserve: true,
  }) as DeclarationFormValues["modules"][number]["subModules"][number]["sections"][number] | undefined;

  if (!section) return null;
  if (section.kind === "list") {
    return (
      <ListSectionDesignPrintPreview
        form={form}
        sectionPath={sectionPath}
        section={section}
        active={active}
        sectionKey={sectionKey}
        onSelect={() => onSelect(locator)}
      />
    );
  }
  if (section.kind === "map") {
    return (
      <MapSectionDesignPrintPreview
        section={section}
        active={active}
        sectionKey={sectionKey}
        onSelect={() => onSelect(locator)}
      />
    );
  }
  return (
    <div
      className={`declCfgDesignFormRefPlaceholder${active ? " declCfgDesignSectionActive" : ""}`}
      data-decl-preview-section={sectionKey}
      onClick={() => onSelect(locator)}
    >
      {section.title?.trim() || "问卷模板引用"}
    </div>
  );
}

function MapSectionDesignPrintPreview({
  section,
  active,
  sectionKey,
  onSelect,
}: {
  section: DeclarationFormValues["modules"][number]["subModules"][number]["sections"][number];
  active: boolean;
  sectionKey: string;
  onSelect: () => void;
}) {
  const printColumns =
    typeof section.printColumns === "number" && section.printColumns > 0
      ? section.printColumns
      : 12;
  const printRows =
    typeof section.printRows === "number" && section.printRows > 0 ? section.printRows : 4;
  const title = section.title?.trim() || "表单汇总";
  const titleMode =
    section.printTitleMode === "left_merged" || section.printTitleMode === "hidden"
      ? section.printTitleMode
      : "top";
  const titleSpan = Math.max(
    1,
    Math.min(
      Math.max(1, printColumns - 1),
      typeof section.printTitleSpan === "number" ? section.printTitleSpan : 2,
    ),
  );
  const contentSpan =
    titleMode === "left_merged" ? Math.max(1, printColumns - titleSpan) : printColumns;
  const mode =
    section.mapPrintMode === "field_table" || section.mapPrintMode === "statement_grid"
      ? section.mapPrintMode
      : "text_block";

  if (mode === "statement_grid") {
    const columns = section.statementLayout?.columns?.length
      ? section.statementLayout.columns
      : newDefaultStatementLayout().columns;
    return (
      <div
        className={`declCfgRenderPrintMapWrap declCfgDesignSectionShell${active ? " declCfgDesignSectionActive" : ""}`}
        data-decl-preview-section={sectionKey}
        onClick={onSelect}
      >
        <div
          className="declCfgRenderPrintMap"
          style={{ gridTemplateColumns: `repeat(${printColumns}, minmax(0, 1fr))` }}
        >
          {columns.map((column, index) => (
            <div
              key={`${column.title}_${index}`}
              className="declCfgRenderPrintStatementCell"
              style={{ gridColumn: `span ${Math.max(1, column.col_span || 4)}` }}
            >
              <strong>{column.title}</strong>
              <p>{column.content}</p>
              <div>{column.footer_label}</div>
              <div className="declCfgRenderPrintStatementDate">{column.date_label}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`declCfgRenderPrintMapWrap declCfgDesignSectionShell${active ? " declCfgDesignSectionActive" : ""}`}
      data-decl-preview-section={sectionKey}
      onClick={onSelect}
    >
      <div
        className="declCfgRenderPrintMap"
        style={{ gridTemplateColumns: `repeat(${printColumns}, minmax(0, 1fr))` }}
      >
        {titleMode === "top" ? (
          <div
            className="declCfgRenderPrintMapTitle"
            style={{ gridColumn: `span ${printColumns}` }}
          >
            {title}
          </div>
        ) : null}
        {titleMode === "left_merged" ? (
          <div
            className="declCfgRenderPrintMapLeftTitle"
            style={{ gridColumn: `span ${titleSpan}`, gridRow: `span ${printRows}` }}
          >
            {title}
          </div>
        ) : null}
        <div
          className="declCfgRenderPrintMapBody"
          style={{ gridColumn: `span ${contentSpan}`, gridRow: `span ${printRows}` }}
        >
          {section.sentenceTemplate?.trim() || " "}
        </div>
      </div>
    </div>
  );
}

function ListSectionDesignPrintPreview({
  form,
  sectionPath,
  section,
  active,
  sectionKey,
  onSelect,
}: {
  form: FormInstance<DeclarationFormValues>;
  sectionPath: readonly ["modules", number, "subModules", number, "sections", number];
  section: DeclarationFormValues["modules"][number]["subModules"][number]["sections"][number];
  active: boolean;
  sectionKey: string;
  onSelect: () => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const printColumns =
    typeof section.printColumns === "number" && section.printColumns > 0
      ? section.printColumns
      : 12;
  const rows =
    typeof section.maxRows === "number" && section.maxRows > 0
      ? Math.min(section.maxRows, 8)
      : 5;
  const title = section.title?.trim() || "列表";
  const titleMode =
    section.printTitleMode === "left_merged" || section.printTitleMode === "hidden"
      ? section.printTitleMode
      : "top";
  const titleSpan = Math.max(
    1,
    Math.min(
      Math.max(1, printColumns - 1),
      typeof section.printTitleSpan === "number" ? section.printTitleSpan : 2,
    ),
  );
  const contentColumns =
    titleMode === "left_merged" ? Math.max(1, printColumns - titleSpan) : printColumns;

  return (
    <Form.List name={[...sectionPath, "columns"]}>
      {(fields, { move }) => {
        const columns = Array.isArray(section.columns) ? section.columns : [];
        const spans = fields.map((field) => {
          const column = columns[field.name] as ListColumnForm | undefined;
          return Math.max(
            1,
            Math.min(
              contentColumns,
              typeof column?.colSpan === "number" ? column.colSpan : 2,
            ),
          );
        });
        const usedColumns = spans.reduce((sum, span) => sum + span, 0);
        const fillSpan = (contentColumns - (usedColumns % contentColumns)) % contentColumns;

        const changeSpan = (fieldName: number, next: number) => {
          setEditorFieldValue(form, 
            [...sectionPath, "columns", fieldName, "colSpan"],
            Math.max(1, Math.min(contentColumns, next)),
          );
        };

        return (
          <div
            className={`declCfgRenderPrintListWrap declCfgDesignSectionShell${active ? " declCfgDesignSectionActive" : ""}`}
            data-decl-preview-section={sectionKey}
            onClick={onSelect}
          >
            <div
              className="declCfgRenderPrintList declCfgDesignEditableList"
              style={{ gridTemplateColumns: `repeat(${printColumns}, minmax(0, 1fr))` }}
            >
              {titleMode === "top" ? (
                <div
                  className="declCfgRenderPrintListTitle"
                  style={{ gridColumn: `span ${printColumns}` }}
                >
                  {title}
                </div>
              ) : null}
              {titleMode === "left_merged" ? (
                <div
                  className="declCfgRenderPrintListLeftTitle"
                  style={{ gridColumn: `span ${titleSpan}`, gridRow: `span ${rows + 1}` }}
                >
                  {title}
                </div>
              ) : null}
              {fields.map((field, index) => {
                const column = columns[field.name] as ListColumnForm | undefined;
                const span = spans[index] ?? 2;
                const selected =
                  active && index === Math.min(selectedIndex, fields.length - 1);
                return (
                  <div
                    key={field.key}
                    className={`declCfgRenderPrintListHead declCfgDesignEditableHead${selected ? " declCfgDesignEditableHeadActive" : ""}`}
                    style={{ gridColumn: `span ${span}` }}
                    draggable
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect();
                      setSelectedIndex(index);
                    }}
                    onDragStart={(e) => {
                      onSelect();
                      setSelectedIndex(index);
                      e.dataTransfer.setData("text/plain", String(index));
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const from = Number(e.dataTransfer.getData("text/plain"));
                      if (Number.isFinite(from) && from !== index) {
                        onSelect();
                        move(from, index);
                        setSelectedIndex(index);
                      }
                    }}
                  >
                    <span>{column?.title?.trim() || `列${index + 1}`}</span>
                    <span className="declCfgListPrintSpanTools">
                      <button
                        type="button"
                        disabled={span <= 1}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect();
                          setSelectedIndex(index);
                          changeSpan(field.name, span - 1);
                        }}
                      >
                        -
                      </button>
                      <span>{span}</span>
                      <button
                        type="button"
                        disabled={span >= contentColumns}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect();
                          setSelectedIndex(index);
                          changeSpan(field.name, span + 1);
                        }}
                      >
                        +
                      </button>
                    </span>
                  </div>
                );
              })}
              {fields.length > 0 && fillSpan > 0 ? (
                <div
                  className="declCfgRenderPrintListFiller declCfgRenderPrintListHeadFiller"
                  style={{ gridColumn: `span ${fillSpan}` }}
                />
              ) : null}
              {fields.length === 0 ? (
                <div
                  className="declCfgRenderPrintListEmpty"
                  style={{ gridColumn: `span ${contentColumns}` }}
                >
                  请在右侧添加列
                </div>
              ) : null}
              {fields.length > 0
                ? Array.from({ length: rows }).flatMap((_, rowIndex) => {
                    const rowCells = fields.map((field, columnIndex) => (
                      <div
                        key={`${rowIndex}_${field.key}`}
                        className="declCfgRenderPrintListBody"
                        style={{ gridColumn: `span ${spans[columnIndex] ?? 2}` }}
                      />
                    ));
                    return fillSpan > 0
                      ? [
                          ...rowCells,
                          <div
                            key={`${rowIndex}_filler`}
                            className="declCfgRenderPrintListFiller"
                            style={{ gridColumn: `span ${fillSpan}` }}
                          />,
                        ]
                      : rowCells;
                  })
                : null}
            </div>
          </div>
        );
      }}
    </Form.List>
  );
}

export function DeclarationConfigVisualEditor({ form }: Props) {
  const modulesWatch = Form.useWatch("modules", { form, preserve: true }) as
    | DeclarationFormValues["modules"]
    | undefined;

  const [activeTabKey, setActiveTabKey] = useState<string>("");
  const [titleEditIndex, setTitleEditIndex] = useState<number | null>(null);
  const [activeSectionKey, setActiveSectionKey] = useState<string>("");
  const [profileCatalog, setProfileCatalog] = useState<ProfileFieldCatalogRow[]>([]);
  const [profileCatalogLoading, setProfileCatalogLoading] = useState(true);
  /** 点铅笔会先切到对应标签，onChange 里不应清掉刚进入的标题编辑态 */
  const skipClearTitleEditOnTabChangeRef = useRef(false);
  /** addMod 后表单可能晚一帧才有新模块 key，避免 useEffect 误把 activeKey 打回第一个标签 */
  const pendingNewTabKeyRef = useRef<string | null>(null);

  const moduleKeys = useMemo(() => {
    const list = modulesWatch ?? [];
    return list.map((m, i) =>
      typeof m?.key === "string" && m.key ? m.key : `__idx_${i}`,
    );
  }, [modulesWatch]);

  useEffect(() => {
    let cancelled = false;
    listEnabledProfileFieldCatalog()
      .then((rows) => {
        if (!cancelled) setProfileCatalog(rows);
      })
      .catch(() => {
        if (!cancelled) setProfileCatalog([]);
      })
      .finally(() => {
        if (!cancelled) setProfileCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (moduleKeys.length === 0) {
      if (activeTabKey !== "") setActiveTabKey("");
      pendingNewTabKeyRef.current = null;
      return;
    }

    const pending = pendingNewTabKeyRef.current;
    if (pending && moduleKeys.includes(pending)) {
      setActiveTabKey(pending);
      pendingNewTabKeyRef.current = null;
      return;
    }
    if (pending && !moduleKeys.includes(pending)) {
      return;
    }

    if (!activeTabKey || !moduleKeys.includes(activeTabKey)) {
      setActiveTabKey(moduleKeys[0] ?? "");
    }
  }, [moduleKeys, activeTabKey]);

  const scrollSectionIntoView = (sectionKey: string) => {
    window.setTimeout(() => {
      const previewTarget = document.querySelector(
        `[data-decl-preview-section="${sectionKey}"]`,
      ) as HTMLElement | null;
      previewTarget?.scrollIntoView({ block: "center", behavior: "smooth" });

      const configTarget = document.querySelector(
        `[data-decl-section-target="${sectionKey}"]`,
      ) as HTMLElement | null;
      configTarget?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 100);
  };

  const focusSectionConfig = (locator: SectionLocator) => {
    const key = sectionLocatorKey(locator);
    const mod = modulesWatch?.[locator.modIndex];
    const modKey =
      typeof mod?.key === "string" && mod.key.length > 0
        ? mod.key
        : `__idx_${locator.modIndex}`;
    setActiveSectionKey(key);
    setActiveTabKey(modKey);
    scrollSectionIntoView(key);
  };

  const keepSectionFocused = (sectionKey: string) => {
    setActiveSectionKey(sectionKey);
    scrollSectionIntoView(sectionKey);
  };

  return (
    <div className="declCfgVisual declCfgVisualWorkbench">
      <div className="declCfgVisualPreviewPane">
        <div className="declCfgVisualPaneHead">
          <div>
            <Typography.Text strong>打印预览</Typography.Text>
            <Typography.Text type="secondary">
              左侧按最终申报表样式实时展示，列表块列数差异在这里直接校准
            </Typography.Text>
          </div>
        </div>
        <div className="declCfgVisualPreviewScroller">
          <div className="declCfgVisualPrintCanvas">
            <ConfigDesignPrintPreview
              form={form}
              modules={modulesWatch}
              catalog={profileCatalog}
              activeSectionKey={activeSectionKey}
              onSelectSection={focusSectionConfig}
            />
          </div>
        </div>
      </div>
      <div className="declCfgVisualInspectorPane">
        <ProfileBindingEditor
          form={form}
          catalog={profileCatalog}
          loading={profileCatalogLoading}
        />
        <Form.List name="modules">
          {(modFields, { add: addMod, remove: removeMod }) => (
            <>
              {modFields.length === 0 ? (
                <Button
                  type="dashed"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    const k = `module_${Date.now()}`;
                    pendingNewTabKeyRef.current = k;
                    addMod({
                      key: k,
                      title: "",
                      order: 0,
                      subModules: [],
                    });
                    setActiveTabKey(k);
                  }}
                >
                  添加模块
                </Button>
              ) : (
                <Tabs
                  type="editable-card"
                  className="declCfgVisualModuleTabs"
                  size="small"
                  destroyOnHidden={false}
                  activeKey={activeTabKey}
                  onChange={(key) => {
                    setActiveTabKey(key);
                    if (skipClearTitleEditOnTabChangeRef.current) {
                      skipClearTitleEditOnTabChangeRef.current = false;
                      return;
                    }
                    setTitleEditIndex(null);
                  }}
                  onEdit={(e, action) => {
                    if (action === "add") {
                      const k = `module_${Date.now()}`;
                      pendingNewTabKeyRef.current = k;
                      addMod({
                        key: k,
                        title: "",
                        order: modFields.length,
                        subModules: [],
                      });
                      setActiveTabKey(k);
                      setTitleEditIndex(null);
                      return;
                    }
                    if (action === "remove" && typeof e === "string") {
                      const idx = (modulesWatch ?? []).findIndex(
                        (m) => typeof m?.key === "string" && m.key === e,
                      );
                      if (idx >= 0) {
                        removeMod(idx);
                        setTitleEditIndex(null);
                      }
                    }
                  }}
                  items={modFields.map((mf) => {
                    const mod = modulesWatch?.[mf.name];
                    const storageKey =
                      typeof mod?.key === "string" && mod.key.length > 0
                        ? mod.key
                        : `__idx_${mf.name}`;
                    return {
                      key: storageKey,
                      closable: true,
                      label: (
                        <ModuleTabTitle
                          fieldName={mf.name}
                          form={form}
                          displayTitle={modulesWatch?.[mf.name]?.title}
                          editing={titleEditIndex === mf.name}
                          onStartEdit={() => {
                            if (activeTabKey !== storageKey) {
                              skipClearTitleEditOnTabChangeRef.current = true;
                              setActiveTabKey(storageKey);
                            }
                            setTitleEditIndex(mf.name);
                          }}
                          onEndEdit={() => setTitleEditIndex(null)}
                        />
                      ),
                      children: (
                        <div className="declCfgVisualModulePanel">
                          <Form.Item name={[mf.name, "title"]} hidden>
                            <Input />
                          </Form.Item>
                          <Form.Item name={[mf.name, "key"]} hidden>
                            <Input />
                          </Form.Item>

                          <Form.List name={[mf.name, "subModules"]}>
                            {(subFields, { add: addSub, remove: removeSub }) => (
                              <>
                                {subFields.map((sf) => (
                                  <SubModulePanel
                                    key={sf.key}
                                    form={form}
                                    modName={mf.name}
                                    subName={sf.name}
                                    activeSectionKey={activeSectionKey}
                                    onKeepSectionFocused={keepSectionFocused}
                                    onRemove={() => removeSub(sf.name)}
                                  />
                                ))}
                                <Button
                                  type="dashed"
                                  block
                                  icon={<PlusOutlined />}
                                  onClick={() =>
                                    addSub({
                                      key: `sub_${Date.now()}`,
                                      title: "",
                                      order: subFields.length,
                                      helpText: "",
                                      sections: [
                                        {
                                          key: `sec_${Date.now()}`,
                                          title: "",
                                          kind: "map",
                                          order: 0,
                                          sentenceTemplate: "",
                                          mapPrintMode: "text_block",
                                          statementLayout: newDefaultStatementLayout(),
                                          fields: [],
                                          attachments: [],
                                          maxRows: 10,
                                          printColumns: 12,
                                          printRows: 4,
                                          printTitleMode: "top",
                                          printTitleSpan: 2,
                                          toolbar: newDefaultToolbar(),
                                          columns: [],
                                          formSchemaJson: "",
                                          formFieldsJson: "",
                                        },
                                      ],
                                    })
                                  }
                                >
                                  添加子模块
                                </Button>
                              </>
                            )}
                          </Form.List>
                        </div>
                      ),
                    };
                  })}
                />
              )}
            </>
          )}
        </Form.List>
      </div>
    </div>
  );
}

function SubModulePanel({
  form,
  modName,
  subName,
  activeSectionKey,
  onKeepSectionFocused,
  onRemove,
}: {
  form: FormInstance<DeclarationFormValues>;
  modName: number;
  subName: number;
  activeSectionKey: string;
  onKeepSectionFocused: (sectionKey: string) => void;
  onRemove: () => void;
}) {
  const [titleEditing, setTitleEditing] = useState(false);
  const [helpEditing, setHelpEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [helpDraft, setHelpDraft] = useState("");
  const [titleDisplay, setTitleDisplay] = useState("");
  const [helpDisplay, setHelpDisplay] = useState("");
  const [templateOptions, setTemplateOptions] = useState<{ value: number; label: string }[]>([]);
  const [templateOptionsMap, setTemplateOptionsMap] = useState<Record<number, SurveyTemplate>>({});

  const titleValue = Form.useWatch(
    ["modules", modName, "subModules", subName, "title"],
    form,
  ) as string | undefined;
  const helpValue = Form.useWatch(
    ["modules", modName, "subModules", subName, "helpText"],
    form,
  ) as string | undefined;

  const readSubField = (field: "title" | "helpText"): string => {
    const v = getEditorFieldValue(form, [
      "modules",
      modName,
      "subModules",
      subName,
      field,
    ]) as unknown;
    if (typeof v === "string") return v;
    return field === "title" ? titleDisplay : helpDisplay;
  };

  /**
   * 初始化展示值：避免 useWatch 在嵌套 Form.List 下短暂取空导致闪回“未命名”。
   * 后续展示以本地 display 为主；watch 仅在拿到有效 string 时用于同步覆盖。
   */
  useEffect(() => {
    const t = getEditorFieldValue(form, [
      "modules",
      modName,
      "subModules",
      subName,
      "title",
    ]) as unknown;
    const h = getEditorFieldValue(form, [
      "modules",
      modName,
      "subModules",
      subName,
      "helpText",
    ]) as unknown;
    setTitleDisplay(typeof t === "string" ? t : "");
    setHelpDisplay(typeof h === "string" ? h : "");
    setTitleEditing(false);
    setHelpEditing(false);
  }, [form, modName, subName]);

  useEffect(() => {
    if (titleEditing) return;
    if (typeof titleValue !== "string") return;
    setTitleDisplay(titleValue);
  }, [titleEditing, titleValue]);

  useEffect(() => {
    if (helpEditing) return;
    if (typeof helpValue !== "string") return;
    setHelpDisplay(helpValue);
  }, [helpEditing, helpValue]);

  const setSubField = (field: "title" | "helpText", value: string) => {
    const path: (string | number)[] = [
      "modules",
      modName,
      "subModules",
      subName,
      field,
    ];

    // 先更新本地展示，保证失焦后立刻可见
    if (field === "title") setTitleDisplay(value);
    else setHelpDisplay(value);

    // 优先用 setFields（对嵌套 Form.List 更稳定）
    try {
      form.setFields([{ name: path as any, value }]);
      return;
    } catch {
      // fallthrough
    }

    // 兼容：antd v5+ setFieldValue
    const anyForm = form as unknown as {
      setFieldValue?: (name: (string | number)[], val: unknown) => void;
    };
    if (typeof anyForm.setFieldValue === "function") {
      anyForm.setFieldValue(path, value);
      return;
    }

    // 最后兜底：整段 modules 更新
    const modules =
      (getEditorFieldValue(form, "modules") as DeclarationFormValues["modules"]) ?? [];
    const nextModules = modules.map((m, mi) => {
      if (mi !== modName) return m;
      const nextSubs = (m.subModules ?? []).map((sm, si) => {
        if (si !== subName) return sm;
        return { ...sm, [field]: value };
      });
      return { ...m, subModules: nextSubs };
    });
    form.setFieldsValue({ modules: nextModules });
  };

  const reindexSectionOrders = () => {
    const modules =
      (getEditorFieldValue(form, "modules") as DeclarationFormValues["modules"]) ?? [];
    const mod = modules?.[modName];
    const sub = mod?.subModules?.[subName];
    const secs = (sub?.sections ?? []).map((s, idx) => ({ ...s, order: idx }));
    const nextModules = modules.map((m, mi) => {
      if (mi !== modName) return m;
      const nextSubs = (m.subModules ?? []).map((sm, si) => {
        if (si !== subName) return sm;
        return { ...sm, sections: secs };
      });
      return { ...m, subModules: nextSubs };
});
    form.setFieldsValue({ modules: nextModules });
  };

  const moveSectionByKey = (sectionKey: string, delta: -1 | 1) => {
    const modules =
      (getEditorFieldValue(form, "modules") as DeclarationFormValues["modules"]) ?? [];
    const sections = modules?.[modName]?.subModules?.[subName]?.sections ?? [];
    const currentIndex = sections.findIndex((section) => section.key === sectionKey);
    const nextIndex = currentIndex + delta;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= sections.length) return;

    const reordered = [...sections];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(nextIndex, 0, moved);
    const nextModules = modules.map((module, moduleIndex) => {
      if (moduleIndex !== modName) return module;
      return {
        ...module,
        subModules: (module.subModules ?? []).map((subModule, subIndex) => {
          if (subIndex !== subName) return subModule;
          return {
            ...subModule,
            sections: reordered.map((section, index) => ({
              ...section,
              order: index,
            })),
          };
        }),
      };
    });
    form.setFieldsValue({ modules: nextModules });
    onKeepSectionFocused(sectionKey);
  };

  const cloneSectionForInsert = (
    section: DeclarationFormValues["modules"][number]["subModules"][number]["sections"][number],
    order: number,
  ): DeclarationFormValues["modules"][number]["subModules"][number]["sections"][number] => {
    const stamp = Date.now();
    return {
      ...section,
      key: `sec_${stamp}`,
      title: section.title ? `${section.title} 副本` : "",
      order,
      fields: (section.fields ?? []).map((field, index) => ({
        ...field,
        name: `${field.name || "field"}_copy_${stamp}_${index}`,
      })),
      attachments: (section.attachments ?? []).map((attachment, index) => ({
        ...attachment,
        key: `${attachment.key || "file"}_copy_${stamp}_${index}`,
      })),
      columns: (section.columns ?? []).map((column, index) => ({
        ...column,
        name: `${column.name || "col"}_copy_${stamp}_${index}`,
      })),
    };
  };

  const duplicateSection = (index: number) => {
    const modules =
      (getEditorFieldValue(form, "modules") as DeclarationFormValues["modules"]) ?? [];
    const source = modules?.[modName]?.subModules?.[subName]?.sections?.[index];
    if (!source) return;
    const cloned = cloneSectionForInsert(source, index + 1);
    const nextModules = modules.map((m, mi) => {
      if (mi !== modName) return m;
      return {
        ...m,
        subModules: (m.subModules ?? []).map((sm, si) => {
          if (si !== subName) return sm;
          const sections = [...(sm.sections ?? [])];
          sections.splice(index + 1, 0, cloned);
          return {
            ...sm,
            sections: sections.map((section, sectionIndex) => ({
              ...section,
              order: sectionIndex,
            })),
          };
        }),
      };
    });
    form.setFieldsValue({ modules: nextModules });
  };

  useEffect(() => {
    listSurveyTemplates().then((t) => {
      setTemplateOptions(t.map((x) => ({ value: x.id, label: x.name })));
      const map: Record<number, SurveyTemplate> = {};
      t.forEach((x) => { map[x.id] = x; });
      setTemplateOptionsMap(map);
    });
  }, []);

  return (
    <Card
      size="small"
      className="declCfgVisualSubCard declCfgVisualSubCardPreview"
      bordered={false}
      title={
        <div className="declCfgVisualSubHeaderTitle">
          {!titleEditing ? (
            <Space size={6} wrap>
              <span className="declCfgVisualSubHeaderTitleMain">
                {titleDisplay?.trim() ? titleDisplay : "未命名子模块"}
              </span>
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  setTitleEditing(true);
                  setHelpEditing(false);
                  setTitleDraft(readSubField("title"));
                }}
                aria-label="编辑子模块标题"
              />
            </Space>
          ) : (
            <Input
              size="small"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onPressEnter={() => {
                setSubField("title", titleDraft);
                setTitleEditing(false);
              }}
              onBlur={() => {
                setSubField("title", titleDraft);
                setTitleEditing(false);
              }}
              style={{ width: 260 }}
              placeholder="子模块标题"
              maxLength={200}
              onKeyDown={(e) => e.stopPropagation()}
            />
          )}

          {!helpEditing ? (
            <Space size={6} wrap>
              <span
                className="declCfgVisualSubHeaderHelp"
                title={helpDisplay}
                onClick={(e) => {
                  e.stopPropagation();
                  setHelpEditing(true);
                  setTitleEditing(false);
                  setHelpDraft(readSubField("helpText"));
                }}
              >
                {helpDisplay?.trim() ? helpDisplay : "（无说明）"}
              </span>
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  setHelpEditing(true);
                  setTitleEditing(false);
                  setHelpDraft(readSubField("helpText"));
                }}
                aria-label="编辑子模块说明"
              />
            </Space>
          ) : (
            <Input.TextArea
              size="small"
              value={helpDraft}
              onChange={(e) => setHelpDraft(e.target.value)}
              rows={1}
              autoSize={{ minRows: 1, maxRows: 2 }}
              onPressEnter={(e) => {
                e.preventDefault();
                setSubField("helpText", helpDraft);
                setHelpEditing(false);
              }}
              onBlur={() => {
                setSubField("helpText", helpDraft);
                setHelpEditing(false);
              }}
              className="declCfgVisualHelpInline"
              placeholder="说明（选填）"
              onKeyDown={(e) => e.stopPropagation()}
            />
          )}
        </div>
      }
      extra={
        <Space size={6} wrap>
          <Button
            type="text"
            danger
            size="small"
            icon={<MinusCircleOutlined />}
            onClick={onRemove}
            aria-label="删除子模块"
          />
        </Space>
      }
    >
      <Form.Item name={[subName, "key"]} hidden>
        <Input />
      </Form.Item>
      {/* <Typography.Text type="secondary" className="declCfgVisualSubTitle">
        内容块（可重复）
      </Typography.Text> */}
      <Form.List name={[subName, "sections"]}>
        {(secFields, { add: addSec, remove: removeSec }) => (
          <>
            {secFields.map((sf, idx) => (
              (() => {
                const sectionKey =
                  (getEditorFieldValue(form, [
                    "modules",
                    modName,
                    "subModules",
                    subName,
                    "sections",
                    sf.name,
                    "key",
                  ]) as string | undefined) || `${modName}_${subName}_${sf.name}`;
                return (
              <Card
                key={sf.key}
                size="small"
                className={`declCfgVisualSubCard declCfgVisualSectionCard${
                  activeSectionKey === sectionKey
                    ? " declCfgVisualSectionCardActive"
                    : ""
                }`}
                data-decl-section-target={sectionKey}
              >
                <div className="declCfgVisualSubHead">
                  <Form.Item name={[sf.name, "key"]} hidden>
                    <Input />
                  </Form.Item>
                  <Form.Item name={[sf.name, "order"]} hidden>
                    <InputNumber />
                  </Form.Item>
                  <Space wrap align="start">
                    <Form.Item label="块标题（选填）" name={[sf.name, "title"]}>
                      <Input
                        placeholder="如：基本情况、获奖明细"
                        className="declCfgVisualSectionTitleInput"
                      />
                    </Form.Item>
                    <Form.Item
                      label="块类型"
                      name={[sf.name, "kind"]}
                      rules={[{ required: true, message: "请选择块类型" }]}
                    >
                      <Select style={{ width: 160 }} options={[...SECTION_KIND_OPTIONS]} />
                    </Form.Item>
                    <FormRefTemplateSelectorInline
                      form={form}
                      modName={modName}
                      subName={subName}
                      secName={sf.name}
                      templateOptions={templateOptions}
                      templateOptionsMap={templateOptionsMap}
                    />
                  </Space>
                  <div className="declCfgVisualSectionActions">
                    <Button
                      size="small"
                      onClick={() => duplicateSection(sf.name)}
                    >
                      复制
                    </Button>
                    <Button
                      size="small"
                      disabled={idx <= 0}
                      onClick={() => {
                        const sectionKey = getEditorFieldValue(form, [
                          "modules",
                          modName,
                          "subModules",
                          subName,
                          "sections",
                          sf.name,
                          "key",
                        ]) as string | undefined;
                        if (sectionKey) moveSectionByKey(sectionKey, -1);
                      }}
                    >
                      上移
                    </Button>
                    <Button
                      size="small"
                      disabled={idx >= secFields.length - 1}
                      onClick={() => {
                        const sectionKey = getEditorFieldValue(form, [
                          "modules",
                          modName,
                          "subModules",
                          subName,
                          "sections",
                          sf.name,
                          "key",
                        ]) as string | undefined;
                        if (sectionKey) moveSectionByKey(sectionKey, 1);
                      }}
                    >
                      下移
                    </Button>
                    <Button
                      type="link"
                      danger
                      size="small"
                      onClick={() => {
                        removeSec(sf.name);
                        setTimeout(reindexSectionOrders, 0);
                      }}
                      icon={<MinusCircleOutlined />}
                    >
                      删除块
                    </Button>
                  </div>
                </div>

                <SectionBody
                  form={form}
                  modName={modName}
                  subName={subName}
                  secName={sf.name}
                />
              </Card>
                );
              })()
            ))}

            <Space wrap>
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={() => (
                  addSec({
                    key: `sec_${Date.now()}`,
                    title: "",
                    kind: "map",
                    order: secFields.length,
                    sentenceTemplate: "",
                    mapPrintMode: "text_block",
                    statementLayout: newDefaultStatementLayout(),
                    fields: [],
                    attachments: [],
                    maxRows: 10,
                    printColumns: 12,
                    printRows: 4,
                    printTitleMode: "top",
                    printTitleSpan: 2,
                    toolbar: newDefaultToolbar(),
                    columns: [],
                    formSchemaJson: "",
                    formFieldsJson: "",
                  }),
                  setTimeout(reindexSectionOrders, 0)
                )}
              >
                添加表单块
              </Button>
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={() => (
                  addSec({
                    key: `sec_${Date.now()}`,
                    title: "",
                    kind: "list",
                    order: secFields.length,
                    sentenceTemplate: "",
                    mapPrintMode: "text_block",
                    statementLayout: newDefaultStatementLayout(),
                    fields: [],
                    attachments: [],
                    maxRows: 10,
                    printColumns: 12,
                    printRows: 4,
                    printTitleMode: "top",
                    printTitleSpan: 2,
                    toolbar: newDefaultToolbar(),
                    columns: [],
                    formSchemaJson: "",
                    formFieldsJson: "",
                  }),
                  setTimeout(reindexSectionOrders, 0)
                )}
              >
                添加列表块
              </Button>
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={() => (
                  addSec({
                    key: `sec_${Date.now()}`,
                    title: "",
                    kind: "form_ref",
                    order: secFields.length,
                    sentenceTemplate: "",
                    mapPrintMode: "text_block",
                    statementLayout: newDefaultStatementLayout(),
                    fields: [],
                    attachments: [],
                    maxRows: 10,
                    printColumns: 12,
                    printRows: 4,
                    printTitleMode: "top",
                    printTitleSpan: 2,
                    toolbar: newDefaultToolbar(),
                    columns: [],
                    templateId: null,
                    templateVersion: null,
                    formSchemaJson: "",
                    formFieldsJson: "",
                  }),
                  setTimeout(reindexSectionOrders, 0)
                )}
              >
                添加问卷模板块
              </Button>
            </Space>
          </>
        )}
      </Form.List>
    </Card>
  );
}

function SectionBody({
  form,
  modName,
  subName,
  secName,
}: {
  form: FormInstance<DeclarationFormValues>;
  modName: number;
  subName: number;
  secName: number;
}) {
  const kind = Form.useWatch(
    ["modules", modName, "subModules", subName, "sections", secName, "kind"],
    form,
  );
  const templateIdWatch = Form.useWatch(
    ["modules", modName, "subModules", subName, "sections", secName, "templateId"],
    form,
  ) as number | null | undefined;
  const templateVersionWatch = Form.useWatch(
    ["modules", modName, "subModules", subName, "sections", secName, "templateVersion"],
    form,
  ) as number | null | undefined;
  const sectionPath = ["modules", modName, "subModules", subName, "sections", secName] as const;
  const sectionWatch = Form.useWatch(sectionPath, {
    form,
    preserve: true,
  }) as DeclarationFormValues["modules"][number]["subModules"][number]["sections"][number] | undefined;

  const [surveySchema, setSurveySchema] = useState<Record<string, unknown> | null>(null);
  const [surveyFields, setSurveyFields] = useState<Record<string, unknown> | null>(null);
  const [surveyLoading, setSurveyLoading] = useState(false);
  const [surveyError, setSurveyError] = useState<string | null>(null);
  const [selectedListColumnIndex, setSelectedListColumnIndex] = useState(0);
  const [selectedStatementIndex, setSelectedStatementIndex] = useState(0);

  useEffect(() => {
    if (templateIdWatch == null) {
      setSurveySchema(null);
      setSurveyFields(null);
      return;
    }
    setSurveyLoading(true);
    setSurveyError(null);
    const ver = templateVersionWatch && templateVersionWatch > 0 ? templateVersionWatch : 1;
    getPublicVersion(templateIdWatch, ver)
      .then((v) => {
        setSurveySchema(v.schema as Record<string, unknown>);
        setSurveyFields(v.fields as Record<string, unknown>);
      })
      .catch(() => setSurveyError("问卷加载失败"))
      .finally(() => setSurveyLoading(false));
  }, [templateIdWatch, templateVersionWatch]);

  const isList = kind === "list";
  const isMap = kind === "map";

  if (kind === "form_ref") {
    if (templateIdWatch == null) {
      return (
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          请先在「块类型」后选择问卷模板
        </Typography.Text>
      );
    }
    if (surveyLoading) {
      return (
        <div style={{ textAlign: "center", padding: 16 }}>
          <Spin size="small" tip="加载问卷中…" />
        </div>
      );
    }
    if (surveyError || !surveySchema) {
      return (
        <Typography.Text type="danger" style={{ fontSize: 13 }}>
          {surveyError ?? "问卷不存在"}
        </Typography.Text>
      );
    }
    return (
      <SurveyPreview
        schemaJson={JSON.stringify(surveySchema)}
        fieldsJson={JSON.stringify(surveyFields)}
        readOnly
        showIndex={false}
        templateId={templateIdWatch}
        version={templateVersionWatch ?? 1}
      />
    );
  }

  if (isMap) {
    const mapPrintColumns =
      typeof sectionWatch?.printColumns === "number" && sectionWatch.printColumns > 0
        ? sectionWatch.printColumns
        : 12;
    const mapPrintRows =
      typeof sectionWatch?.printRows === "number" && sectionWatch.printRows > 0
        ? sectionWatch.printRows
        : 4;
    const mapPrintTitleMode =
      sectionWatch?.printTitleMode === "left_merged" || sectionWatch?.printTitleMode === "hidden"
        ? sectionWatch.printTitleMode
        : "top";
    const mapPrintTitleSpan = Math.max(
      1,
      Math.min(
        Math.max(1, mapPrintColumns - 1),
        typeof sectionWatch?.printTitleSpan === "number" ? sectionWatch.printTitleSpan : 2,
      ),
    );
    const mapPrintMode =
      sectionWatch?.mapPrintMode === "field_table" || sectionWatch?.mapPrintMode === "statement_grid"
        ? sectionWatch.mapPrintMode
        : "text_block";
    const mapTitle = sectionWatch?.title?.trim() || "表单汇总";
    const mapTemplate = sectionWatch?.sentenceTemplate?.trim();
    const statementLayout = sectionWatch?.statementLayout ?? newDefaultStatementLayout();
    const statementColumns = statementLayout.columns?.length
      ? statementLayout.columns
      : newDefaultStatementLayout().columns;
    const safeStatementIndex = Math.min(selectedStatementIndex, statementColumns.length - 1);
    const mapGridStyle = {
      gridTemplateColumns: `repeat(${mapPrintColumns}, minmax(32px, 1fr))`,
    };
    const mapContentSpan =
      mapPrintTitleMode === "left_merged"
        ? Math.max(1, mapPrintColumns - mapPrintTitleSpan)
        : mapPrintColumns;

    return (
      <div className="declCfgMapDesigner">
        <div className="declCfgMapDesignerInner">
          <div className="declCfgMapCanvas">
            <div className="declCfgListCanvasHeader">
              <div>
                <Typography.Text strong>打印表格布局</Typography.Text>
                <Typography.Text type="secondary">
                  适合说明文字、汇总字段和附件要求，右侧调整打印属性
                </Typography.Text>
              </div>
            </div>
            <div className="declCfgMapPrintPreview" style={mapGridStyle}>
              {mapPrintMode === "statement_grid" ? (
                <>
                  {statementColumns.map((column, index) => (
                    <div
                      key={`${column.title}_${index}`}
                      className={`declCfgMapStatementCell${index === safeStatementIndex ? " declCfgMapStatementCellActive" : ""}`}
                      style={{ gridColumn: `span ${Math.max(1, column.col_span || 4)}` }}
                      onClick={() => setSelectedStatementIndex(index)}
                    >
                      <strong>{column.title}</strong>
                      <p>{column.content}</p>
                      <div>{column.footer_label}</div>
                      <div className="declCfgMapStatementDate">{column.date_label}</div>
                    </div>
                  ))}
                </>
              ) : mapPrintTitleMode === "top" ? (
                <div
                  className="declCfgMapPrintTitleCell"
                  style={{ gridColumn: `span ${mapPrintColumns}` }}
                >
                  {mapTitle}
                </div>
              ) : null}
              {mapPrintMode !== "statement_grid" && mapPrintTitleMode === "left_merged" ? (
                <div
                  className="declCfgMapPrintLeftTitleCell"
                  style={{
                    gridColumn: `span ${mapPrintTitleSpan}`,
                    gridRow: `span ${mapPrintRows}`,
                  }}
                >
                  {mapTitle}
                </div>
              ) : null}
              {mapPrintMode !== "statement_grid" ? (
                <div
                  className="declCfgMapPrintBodyCell"
                  style={{
                    gridColumn: `span ${mapContentSpan}`,
                    gridRow: `span ${mapPrintRows}`,
                  }}
                >
                  {mapPrintMode === "text_block" ? (
                    <span>{mapTemplate || "在右侧填写说明文字或示例内容"}</span>
                  ) : (
                    <span>字段表格布局将在下一步细化</span>
                  )}
                </div>
              ) : null}
            </div>
          </div>
          <aside className="declCfgListInspector">
            <Typography.Text strong>属性</Typography.Text>
            <div className="declCfgListInspectorGroup">
              <Typography.Text type="secondary">表单汇总块</Typography.Text>
              <label>
                <span>布局</span>
                <Select
                  size="small"
                  options={MAP_PRINT_MODE_OPTIONS}
                  value={mapPrintMode}
                  onChange={(value) => {
                    setEditorFieldValue(form, [...sectionPath, "mapPrintMode"], value);
                    if (value === "statement_grid" && !sectionWatch?.statementLayout) {
                      setEditorFieldValue(form, [...sectionPath, "statementLayout"], newDefaultStatementLayout());
                    }
                  }}
                />
              </label>
              {mapPrintMode !== "statement_grid" ? (
                <label>
                  <span>标题</span>
                  <Select
                    size="small"
                    options={PRINT_TITLE_MODE_OPTIONS}
                    value={mapPrintTitleMode}
                    onChange={(value) => setEditorFieldValue(form, [...sectionPath, "printTitleMode"], value)}
                  />
                </label>
              ) : null}
              {mapPrintMode !== "statement_grid" && mapPrintTitleMode === "left_merged" ? (
                <label>
                  <span>题占格</span>
                  <InputNumber
                    min={1}
                    max={Math.max(1, mapPrintColumns - 1)}
                    size="small"
                    value={mapPrintTitleSpan}
                    onChange={(value) => setEditorFieldValue(form, [...sectionPath, "printTitleSpan"], value ?? 2)}
                  />
                </label>
              ) : null}
              <label>
                <span>总列数</span>
                <InputNumber
                  min={4}
                  max={48}
                  size="small"
                  value={mapPrintColumns}
                  onChange={(value) => setEditorFieldValue(form, [...sectionPath, "printColumns"], value ?? 12)}
                />
              </label>
              {mapPrintMode !== "statement_grid" ? (
                <label>
                  <span>行数</span>
                  <InputNumber
                    min={1}
                    max={20}
                    size="small"
                    value={mapPrintRows}
                    onChange={(value) => setEditorFieldValue(form, [...sectionPath, "printRows"], value ?? 4)}
                  />
                </label>
              ) : null}
              {mapPrintMode === "statement_grid" ? (
                <>
                  <div className="declCfgListColumnSwitch">
                    <Typography.Text type="secondary">签章栏</Typography.Text>
                    <Select
                      size="small"
                      variant="borderless"
                      value={safeStatementIndex}
                      options={statementColumns.map((column, index) => ({
                        value: index,
                        label: column.title || `栏${index + 1}`,
                      }))}
                      onChange={setSelectedStatementIndex}
                      className="declCfgListColumnSwitchSelect"
                    />
                  </div>
                  <label className="declCfgListColumnNameField">
                    <span>标题</span>
                    <Form.Item
                      name={[secName, "statementLayout", "columns", safeStatementIndex, "title"]}
                      noStyle
                    >
                      <Input size="small" />
                    </Form.Item>
                  </label>
                  <label>
                    <span>占格</span>
                    <Form.Item
                      name={[secName, "statementLayout", "columns", safeStatementIndex, "col_span"]}
                      noStyle
                    >
                      <InputNumber min={1} max={mapPrintColumns} size="small" />
                    </Form.Item>
                  </label>
                  <label>
                    <span>页脚</span>
                    <Form.Item
                      name={[secName, "statementLayout", "columns", safeStatementIndex, "footer_label"]}
                      noStyle
                    >
                      <Input size="small" />
                    </Form.Item>
                  </label>
                  <label className="declCfgMapWideField">
                    <span>日期</span>
                    <Form.Item
                      name={[secName, "statementLayout", "columns", safeStatementIndex, "date_label"]}
                      noStyle
                    >
                      <Input size="small" />
                    </Form.Item>
                  </label>
                  <div className="declCfgMapTextEditor">
                    <Typography.Text type="secondary">栏正文</Typography.Text>
                    <Form.Item
                      name={[secName, "statementLayout", "columns", safeStatementIndex, "content"]}
                      noStyle
                    >
                      <Input.TextArea rows={4} />
                    </Form.Item>
                  </div>
                </>
              ) : (
                <div className="declCfgMapTextEditor">
                  <Typography.Text type="secondary">说明文字</Typography.Text>
                  <Form.Item name={[secName, "sentenceTemplate"]} noStyle>
                    <Input.TextArea rows={6} placeholder="填写打印时展示的大段说明、示例或汇总内容" />
                  </Form.Item>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    );
  }

  if (!isList) return null;

  const listColumns = Array.isArray(sectionWatch?.columns) ? sectionWatch.columns : [];
  const printColumns =
    typeof sectionWatch?.printColumns === "number" && sectionWatch.printColumns > 0
      ? sectionWatch.printColumns
      : 12;
  const printRows =
    typeof sectionWatch?.maxRows === "number" && sectionWatch.maxRows > 0
      ? Math.min(sectionWatch.maxRows, 12)
      : 10;
  const sectionTitle = sectionWatch?.title?.trim() || "列表";
  const listGridStyle = { gridTemplateColumns: `repeat(${printColumns}, minmax(32px, 1fr))` };
  const printTitleMode =
    sectionWatch?.printTitleMode === "left_merged" || sectionWatch?.printTitleMode === "hidden"
      ? sectionWatch.printTitleMode
      : "top";
  const printTitleSpan = Math.max(
    1,
    Math.min(
      Math.max(1, printColumns - 1),
      typeof sectionWatch?.printTitleSpan === "number" ? sectionWatch.printTitleSpan : 2,
    ),
  );
  const contentPrintColumns =
    printTitleMode === "left_merged" ? Math.max(1, printColumns - printTitleSpan) : printColumns;
  const defaultNewColumnSpan = 2;
  const setListColumnSpan = (columnIndex: number, next: number) => {
    setEditorFieldValue(form, 
      [...sectionPath, "columns", columnIndex, "colSpan"],
      Math.max(1, Math.min(contentPrintColumns, next)),
    );
  };

  return (
    <div className="declCfgListDesigner">
      <Form.List name={[secName, "columns"]}>
        {(fields, { add, remove, move }) => (
          <div className="declCfgListDesignerInner">
            <div className="declCfgListCanvas">
              <div className="declCfgListCanvasHeader">
                <div>
                  <Typography.Text strong>打印表格布局</Typography.Text>
                  <Typography.Text type="secondary">
                    拖动表头调整顺序，点击表头后在右侧编辑列属性
                  </Typography.Text>
                </div>
                <Button
                  type="dashed"
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    add({
                      name: `col_${Date.now()}`,
                      title: "",
                      cellType: "text",
                      width: null,
                      colSpan: defaultNewColumnSpan,
                    });
                    setEditorFieldValue(form, 
                      [...sectionPath, "printColumns"],
                      printColumns + defaultNewColumnSpan,
                    );
                    setSelectedListColumnIndex(fields.length);
                  }}
                >
                  添加列
                </Button>
              </div>
              <div className="declCfgListPrintPreviewWrap">
                <div className="declCfgListPrintPreview" style={listGridStyle}>
                  {printTitleMode === "top" ? (
                    <div
                      className="declCfgListPrintTitleCell"
                      style={{ gridColumn: `span ${printColumns}` }}
                    >
                      {sectionTitle}
                    </div>
                  ) : null}
                  {printTitleMode === "left_merged" ? (
                    <div
                      className="declCfgListPrintLeftTitleCell"
                      style={{
                        gridColumn: `span ${printTitleSpan}`,
                        gridRow: `span ${printRows + 1}`,
                      }}
                    >
                      {sectionTitle}
                    </div>
                  ) : null}
                  {fields.length > 0 ? (
                    fields.map((f, index) => {
                      const column = listColumns[f.name] as ListColumnForm | undefined;
                      const span = Math.max(
                        1,
                        Math.min(
                          contentPrintColumns,
                          typeof column?.colSpan === "number" ? column.colSpan : 2,
                        ),
                      );
                      const selected = index === Math.min(selectedListColumnIndex, fields.length - 1);
                      return (
                        <div
                          key={f.key}
                          className={`declCfgListPrintHeadCell${selected ? " declCfgListPrintHeadCellActive" : ""}`}
                          style={{ gridColumn: `span ${span}` }}
                          draggable
                          onClick={() => setSelectedListColumnIndex(index)}
                          onDragStart={(e: DragEvent<HTMLDivElement>) => {
                            e.dataTransfer.setData("text/plain", String(index));
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            const from = Number(e.dataTransfer.getData("text/plain"));
                            if (Number.isFinite(from) && from !== index) {
                              move(from, index);
                              setSelectedListColumnIndex(index);
                            }
                          }}
                        >
                          <span>{column?.title?.trim() || `列${index + 1}`}</span>
                          <span className="declCfgListPrintSpanTools">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setListColumnSpan(f.name, span - 1);
                              }}
                              disabled={span <= 1}
                            >
                              -
                            </button>
                            <span>{span}</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setListColumnSpan(f.name, span + 1);
                              }}
                              disabled={span >= contentPrintColumns}
                            >
                              +
                            </button>
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <div
                      className="declCfgListPrintEmpty"
                      style={{ gridColumn: `span ${printColumns}` }}
                    >
                      添加列后生成打印表格
                    </div>
                  )}
                  {fields.length > 0 ? (() => {
                    const usedColumns = fields.reduce((sum, f) => {
                      const column = listColumns[f.name] as ListColumnForm | undefined;
                      return (
                        sum +
                        Math.max(
                          1,
                          Math.min(
                            contentPrintColumns,
                            typeof column?.colSpan === "number" ? column.colSpan : 2,
                          ),
                        )
                      );
                    }, 0);
                    const fillSpan =
                      (contentPrintColumns - (usedColumns % contentPrintColumns)) %
                      contentPrintColumns;
                    return fillSpan > 0 ? (
                      <div
                        className="declCfgListPrintRowFiller declCfgListPrintHeadFiller"
                        style={{ gridColumn: `span ${fillSpan}` }}
                      />
                    ) : null;
                  })() : null}
                  {fields.length > 0
                    ? Array.from({ length: printRows }).flatMap((_, rowIndex) => {
                        let usedColumns = 0;
                        const rowCells = fields.map((f) => {
                          const column = listColumns[f.name] as ListColumnForm | undefined;
                          const span = Math.max(
                            1,
                            Math.min(
                              contentPrintColumns,
                              typeof column?.colSpan === "number" ? column.colSpan : 2,
                            ),
                          );
                          usedColumns += span;
                          return (
                            <div
                              key={`${rowIndex}-${f.key}`}
                              className="declCfgListPrintBodyCell"
                              style={{ gridColumn: `span ${span}` }}
                            />
                          );
                        });
                        const fillSpan =
                          (contentPrintColumns - (usedColumns % contentPrintColumns)) %
                          contentPrintColumns;
                        return fillSpan > 0
                          ? [
                              ...rowCells,
                              <div
                                key={`${rowIndex}-row-filler`}
                                className="declCfgListPrintRowFiller"
                                style={{ gridColumn: `span ${fillSpan}` }}
                              />,
                            ]
                          : rowCells;
                      })
                    : null}
                </div>
              </div>
              <div className="declCfgListColumnStrip">
                <span className="declCfgListColumnStripLabel">字段顺序</span>
                {fields.map((f, index) => {
                  const column = listColumns[f.name] as ListColumnForm | undefined;
                  const selected = index === Math.min(selectedListColumnIndex, fields.length - 1);
                  return (
                    <button
                      key={f.key}
                      type="button"
                      className={`declCfgListColumnChip${selected ? " declCfgListColumnChipActive" : ""}`}
                      onClick={() => setSelectedListColumnIndex(index)}
                    >
                      {column?.title?.trim() || `列${index + 1}`}
                    </button>
                  );
                })}
              </div>
            </div>
            <aside className="declCfgListInspector">
              <Typography.Text strong>属性</Typography.Text>
              <div className="declCfgListInspectorGroup">
                <Typography.Text type="secondary">列表块</Typography.Text>
                <Button
                  type="dashed"
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    add({
                      name: `col_${Date.now()}`,
                      title: "",
                      cellType: "text",
                      width: null,
                      colSpan: defaultNewColumnSpan,
                    });
                    setEditorFieldValue(form, 
                      [...sectionPath, "printColumns"],
                      printColumns + defaultNewColumnSpan,
                    );
                    setSelectedListColumnIndex(fields.length);
                  }}
                >
                  添加列
                </Button>
                <label>
                  <span>标题</span>
                  <Select
                    size="small"
                    options={PRINT_TITLE_MODE_OPTIONS}
                    value={printTitleMode}
                    onChange={(value) => setEditorFieldValue(form, [...sectionPath, "printTitleMode"], value)}
                  />
                </label>
                {printTitleMode === "left_merged" ? (
                  <label>
                    <span>题占格</span>
                    <InputNumber
                      min={1}
                      max={Math.max(1, printColumns - 1)}
                      size="small"
                      value={printTitleSpan}
                      onChange={(value) =>
                        setEditorFieldValue(form, [...sectionPath, "printTitleSpan"], value ?? 2)
                      }
                    />
                  </label>
                ) : null}
                <label>
                  <span>行数</span>
                  <InputNumber
                    min={1}
                    max={500}
                    size="small"
                    value={sectionWatch?.maxRows ?? 10}
                    onChange={(value) => setEditorFieldValue(form, [...sectionPath, "maxRows"], value ?? 10)}
                  />
                </label>
                <label>
                  <span>总列数</span>
                  <InputNumber
                    min={4}
                    max={48}
                    size="small"
                    value={printColumns}
                    onChange={(value) => setEditorFieldValue(form, [...sectionPath, "printColumns"], value ?? 12)}
                  />
                </label>
              </div>
              {fields.length > 0 ? (() => {
                const safeIndex = Math.min(selectedListColumnIndex, fields.length - 1);
                const field = fields[safeIndex];
                const column = listColumns[field.name] as ListColumnForm | undefined;
                const columnOptions = fields.map((f, index) => {
                  const item = listColumns[f.name] as ListColumnForm | undefined;
                  return {
                    value: index,
                    label: item?.title?.trim() || `列${index + 1}`,
                  };
                });
                return (
                  <div className="declCfgListInspectorGroup">
                    <div className="declCfgListColumnSwitch">
                      <Typography.Text type="secondary">当前列</Typography.Text>
                      <Select
                        size="small"
                        variant="borderless"
                        options={columnOptions}
                        value={safeIndex}
                        onChange={(value) => setSelectedListColumnIndex(value)}
                        className="declCfgListColumnSwitchSelect"
                      />
                      <Space size={2}>
                        <Button
                          size="small"
                          type="text"
                          icon={<LeftOutlined />}
                          disabled={safeIndex <= 0}
                          onClick={() => setSelectedListColumnIndex(safeIndex - 1)}
                          aria-label="上一列"
                        />
                        <Button
                          size="small"
                          type="text"
                          icon={<RightOutlined />}
                          disabled={safeIndex >= fields.length - 1}
                          onClick={() => setSelectedListColumnIndex(safeIndex + 1)}
                          aria-label="下一列"
                        />
                      </Space>
                    </div>
                    <label className="declCfgListColumnNameField">
                      <span>列名</span>
                      <Form.Item name={[field.name, "title"]} noStyle>
                        <Input size="small" placeholder="表头文字" />
                      </Form.Item>
                      <Button
                        danger
                        size="small"
                        type="text"
                        icon={<MinusCircleOutlined />}
                        onClick={() => {
                          const removedSpan =
                            typeof column?.colSpan === "number" && column.colSpan > 0
                              ? column.colSpan
                              : defaultNewColumnSpan;
                          remove(field.name);
                          setEditorFieldValue(form, 
                            [...sectionPath, "printColumns"],
                            Math.max(4, printColumns - removedSpan),
                          );
                          setSelectedListColumnIndex(Math.max(0, safeIndex - 1));
                        }}
                        aria-label="删除当前列"
                      />
                    </label>
                    <label>
                      <span>类型</span>
                      <Form.Item name={[field.name, "cellType"]} noStyle>
                        <Select size="small" options={CELL_TYPES} />
                      </Form.Item>
                    </label>
                    <label>
                      <span>列宽</span>
                      <Form.Item name={[field.name, "width"]} noStyle>
                        <InputNumber min={0} size="small" placeholder="可选" />
                      </Form.Item>
                    </label>
                    <label>
                      <span>占格</span>
                      <Form.Item name={[field.name, "colSpan"]} noStyle>
                        <InputNumber min={1} max={contentPrintColumns} size="small" />
                      </Form.Item>
                    </label>
                  </div>
                );
              })() : (
                <div className="declCfgListInspectorEmpty">
                  还没有列，先添加一个字段。
                </div>
              )}
            </aside>
            <div className="declCfgListHiddenFields">
              {fields.map((f) => (
                <Form.Item key={f.key} name={[f.name, "name"]} hidden>
                  <Input />
                </Form.Item>
              ))}
            </div>
          </div>
        )}
      </Form.List>
    </div>
  );
}
