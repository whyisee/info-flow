import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Descriptions,
  Input,
  InputNumber,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
  Upload,
  message,
} from "antd";
import { MinusOutlined, PlusOutlined, UploadOutlined } from "@ant-design/icons";
import { normalizeDeclarationConfig } from "./normalize";
import type { DeclarationDraftShape } from "./declarationDraftShape";
import {
  DEFAULT_SECTION_KEY,
  type DeclarationAttachmentRef,
  emptyDeclarationDraft,
  getListRows,
  getMapAttachmentFiles,
  getMapFields,
  getFormValues,
  normalizeDeclarationDraft,
  setListRows as setDraftListRows,
  setMapAttachmentFiles,
  setMapField,
  setFormRefValues,
  setFormValue,
} from "./declarationDraftShape";
import "./DeclarationConfigRenderer.css";
import {
  attachmentDownloadUrl,
  deleteAttachment,
  uploadAttachment,
} from "../../services/attachments";
import type { Expr, FieldDef, FormNode } from "../form-designer/types";
import { getPublicVersion } from "../../services/surveyResponses";
import { SurveyPreview } from "../../pages/survey/SurveyPreview";

export type DeclarationConfigRendererProps = {
  /** 与后端存储一致的 config（含 modules） */
  config: Record<string, unknown>;
  /**
   * preview：仅结构示意，控件禁用；
   * fill：可填报；若传入 draft + onDraftChange 则由外部持久化（如 Form / 保存接口）。
   */
  variant?: "preview" | "fill";
  /** 顶部提示文案 */
  hint?: ReactNode;
  /** 多模块时：stack 纵向卡片；tabs 与配置编辑器一致按标签切换 */
  moduleLayout?: "stack" | "tabs";
  /** 已保存或表单中的申报草稿；与 onDraftChange 同时使用时由外部控制 */
  draft?: DeclarationDraftShape | Record<string, unknown>;
  /** 草稿更新回调 */
  onDraftChange?: (next: DeclarationDraftShape) => void;
  /** 申报材料 id（用于附件上传）。无 id 时禁用上传。 */
  materialId?: number;
  /**
   * 在 tabs 布局下插在最前的标签（如申报页「基本信息」）；stack 布局下显示在模块卡片之前。
   */
  leadingTab?: { key: string; label: ReactNode; children: ReactNode };
  displayMode?: "standard" | "print";
};

type RawModule = Record<string, unknown>;
type RawSubModule = Record<string, unknown>;

const TEXT_BLOCK_FIELD_KEY = "__text_block";
type RawSection = Record<string, unknown>;

type ProfilePreviewCell = {
  fieldKey: string;
  label: string;
  labelSpan: number;
  valueSpan: number;
};

type ProfilePreviewLayout = {
  columns: number;
  rows: { cells: ProfilePreviewCell[] }[];
};

function sortByOrder<T extends { order?: unknown }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => {
    const ao = typeof a.order === "number" ? a.order : 0;
    const bo = typeof b.order === "number" ? b.order : 0;
    return ao - bo;
  });
}

function pickSubTitleAndHelp(sub: RawSubModule): { title: string; helpText: string } {
  return {
    title: typeof sub.title === "string" ? sub.title : "",
    helpText: typeof sub.helpText === "string" ? sub.helpText : "",
  };
}

function normalizeSubSections(sub: RawSubModule): RawSection[] {
  // v3：sections 数组（可重复 map/list）
  const sectionsRaw = sub.sections;
  if (Array.isArray(sectionsRaw)) {
    const list = sectionsRaw.filter((x) => x && typeof x === "object" && !Array.isArray(x)) as RawSection[];
    return sortByOrder(list);
  }

  // v2：sub.map / sub.list（最多各一个），保持 map -> list 的顺序
  const sections: RawSection[] = [];
  if (sub.map && typeof sub.map === "object" && !Array.isArray(sub.map)) {
    sections.push({
      key: "map_0",
      kind: "map",
      order: 0,
      ...(sub.map as Record<string, unknown>),
    });
  }
  if (sub.list && typeof sub.list === "object" && !Array.isArray(sub.list)) {
    sections.push({
      key: "list_0",
      kind: "list",
      order: sections.length,
      ...(sub.list as Record<string, unknown>),
    });
  }
  if (sections.length > 0) return sections;

  // v1：type + 平铺字段
  const kind = sub.type === "list" ? "list" : "map";
  return [
    {
      key: DEFAULT_SECTION_KEY,
      kind,
      order: 0,
      ...sub,
    },
  ];
}

function parseSelectOptions(raw: Record<string, unknown>): { label: string; value: string }[] {
  const opt = raw.options;
  if (!Array.isArray(opt) || opt.length === 0) {
    return [
      { label: "选项一", value: "opt1" },
      { label: "选项二", value: "opt2" },
    ];
  }
  return opt.map((x, i) => {
    if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      const v = o.value ?? o.label ?? String(i);
      const l = o.label ?? String(v);
      return { label: String(l), value: String(v) };
    }
    return { label: String(x), value: String(x) };
  });
}

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

function parseProfilePreviewLayout(raw: unknown): ProfilePreviewLayout | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const binding = raw as Record<string, unknown>;
  if (binding.enabled === false) return null;
  const table = binding.table_layout ?? binding.tableLayout;
  if (!table || typeof table !== "object" || Array.isArray(table)) return null;
  const tableObj = table as Record<string, unknown>;
  const rowsRaw = Array.isArray(tableObj.rows) ? tableObj.rows : [];
  const rows = rowsRaw.flatMap((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return [];
    const cellsRaw = (row as Record<string, unknown>).cells;
    if (!Array.isArray(cellsRaw)) return [];
    const cells = cellsRaw.flatMap((cell) => {
      if (!cell || typeof cell !== "object" || Array.isArray(cell)) return [];
      const o = cell as Record<string, unknown>;
      const fieldKey = typeof o.field_key === "string" ? o.field_key : "";
      if (!fieldKey) return [];
      const rawColSpan = o.col_span ?? o.colSpan;
      const rawLabelSpan = o.label_span ?? o.labelSpan;
      const rawValueSpan = o.value_span ?? o.valueSpan;
      const colSpan = typeof rawColSpan === "number" && rawColSpan > 0 ? rawColSpan : 2;
      const labelSpan = typeof rawLabelSpan === "number" && rawLabelSpan > 0 ? rawLabelSpan : 1;
      const valueSpan =
        typeof rawValueSpan === "number" && rawValueSpan > 0
          ? rawValueSpan
          : Math.max(1, colSpan - labelSpan);
      return [
        {
          fieldKey,
          label: typeof o.label === "string" ? o.label : "",
          labelSpan,
          valueSpan,
        },
      ];
    });
    return cells.length > 0 ? [{ cells }] : [];
  });
  if (rows.length === 0) return null;
  const columns = tableObj.columns;
  return {
    columns: typeof columns === "number" && columns > 0 ? columns : 12,
    rows,
  };
}

function profilePreviewLabels(raw: unknown): Map<string, string> {
  const result = new Map<string, string>();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return result;
  const fields = (raw as Record<string, unknown>).fields;
  if (!Array.isArray(fields)) return result;
  fields.forEach((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return;
    const o = item as Record<string, unknown>;
    const fieldKey = typeof o.field_key === "string" ? o.field_key : "";
    if (!fieldKey) return;
    const label = typeof o.visible_label === "string" ? o.visible_label.trim() : "";
    if (label) result.set(fieldKey, label);
  });
  return result;
}

function ProfileBindingPrintPreview({ binding }: { binding: unknown }) {
  const layout = parseProfilePreviewLayout(binding);
  if (!layout) return null;
  const labels = profilePreviewLabels(binding);
  return (
    <div
      className="declCfgRenderProfilePrint"
      style={{ gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))` }}
    >
      {layout.rows.flatMap((row, rowIndex) =>
        row.cells.flatMap((cell, cellIndex) => [
          <div
            key={`${rowIndex}_${cellIndex}_label`}
            className="declCfgRenderProfilePrintLabel"
            style={{ gridColumn: `span ${Math.max(1, cell.labelSpan)}` }}
          >
            {cell.label.trim() || labels.get(cell.fieldKey) || cell.fieldKey}
          </div>,
          <div
            key={`${rowIndex}_${cellIndex}_value`}
            className="declCfgRenderProfilePrintValue"
            style={{ gridColumn: `span ${Math.max(1, cell.valueSpan)}` }}
          />,
        ]),
      )}
    </div>
  );
}

function FormFieldControl({
  def,
  interactive,
  value,
  onChange,
  materialId,
}: {
  def: FieldDef;
  interactive: boolean;
  value: unknown;
  onChange: (v: unknown) => void;
  materialId?: number;
}) {
  const required =
    def.rules?.required === true ||
    (def.rules?.requiredWhen ? evalExpr(def.rules.requiredWhen, {}) : false);

  if (def.type === "textarea") {
    return (
      <Input.TextArea
        rows={2}
        disabled={!interactive}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={interactive ? "请输入" : "（填报时填写）"}
      />
    );
  }
  if (def.type === "number") {
    return (
      <InputNumber
        style={{ width: "100%" }}
        disabled={!interactive}
        value={typeof value === "number" ? value : undefined}
        onChange={(v) => onChange(v ?? null)}
        placeholder={interactive ? "请输入数字" : "（数字）"}
      />
    );
  }
  if (def.type === "select") {
    const opts = def.options ?? [];
    return (
      <Select
        style={{ width: "100%" }}
        disabled={!interactive}
        allowClear={interactive}
        placeholder={interactive ? "请选择" : "（下拉选择）"}
        value={typeof value === "string" ? value : undefined}
        onChange={(v) => onChange(v)}
        options={opts}
      />
    );
  }
  if (def.type === "date") {
    return (
      <Input
        type="date"
        disabled={!interactive}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  if (def.type === "switch") {
    return (
      <Select
        style={{ width: "100%" }}
        disabled={!interactive}
        allowClear={interactive}
        placeholder="是/否"
        value={value as string | undefined}
        onChange={onChange}
        options={[
          { label: "是", value: "yes" },
          { label: "否", value: "no" },
        ]}
      />
    );
  }
  if (def.type === "attachment") {
    const list = Array.isArray(value) ? (value as DeclarationAttachmentRef[]) : [];
    const cfg = def.attachment ?? {};
    return (
      <Space direction="vertical" size={4} style={{ width: "100%" }}>
        {cfg.templateUrl ? (
          <a href={cfg.templateUrl} target="_blank" rel="noreferrer">
            模板下载
          </a>
        ) : null}
        <Upload
          maxCount={cfg.maxCount ?? 1}
          fileList={list.map((x) => ({
            uid: String(x.id),
            name: x.file_name,
            status: "done" as const,
            url: attachmentDownloadUrl(x.id),
          }))}
          showUploadList={{ showDownloadIcon: true, showRemoveIcon: interactive }}
          beforeUpload={(file) => {
            if (!materialId) {
              message.warning("请先保存为草稿后再上传附件");
              return Upload.LIST_IGNORE;
            }
            const accept = cfg.accept ?? "";
            const maxSize = cfg.maxSize ?? null;
            const ext = (file.name.split(".").pop() || "").toLowerCase();
            if (
              accept &&
              !accept
                .split(",")
                .map((x) => x.trim().replace(/^\./, ""))
                .includes(ext)
            ) {
              message.error(`文件类型不符合要求：${accept}`);
              return Upload.LIST_IGNORE;
            }
            if (maxSize != null && maxSize > 0 && file.size > maxSize) {
              message.error(`文件过大，最大允许 ${Math.round(maxSize / 1024)} KB`);
              return Upload.LIST_IGNORE;
            }
            return true;
          }}
          customRequest={async (options) => {
            try {
              const f = options.file as File;
              if (!materialId) throw new Error("no materialId");
              const created = await uploadAttachment(materialId, f);
              const next: DeclarationAttachmentRef[] = [
                ...list,
                {
                  id: created.id,
                  file_name: created.file_name,
                  file_size: created.file_size,
                  file_type: created.file_type,
                  created_at: created.created_at,
                },
              ];
              onChange(next);
              options.onSuccess?.(created, f);
            } catch (e) {
              options.onError?.(e as Error);
              message.error("上传失败");
            }
          }}
          onRemove={async (file) => {
            try {
              const id = Number(file.uid);
              if (!Number.isFinite(id) || id <= 0) return false;
              await deleteAttachment(id);
              onChange(list.filter((x) => x.id !== id));
              return true;
            } catch {
              message.error("删除失败");
              return false;
            }
          }}
          disabled={!interactive}
        >
          {interactive ? (
            <Button size="small" icon={<UploadOutlined />}>
              选择文件
            </Button>
          ) : null}
        </Upload>
        {interactive && required && list.length === 0 ? (
          <Typography.Text type="danger" style={{ fontSize: 12 }}>
            请上传必填附件
          </Typography.Text>
        ) : null}
      </Space>
    );
  }

  return (
    <Input
      disabled={!interactive}
      value={value != null && typeof value !== "object" ? String(value) : ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={interactive ? "请输入" : "（填报时填写）"}
    />
  );
}

function FormNodeRenderer({
  node,
  fields,
  values,
  interactive,
  onValueChange,
  materialId,
}: {
  node: FormNode;
  fields: Record<string, FieldDef>;
  values: Record<string, unknown>;
  interactive: boolean;
  onValueChange: (name: string, v: unknown) => void;
  materialId?: number;
}) {
  if (node.kind === "Text") {
    return <Typography.Text type="secondary">{node.text}</Typography.Text>;
  }
  if (node.kind === "Divider") {
    return <div className="declCfgRenderFormDivider" />;
  }
  if (node.kind === "Group") {
    return (
      <Card size="small" className="declCfgRenderFormGroup" title={node.title || undefined}>
        <Space direction="vertical" size={8} style={{ width: "100%" }}>
          {node.children.map((c) => (
            <FormNodeRenderer
              key={c.id}
              node={c}
              fields={fields}
              values={values}
              interactive={interactive}
              onValueChange={onValueChange}
              materialId={materialId}
            />
          ))}
        </Space>
      </Card>
    );
  }
  if (node.kind === "Row") {
    return (
      <div className="declCfgRenderFormRow">
        {node.children.map((c) => (
          <div key={c.id} className="declCfgRenderFormRowCol">
            <FormNodeRenderer
              node={c}
              fields={fields}
              values={values}
              interactive={interactive}
              onValueChange={onValueChange}
              materialId={materialId}
            />
          </div>
        ))}
      </div>
    );
  }
  if (node.kind === "Col") {
    return (
      <div style={{ width: "100%" }}>
        <Space direction="vertical" size={8} style={{ width: "100%" }}>
          {node.children.map((c) => (
            <FormNodeRenderer
              key={c.id}
              node={c}
              fields={fields}
              values={values}
              interactive={interactive}
              onValueChange={onValueChange}
              materialId={materialId}
            />
          ))}
        </Space>
      </div>
    );
  }
  if (node.kind === "Repeater") {
    const arr = Array.isArray(values[node.name]) ? (values[node.name] as Record<string, unknown>[]) : [];
    const canAdd = interactive && (node.max == null || arr.length < node.max);
    return (
      <div className="declCfgRenderFormRepeater">
        <Typography.Text strong style={{ fontSize: 12 }}>
          {node.name}
        </Typography.Text>
        <Space direction="vertical" size={8} style={{ width: "100%", marginTop: 6 }}>
          {(interactive ? (arr.length ? arr : [{}]) : arr).map((item, idx) => (
            <Card key={idx} size="small" className="declCfgRenderFormRepeaterItem" title={`第 ${idx + 1} 条`}>
              <FormNodeRenderer
                node={node.itemSchema}
                fields={fields}
                values={item ?? {}}
                interactive={interactive}
                onValueChange={(childName, v) => {
                  const base = arr.length ? [...arr] : [{}];
                  base[idx] = { ...(base[idx] ?? {}), [childName]: v };
                  onValueChange(node.name, base);
                }}
                materialId={materialId}
              />
            </Card>
          ))}
          {canAdd ? (
            <Button size="small" type="dashed" onClick={() => onValueChange(node.name, [...arr, {}])}>
              添加一条
            </Button>
          ) : null}
        </Space>
      </div>
    );
  }
  if (node.kind === "Field") {
    const def = fields[node.name];
    if (!def) {
      return (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          （未定义字段：{node.name}）
        </Typography.Text>
      );
    }
    const visible = evalExpr(def.rules?.showWhen, values);
    if (!visible) return null;
    const v = values[def.name];
    return (
      <div className="declCfgRenderFieldRow">
        <Typography.Text style={{ fontSize: 12 }}>{def.label}</Typography.Text>
        <FormFieldControl
          def={def}
          interactive={interactive}
          value={v}
          onChange={(nv) => onValueChange(def.name, nv)}
          materialId={materialId}
        />
      </div>
    );
  }
  return null;
}

function SubModuleFormContent({
  sec,
  interactive,
  moduleKey,
  subKey,
  sectionKey,
  materialId,
  draft,
  onDraftChange,
}: {
  sec: RawSection;
  interactive: boolean;
  moduleKey: string;
  subKey: string;
  sectionKey: string;
  materialId?: number;
  draft: DeclarationDraftShape;
  onDraftChange: (next: DeclarationDraftShape) => void;
}) {
  const { schema, fields } = safeFormSchema(sec);
  const values = interactive ? getFormValues(draft, moduleKey, subKey, sectionKey) : {};
  if (!schema) {
    return <Typography.Text type="secondary">（未配置表单 schema）</Typography.Text>;
  }
  return (
    <FormNodeRenderer
      node={schema}
      fields={fields}
      values={values}
      interactive={interactive}
      onValueChange={(name, v) => onDraftChange(setFormValue(draft, moduleKey, subKey, sectionKey, name, v))}
      materialId={materialId}
    />
  );
}
function MapField({
  label,
  widget,
  interactive,
  raw,
  fieldValue,
  onFieldChange,
}: {
  label: string;
  widget: string;
  interactive: boolean;
  raw: Record<string, unknown>;
  fieldValue?: unknown;
  onFieldChange?: (v: unknown) => void;
}) {
  const selectOptions = useMemo(() => parseSelectOptions(raw), [raw]);

  if (!interactive) {
    if (widget === "textarea") {
      return (
        <div className="declCfgRenderFieldRow">
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {label}
          </Typography.Text>
          <Input.TextArea rows={2} disabled placeholder="（填报时填写）" />
        </div>
      );
    }
    if (widget === "number") {
      return (
        <div className="declCfgRenderFieldRow">
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {label}
          </Typography.Text>
          <InputNumber style={{ width: "100%" }} disabled placeholder="（数字）" />
        </div>
      );
    }
    if (widget === "select") {
      return (
        <div className="declCfgRenderFieldRow">
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {label}
          </Typography.Text>
          <Select disabled placeholder="（下拉选择）" style={{ width: "100%" }} options={selectOptions} />
        </div>
      );
    }
    return (
      <div className="declCfgRenderFieldRow">
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {label}
        </Typography.Text>
        <Input disabled placeholder="（填报时填写）" />
      </div>
    );
  }

  if (widget === "textarea") {
    return (
      <div className="declCfgRenderFieldRow">
        <Typography.Text style={{ fontSize: 12 }}>{label}</Typography.Text>
        <Input.TextArea
          rows={2}
          value={fieldValue != null && typeof fieldValue !== "object" ? String(fieldValue) : ""}
          onChange={(e) => onFieldChange?.(e.target.value)}
          placeholder="请输入"
        />
      </div>
    );
  }
  if (widget === "number") {
    const n = typeof fieldValue === "number" ? fieldValue : undefined;
    return (
      <div className="declCfgRenderFieldRow">
        <Typography.Text style={{ fontSize: 12 }}>{label}</Typography.Text>
        <InputNumber
          style={{ width: "100%" }}
          value={n}
          onChange={(v) => onFieldChange?.(v ?? null)}
          placeholder="请输入数字"
        />
      </div>
    );
  }
  if (widget === "select") {
    return (
      <div className="declCfgRenderFieldRow">
        <Typography.Text style={{ fontSize: 12 }}>{label}</Typography.Text>
        <Select
          allowClear
          placeholder="请选择"
          style={{ width: "100%" }}
          options={selectOptions}
          value={typeof fieldValue === "string" ? fieldValue : undefined}
          onChange={(v) => onFieldChange?.(v)}
        />
      </div>
    );
  }
  return (
    <div className="declCfgRenderFieldRow">
      <Typography.Text style={{ fontSize: 12 }}>{label}</Typography.Text>
      <Input
        value={fieldValue != null && typeof fieldValue !== "object" ? String(fieldValue) : ""}
        onChange={(e) => onFieldChange?.(e.target.value)}
        placeholder="请输入"
      />
    </div>
  );
}

function ListCellFill({
  cellType,
  value,
  onChange,
}: {
  cellType: string;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (cellType === "number") {
    return (
      <InputNumber
        className="declCfgRenderListCellControl"
        style={{ width: "100%" }}
        value={typeof value === "number" ? value : undefined}
        onChange={(v) => onChange(v ?? null)}
      />
    );
  }
  if (cellType === "boolean") {
    return (
      <Select
        className="declCfgRenderListCellControl"
        allowClear
        placeholder="是/否"
        style={{ width: "100%" }}
        value={value as string | undefined}
        onChange={onChange}
        options={[
          { label: "是", value: "yes" },
          { label: "否", value: "no" },
        ]}
      />
    );
  }
  if (cellType === "date") {
    return (
      <Input
        className="declCfgRenderListCellControl"
        type="date"
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  if (cellType === "file") {
    return (
      <Typography.Text type="secondary" className="declCfgRenderListCellControl">
        （填报时上传附件）
      </Typography.Text>
    );
  }
  return (
    <Input
      className="declCfgRenderListCellControl"
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder="请输入"
    />
  );
}

function formatListCellValue(cellType: string, value: unknown): string {
  if (value == null || value === "") return "";
  if (cellType === "boolean") {
    if (value === true || value === "yes") return "是";
    if (value === false || value === "no") return "否";
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item && typeof item === "object") {
          const o = item as Record<string, unknown>;
          return String(o.file_name ?? o.name ?? o.url ?? "");
        }
        return String(item);
      })
      .filter(Boolean)
      .join("、");
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    return String(o.file_name ?? o.name ?? o.url ?? "");
  }
  return String(value);
}

function SubModuleMapContent({
  subMap,
  interactive,
  printLayout,
  rowKeyPrefix,
  moduleKey,
  subKey,
  sectionKey,
  materialId,
  draft,
  onDraftChange,
}: {
  subMap: RawSubModule;
  interactive: boolean;
  printLayout: boolean;
  rowKeyPrefix: string;
  moduleKey: string;
  subKey: string;
  sectionKey: string;
  materialId?: number;
  draft: DeclarationDraftShape;
  onDraftChange: (next: DeclarationDraftShape) => void;
}) {
  const sentenceTemplate =
    typeof subMap.sentenceTemplate === "string"
      ? subMap.sentenceTemplate.trim()
      : "";
  const printColumns =
    typeof subMap.printColumns === "number" && subMap.printColumns > 0 ? subMap.printColumns : 12;
  const printRows =
    typeof subMap.printRows === "number" && subMap.printRows > 0 ? subMap.printRows : 4;
  const printTitleMode =
    subMap.printTitleMode === "left_merged" || subMap.printTitleMode === "hidden"
      ? subMap.printTitleMode
      : "top";
  const printTitleSpan =
    typeof subMap.printTitleSpan === "number" && subMap.printTitleSpan > 0
      ? Math.max(1, Math.min(Math.max(1, printColumns - 1), subMap.printTitleSpan))
      : 2;
  const contentSpan =
    printTitleMode === "left_merged" ? Math.max(1, printColumns - printTitleSpan) : printColumns;
  const mapGridColumns =
    printTitleMode === "left_merged"
      ? `var(--decl-print-left-title-width, 160px) repeat(${contentSpan}, minmax(32px, 1fr))`
      : `repeat(${printColumns}, minmax(32px, 1fr))`;
  const mapPrintMode =
    subMap.mapPrintMode === "field_table" || subMap.mapPrintMode === "statement_grid"
      ? subMap.mapPrintMode
      : "text_block";
  const sectionTitle = typeof subMap.title === "string" && subMap.title.trim() ? subMap.title.trim() : "表单汇总";
  const rawStatementLayout =
    subMap.statementLayout && typeof subMap.statementLayout === "object"
      ? (subMap.statementLayout as Record<string, unknown>)
      : {};
  const statementColumns = Array.isArray(rawStatementLayout.columns)
    ? rawStatementLayout.columns
    : [];
  const fields = Array.isArray(subMap.fields) ? subMap.fields : [];
  const attachments = Array.isArray(subMap.attachments)
    ? subMap.attachments
    : [];
  const printLike = printLayout;
  const mapValues = getMapFields(draft, moduleKey, subKey, sectionKey);

  const patchMapField = useCallback(
    (fieldName: string, v: unknown) => {
      onDraftChange(setMapField(draft, moduleKey, subKey, sectionKey, fieldName, v));
    },
    [draft, moduleKey, subKey, sectionKey, onDraftChange],
  );

  if (printLike && mapPrintMode === "text_block") {
    const textValue = mapValues[TEXT_BLOCK_FIELD_KEY];
    return (
      <div className="declCfgRenderPrintMapWrap">
        <div
          className="declCfgRenderPrintMap"
          style={{ gridTemplateColumns: mapGridColumns }}
        >
          {printTitleMode === "top" ? (
            <div
              className="declCfgRenderPrintMapTitle"
              style={{ gridColumn: `span ${printColumns}` }}
            >
              {sectionTitle}
            </div>
          ) : null}
          {printTitleMode === "left_merged" ? (
            <div
              className="declCfgRenderPrintMapLeftTitle"
              style={{
                gridColumn: "span 1",
                gridRow: `span ${printRows}`,
              }}
            >
              {sectionTitle}
            </div>
          ) : null}
          <div
            className="declCfgRenderPrintMapBody"
            style={{
              gridColumn: `span ${contentSpan}`,
              gridRow: `span ${printRows}`,
            }}
          >
            {interactive ? (
              <Input.TextArea
                className="declCfgRenderPrintMapTextArea"
                value={typeof textValue === "string" ? textValue : ""}
                placeholder={sentenceTemplate || "请输入"}
                autoSize={false}
                onChange={(e) => patchMapField(TEXT_BLOCK_FIELD_KEY, e.target.value)}
              />
            ) : typeof textValue === "string" && textValue.trim() ? (
              textValue
            ) : (
              sentenceTemplate
            )}
          </div>
        </div>
      </div>
    );
  }

  if (printLike && mapPrintMode === "statement_grid") {
    return (
      <div className="declCfgRenderPrintMapWrap">
        <div
          className="declCfgRenderPrintMap"
          style={{ gridTemplateColumns: `repeat(${printColumns}, minmax(32px, 1fr))` }}
        >
          {statementColumns.map((item, index) => {
            const column = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
            const rawSpan = column.col_span ?? column.colSpan;
            const span = typeof rawSpan === "number" && rawSpan > 0 ? rawSpan : 4;
            return (
              <div
                key={`${String(column.title ?? index)}_${index}`}
                className="declCfgRenderPrintStatementCell"
                style={{ gridColumn: `span ${Math.max(1, span)}` }}
              >
                <strong>{typeof column.title === "string" ? column.title : ""}</strong>
                <p>{typeof column.content === "string" ? column.content : ""}</p>
                <div>{typeof column.footer_label === "string" ? column.footer_label : ""}</div>
                <div className="declCfgRenderPrintStatementDate">
                  {typeof column.date_label === "string" ? column.date_label : ""}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <>
      {sentenceTemplate ? (
        <div className="declCfgRenderTemplate">{sentenceTemplate}</div>
      ) : null}
      {fields.map((f, i) => {
        const o = f && typeof f === "object" ? (f as Record<string, unknown>) : {};
        const name = typeof o.name === "string" ? o.name : `field_${i}`;
        const label = typeof o.label === "string" ? o.label : name;
        const widget = typeof o.widget === "string" ? o.widget : "input";
        return (
          <MapField
            key={`${rowKeyPrefix}-map-${name}-${i}`}
            label={label}
            widget={widget}
            interactive={interactive}
            raw={o}
            fieldValue={interactive ? mapValues[name] : undefined}
            onFieldChange={interactive ? (v) => patchMapField(name, v) : undefined}
          />
        );
      })}
      {attachments.length > 0 ? (
        <>
          <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 8 }}>
            附件要求
          </Typography.Text>
          <ul className="declCfgRenderAttachList">
            {attachments.map((a, j) => {
              const o = a && typeof a === "object" ? (a as Record<string, unknown>) : {};
              const key = typeof o.key === "string" ? o.key : `att_${j}`;
              const lab = typeof o.label === "string" ? o.label : key;
              const req = o.required === true;
              const accept = typeof o.accept === "string" ? o.accept : "";
              const maxSize = typeof o.maxSize === "number" ? o.maxSize : null;
              const templateUrl = typeof o.templateUrl === "string" ? o.templateUrl.trim() : "";
              const uploaded = interactive
                ? getMapAttachmentFiles(draft, moduleKey, subKey, sectionKey, key)
                : [];
              return (
                <li key={key + j}>
                  <Space size={4} wrap align="start">
                    <span>{lab}</span>
                    {req ? <Tag>必填</Tag> : <Tag>选填</Tag>}
                    {accept ? <Tag color="blue">{accept}</Tag> : null}
                    {maxSize != null ? <Tag>最大 {Math.round(maxSize / 1024)} KB</Tag> : null}
                    {templateUrl ? (
                      <a href={templateUrl} target="_blank" rel="noreferrer">
                        模板下载
                      </a>
                    ) : null}
                    {interactive ? (
                      <Upload
                        maxCount={1}
                        fileList={uploaded.map((x) => ({
                          uid: String(x.id),
                          name: x.file_name,
                          status: "done" as const,
                          url: attachmentDownloadUrl(x.id),
                        }))}
                        showUploadList={{ showDownloadIcon: true, showRemoveIcon: true }}
                        beforeUpload={(file) => {
                          if (!materialId) {
                            message.warning("请先保存为草稿后再上传附件");
                            return Upload.LIST_IGNORE;
                          }
                          const ext = (file.name.split(".").pop() || "").toLowerCase();
                          if (
                            accept &&
                            !accept
                              .split(",")
                              .map((x) => x.trim().replace(/^\./, ""))
                              .includes(ext)
                          ) {
                            message.error(`文件类型不符合要求：${accept}`);
                            return Upload.LIST_IGNORE;
                          }
                          if (maxSize != null && maxSize > 0 && file.size > maxSize) {
                            message.error(`文件过大，最大允许 ${Math.round(maxSize / 1024)} KB`);
                            return Upload.LIST_IGNORE;
                          }
                          return true;
                        }}
                        customRequest={async (options) => {
                          try {
                            const f = options.file as File;
                            if (!materialId) throw new Error("no materialId");
                            const created = await uploadAttachment(materialId, f);
                            const current = getMapAttachmentFiles(
                              draft,
                              moduleKey,
                              subKey,
                              sectionKey,
                              key,
                            );
                            const next: DeclarationAttachmentRef[] = [
                              ...current,
                              {
                                id: created.id,
                                file_name: created.file_name,
                                file_size: created.file_size,
                                file_type: created.file_type,
                                created_at: created.created_at,
                              },
                            ];
                            onDraftChange(
                              setMapAttachmentFiles(
                                draft,
                                moduleKey,
                                subKey,
                                sectionKey,
                                key,
                                next,
                              ),
                            );
                            options.onSuccess?.(created, f);
                          } catch (e) {
                            options.onError?.(e as Error);
                            message.error("上传失败");
                          }
                        }}
                        onRemove={async (file) => {
                          try {
                            const id = Number(file.uid);
                            if (!Number.isFinite(id) || id <= 0) return false;
                            await deleteAttachment(id);
                            const current = getMapAttachmentFiles(
                              draft,
                              moduleKey,
                              subKey,
                              sectionKey,
                              key,
                            );
                            const next = current.filter((x) => x.id !== id);
                            onDraftChange(
                              setMapAttachmentFiles(
                                draft,
                                moduleKey,
                                subKey,
                                sectionKey,
                                key,
                                next,
                              ),
                            );
                            return true;
                          } catch {
                            message.error("删除失败");
                            return false;
                          }
                        }}
                      >
                        <Button size="small" icon={<UploadOutlined />}>
                          选择文件
                        </Button>
                      </Upload>
                    ) : null}
                  </Space>
                  {interactive && req && uploaded.length === 0 ? (
                    <Typography.Text type="danger" style={{ fontSize: 12, display: "block" }}>
                      请上传必填附件
                    </Typography.Text>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </>
  );
}

function SubModuleListContent({
  subList,
  interactive,
  printLayout,
  materialPreview,
  moduleKey,
  subKey,
  sectionKey,
  draft,
  onDraftChange,
}: {
  subList: RawSubModule;
  interactive: boolean;
  printLayout: boolean;
  materialPreview: boolean;
  moduleKey: string;
  subKey: string;
  sectionKey: string;
  draft: DeclarationDraftShape;
  onDraftChange: (next: DeclarationDraftShape) => void;
}) {
  const columnsRaw = Array.isArray(subList.columns) ? subList.columns : [];
  const maxRows =
    typeof subList.maxRows === "number" && subList.maxRows > 0 ? subList.maxRows : 10;
  const printColumns =
    typeof subList.printColumns === "number" && subList.printColumns > 0 ? subList.printColumns : 12;
  const sectionTitle = typeof subList.title === "string" && subList.title.trim() ? subList.title.trim() : "列表";
  const printTitleMode =
    subList.printTitleMode === "left_merged" || subList.printTitleMode === "hidden"
      ? subList.printTitleMode
      : "top";
  const printTitleSpan =
    typeof subList.printTitleSpan === "number" && subList.printTitleSpan > 0
      ? Math.max(1, Math.min(Math.max(1, printColumns - 1), subList.printTitleSpan))
      : 2;
  const contentPrintColumns =
    printTitleMode === "left_merged" ? Math.max(1, printColumns - printTitleSpan) : printColumns;
  const listGridColumns =
    printTitleMode === "left_merged"
      ? `var(--decl-print-left-title-width, 160px) repeat(${contentPrintColumns}, minmax(32px, 1fr))`
      : `repeat(${printColumns}, minmax(32px, 1fr))`;
  const printColumnItems = columnsRaw.map((c, idx) => {
    const o = c && typeof c === "object" ? (c as Record<string, unknown>) : {};
    const name = typeof o.name === "string" ? o.name : `col_${idx}`;
    const title = typeof o.title === "string" && o.title.trim() ? o.title.trim() : name;
    const rawSpan = o.colSpan ?? o.col_span ?? o.printColSpan ?? o.print_col_span;
    const span = Math.max(
      1,
      Math.min(contentPrintColumns, typeof rawSpan === "number" && rawSpan > 0 ? rawSpan : 2),
    );
    return { key: name, title, span };
  });
  const printUsedColumns = printColumnItems.reduce((sum, column) => sum + column.span, 0);
  const printFillSpan =
    (contentPrintColumns - (printUsedColumns % contentPrintColumns)) % contentPrintColumns;
  const tb =
    subList.toolbar && typeof subList.toolbar === "object"
      ? (subList.toolbar as Record<string, unknown>)
      : {};
  const toolbarBits: string[] = [];
  if (tb.add !== false) toolbarBits.push("添加");
  if (tb.edit !== false) toolbarBits.push("编辑");
  if (tb.remove !== false) toolbarBits.push("删除");
  if (tb.sort !== false) toolbarBits.push("排序");

  const showAdd = tb.add !== false;
  const showRemove = tb.remove !== false;
  const pasteEnabled = subList.pasteEnabled !== false;
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");

  const tableColsReadonly = columnsRaw.map((c, idx) => {
    const o = c && typeof c === "object" ? (c as Record<string, unknown>) : {};
    const name = typeof o.name === "string" ? o.name : `col_${idx}`;
    const colTitle = typeof o.title === "string" ? o.title : name;
    const cellType = typeof o.cellType === "string" ? o.cellType : "text";
    const width = typeof o.width === "number" ? o.width : undefined;
    return {
      title: (
        <span>
          {colTitle}
          <Typography.Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>
            ({cellType})
          </Typography.Text>
        </span>
      ),
      dataIndex: name,
      key: name,
      width,
      render: () => <Typography.Text type="secondary">—</Typography.Text>,
    };
  });

  const storedRows = getListRows(draft, moduleKey, subKey, sectionKey);
  const listRows =
    interactive && storedRows && storedRows.length > 0 ? storedRows : interactive ? [{}] : [];

  const updateCell = useCallback(
    (rowIndex: number, colName: string, v: unknown) => {
      const base = getListRows(draft, moduleKey, subKey, sectionKey);
      const nextBase = base && base.length > 0 ? [...base] : [{}];
      nextBase[rowIndex] = { ...nextBase[rowIndex], [colName]: v };
      onDraftChange(setDraftListRows(draft, moduleKey, subKey, sectionKey, nextBase));
    },
    [draft, moduleKey, subKey, sectionKey, onDraftChange],
  );

  const addListRow = useCallback(() => {
    const base = getListRows(draft, moduleKey, subKey, sectionKey);
    const current = base && base.length > 0 ? base : [{}];
    if (current.length >= maxRows) return;
    onDraftChange(setDraftListRows(draft, moduleKey, subKey, sectionKey, [...current, {}]));
  }, [draft, moduleKey, subKey, sectionKey, maxRows, onDraftChange]);

  const removeListRow = useCallback(
    (idx: number) => {
      const base = getListRows(draft, moduleKey, subKey, sectionKey) ?? [{}];
      if (base.length <= 1) return;
      onDraftChange(
        setDraftListRows(draft, moduleKey, subKey, sectionKey, base.filter((_, i) => i !== idx)),
      );
    },
    [draft, moduleKey, subKey, sectionKey, onDraftChange],
  );

  const copyListRow = useCallback(
    (idx: number) => {
      const base = getListRows(draft, moduleKey, subKey, sectionKey) ?? [{}];
      if (base.length >= maxRows) return;
      const source = base[idx] && typeof base[idx] === "object" ? base[idx] : {};
      const next = [...base];
      next.splice(idx + 1, 0, { ...source });
      onDraftChange(setDraftListRows(draft, moduleKey, subKey, sectionKey, next));
    },
    [draft, moduleKey, subKey, sectionKey, maxRows, onDraftChange],
  );

  const applyPasteRows = useCallback(() => {
    const usableColumns = columnsRaw
      .map((c, idx) => {
        const o = c && typeof c === "object" ? (c as Record<string, unknown>) : {};
        return typeof o.name === "string" ? o.name : `col_${idx}`;
      })
      .filter(Boolean);
    if (usableColumns.length === 0) {
      message.warning("当前表格没有可粘贴的列");
      return;
    }
    const rows = pasteText
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter((line) => line.trim() !== "")
      .map((line) => line.split("\t"));
    if (rows.length === 0) {
      message.warning("请先粘贴表格内容");
      return;
    }
    const parsed = rows.map((cells) => {
      const row: Record<string, unknown> = {};
      usableColumns.forEach((name, index) => {
        row[name] = cells[index] ?? "";
      });
      return row;
    });
    const base = getListRows(draft, moduleKey, subKey, sectionKey);
    const current = base && base.length > 0 ? base : [];
    const next = [...current, ...parsed].slice(0, maxRows);
    onDraftChange(setDraftListRows(draft, moduleKey, subKey, sectionKey, next.length ? next : [{}]));
    if (current.length + parsed.length > maxRows) {
      message.warning(`已按最大行数 ${maxRows} 截断`);
    }
    setPasteText("");
    setPasteOpen(false);
  }, [columnsRaw, draft, moduleKey, subKey, sectionKey, maxRows, onDraftChange, pasteText]);

  const dataSourceReadonly: Record<string, unknown>[] = [];
  const dataSourceFill = listRows.map((row, i) => ({ ...row, key: i, __rowIndex: i }));
  const previewRows = !interactive && storedRows ? storedRows : [];
  const renderedPrintRows = interactive
    ? Math.max(1, listRows.length)
    : storedRows
      ? Math.max(1, storedRows.length)
      : materialPreview
        ? 1
        : maxRows;

  const tableColsFill = columnsRaw.map((c, idx) => {
    const o = c && typeof c === "object" ? (c as Record<string, unknown>) : {};
    const name = typeof o.name === "string" ? o.name : `col_${idx}`;
    const colTitle = typeof o.title === "string" ? o.title : name;
    const cellType = typeof o.cellType === "string" ? o.cellType : "text";
    const width = typeof o.width === "number" ? o.width : undefined;
    return {
      title: (
        <span>
          {colTitle}
          <Typography.Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>
            ({cellType})
          </Typography.Text>
        </span>
      ),
      dataIndex: name,
      key: name,
      width,
      render: (_: unknown, record: Record<string, unknown>) => {
        const rowIndex = Number(record.__rowIndex);
        const v = record[name];
        return (
          <ListCellFill
            cellType={cellType}
            value={v}
            onChange={(nv) => updateCell(rowIndex, name, nv)}
          />
        );
      },
    };
  });

  if (printLayout) {
    return (
      <div className="declCfgRenderPrintListWrap">
        <div
          className="declCfgRenderPrintList"
          style={{ gridTemplateColumns: listGridColumns }}
        >
          {printTitleMode === "top" ? (
            <div
              className="declCfgRenderPrintListTitle"
              style={{ gridColumn: `span ${printColumns}` }}
            >
              {sectionTitle}
            </div>
          ) : null}
          {printTitleMode === "left_merged" ? (
            <div
              className="declCfgRenderPrintListLeftTitle"
              style={{
                gridColumn: "span 1",
                gridRow: `span ${renderedPrintRows + 1}`,
              }}
            >
              {sectionTitle}
            </div>
          ) : null}
          {printColumnItems.length > 0 ? (
            <>
              {printColumnItems.map((column) => (
                <div
                  key={column.key}
                  className="declCfgRenderPrintListHead"
                  style={{ gridColumn: `span ${column.span}` }}
                >
                  {column.title}
                </div>
              ))}
              {printFillSpan > 0 ? (
                <div
                  className="declCfgRenderPrintListFiller declCfgRenderPrintListHeadFiller"
                  style={{ gridColumn: `span ${printFillSpan}` }}
                />
              ) : null}
            </>
          ) : (
            <div
              className="declCfgRenderPrintListEmpty"
              style={{ gridColumn: `span ${printColumns}` }}
            >
              （无列定义）
            </div>
          )}
          {printColumnItems.length > 0
            ? Array.from({ length: renderedPrintRows }).flatMap((_, rowIndex) => {
                const sourceRows = interactive ? listRows : previewRows;
                const record =
                  sourceRows[rowIndex] && typeof sourceRows[rowIndex] === "object"
                    ? sourceRows[rowIndex]
                    : {};
                const rowCells = printColumnItems.map((column) => {
                  const rawColumn = columnsRaw.find((item, idx) => {
                    const o = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
                    const name = typeof o.name === "string" ? o.name : `col_${idx}`;
                    return name === column.key;
                  });
                  const rawColumnObj =
                    rawColumn && typeof rawColumn === "object"
                      ? (rawColumn as Record<string, unknown>)
                      : {};
                  const cellType =
                    typeof rawColumnObj.cellType === "string" ? rawColumnObj.cellType : "text";
                  return (
                    <div
                      key={`${rowIndex}-${column.key}`}
                      className="declCfgRenderPrintListBody"
                      style={{ gridColumn: `span ${column.span}` }}
                    >
                      {interactive ? (
                        <ListCellFill
                          cellType={cellType}
                          value={(record as Record<string, unknown>)[column.key]}
                          onChange={(nextValue) => updateCell(rowIndex, column.key, nextValue)}
                        />
                      ) : (
                        formatListCellValue(
                          cellType,
                          (record as Record<string, unknown>)[column.key],
                        )
                      )}
                    </div>
                  );
                });
                return printFillSpan > 0
                  ? [
                      ...rowCells,
                      <div
                        key={`${rowIndex}-row-filler`}
                        className="declCfgRenderPrintListFiller"
                        style={{ gridColumn: `span ${printFillSpan}` }}
                      />,
                    ]
                  : rowCells;
              })
            : null}
        </div>
        {interactive && (showAdd || showRemove) ? (
          <div className="declCfgRenderPrintListSideActions">
            {showAdd ? (
              <Button
                size="small"
                type="text"
                shape="circle"
                icon={<PlusOutlined />}
                title="添加一行"
                aria-label="添加一行"
                onClick={addListRow}
                disabled={listRows.length >= maxRows}
              />
            ) : null}
            {showRemove ? (
              <Button
                size="small"
                type="text"
                danger
                shape="circle"
                icon={<MinusOutlined />}
                title="删除末行"
                aria-label="删除末行"
                onClick={() => removeListRow(listRows.length - 1)}
                disabled={listRows.length <= 1}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <Descriptions size="small" column={1} style={{ marginBottom: 8 }}>
        <Descriptions.Item label="最大行数">{maxRows}</Descriptions.Item>
        <Descriptions.Item label="工具栏">{toolbarBits.join(" / ") || "—"}</Descriptions.Item>
      </Descriptions>
      {interactive && (showAdd || showRemove) ? (
        <Space wrap style={{ marginBottom: 8 }}>
          {showAdd ? (
            <Button size="small" type="dashed" onClick={addListRow} disabled={listRows.length >= maxRows}>
              添加一行
            </Button>
          ) : null}
          {pasteEnabled ? (
            <Button size="small" onClick={() => setPasteOpen(true)} disabled={listRows.length >= maxRows}>
              粘贴多行
            </Button>
          ) : null}
        </Space>
      ) : null}
      <Table
        className="declCfgRenderTable"
        size="small"
        pagination={false}
        scroll={{ x: "max-content" }}
        dataSource={interactive ? dataSourceFill : dataSourceReadonly}
        locale={{
          emptyText: interactive ? "点击「添加一行」开始填写，保存申报时一并提交" : "（填报时在此增删行）",
        }}
        columns={
          interactive
            ? tableColsFill.length > 0
              ? [
                  ...tableColsFill,
                  ...(showRemove
                    ? [
                        {
                          title: "操作",
                          key: "_op",
                          width: 126,
                          fixed: "right" as const,
                          render: (_: unknown, record: Record<string, unknown>) => (
                            <Space size={2}>
                              <Button
                                type="link"
                                size="small"
                                disabled={listRows.length >= maxRows}
                                onClick={() => copyListRow(Number(record.__rowIndex))}
                              >
                                复制
                              </Button>
                              <Button
                                type="link"
                                danger
                                size="small"
                                disabled={listRows.length <= 1}
                                onClick={() => removeListRow(Number(record.__rowIndex))}
                              >
                                删除
                              </Button>
                            </Space>
                          ),
                        },
                      ]
                    : []),
                ]
              : [{ title: "（无列定义）", key: "empty", render: () => null }]
            : tableColsReadonly.length > 0
              ? tableColsReadonly
              : [{ title: "（无列定义）", key: "empty", render: () => null }]
        }
      />
      {interactive && pasteOpen ? (
        <div className="declCfgRenderPastePanel">
          <Typography.Text type="secondary">
            从 Excel 复制多行后粘贴到下方，系统会按当前列顺序写入。
          </Typography.Text>
          <Input.TextArea
            value={pasteText}
            onChange={(event) => setPasteText(event.target.value)}
            rows={5}
            placeholder="每行一条记录，列之间用 Tab 分隔"
          />
          <Space>
            <Button type="primary" size="small" onClick={applyPasteRows}>
              应用粘贴
            </Button>
            <Button
              size="small"
              onClick={() => {
                setPasteOpen(false);
                setPasteText("");
              }}
            >
              取消
            </Button>
          </Space>
        </div>
      ) : null}
    </>
  );
}

function FormRefSection({
  sec,
  interactive,
  moduleKey,
  subKey,
  sectionKey,
  draft,
  onDraftChange,
}: {
  sec: RawSection;
  interactive: boolean;
  moduleKey: string;
  subKey: string;
  sectionKey: string;
  draft: DeclarationDraftShape;
  onDraftChange: (next: DeclarationDraftShape) => void;
}) {
  const templateId = (sec as any).templateId ?? (sec as any).template_id ?? null;
  const templateVersion = (sec as any).templateVersion ?? (sec as any).template_version ?? null;

  const [loading, setLoading] = useState(false);
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [fields, setFields] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!templateId) return;
    const ver = templateVersion && typeof templateVersion === "number" ? templateVersion : 1;
    setLoading(true);
    setError(null);
    getPublicVersion(templateId, ver)
      .then((v) => {
        setSchema(v.schema as Record<string, unknown>);
        setFields(v.fields as Record<string, unknown>);
      })
      .catch(() => setError("问卷加载失败"))
      .finally(() => setLoading(false));
  }, [templateId, templateVersion]);

  const handleChange = useCallback(
    (nextValues: Record<string, unknown>) => {
      onDraftChange(setFormRefValues(draft, moduleKey, subKey, sectionKey, nextValues));
    },
    [draft, moduleKey, subKey, sectionKey, onDraftChange],
  );

  if (!templateId) {
    return (
      <Card size="small" style={{ background: "#fafafa", borderStyle: "dashed" }}>
        <Typography.Text type="secondary">未配置问卷模板（templateId 为空）</Typography.Text>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card size="small" style={{ background: "#fafafa", borderStyle: "dashed" }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <Spin tip="加载问卷中…" />
        </div>
      </Card>
    );
  }

  if (error || !schema) {
    return (
      <Card size="small" style={{ background: "#fafafa", borderStyle: "dashed" }}>
        <Typography.Text type="danger">{error ?? "问卷不存在"}</Typography.Text>
      </Card>
    );
  }

  return (
    <Card size="small" style={{ background: "#fafafa", borderStyle: "dashed" }}>
      <SurveyPreview
        schemaJson={JSON.stringify(schema)}
        fieldsJson={JSON.stringify(fields)}
        readOnly={!interactive}
        onSubmit={interactive ? handleChange : undefined}
        templateId={templateId as number}
        version={templateVersion as number}
        showIndex={false}
      />
    </Card>
  );
}

function SubModuleBlock({
  sub,
  si,
  interactive,
  printLayout,
  materialPreview,
  rowKeyPrefix,
  moduleKey,
  materialId,
  draft,
  onDraftChange,
}: {
  sub: RawSubModule;
  si: number;
  interactive: boolean;
  printLayout: boolean;
  materialPreview: boolean;
  rowKeyPrefix: string;
  moduleKey: string;
  materialId?: number;
  draft: DeclarationDraftShape;
  onDraftChange: (next: DeclarationDraftShape) => void;
}) {
  const subKey = typeof sub.key === "string" ? sub.key : `sub_${si}`;
  const { title, helpText } = pickSubTitleAndHelp(sub);
  const sections = normalizeSubSections(sub);

  const content = (
    <>
      {sections.map((sec, idx) => {
        const sectionKey =
          typeof sec.key === "string" && sec.key.trim()
            ? sec.key.trim()
            : `sec_${idx}`;
        const kind =
          sec.kind === "list"
            ? "list"
            : sec.kind === "form"
              ? "form"
              : sec.kind === "form_ref"
                ? "form_ref"
                : "map";
        const secTitle = typeof sec.title === "string" ? sec.title.trim() : "";
        return (
          <div key={sectionKey}>
            {interactive && !printLayout && secTitle && kind !== "list" ? (
              <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 6 }}>
                {secTitle}
              </Typography.Text>
            ) : null}
            {kind === "map" ? (
              <SubModuleMapContent
                subMap={sec}
                interactive={interactive}
                printLayout={printLayout}
                rowKeyPrefix={`${rowKeyPrefix}-${sectionKey}`}
                moduleKey={moduleKey}
                subKey={subKey}
                sectionKey={sectionKey}
                materialId={materialId}
                draft={draft}
                onDraftChange={onDraftChange}
              />
            ) : kind === "list" ? (
              <SubModuleListContent
                subList={sec}
                interactive={interactive}
                printLayout={printLayout}
                materialPreview={materialPreview}
                moduleKey={moduleKey}
                subKey={subKey}
                sectionKey={sectionKey}
                draft={draft}
                onDraftChange={onDraftChange}
              />
            ) : kind === "form_ref" ? (
              <FormRefSection
                sec={sec}
                interactive={interactive}
                moduleKey={moduleKey}
                subKey={subKey}
                sectionKey={sectionKey}
                draft={draft}
                onDraftChange={onDraftChange}
              />
            ) : (
              <SubModuleFormContent
                sec={sec}
                interactive={interactive}
                moduleKey={moduleKey}
                subKey={subKey}
                sectionKey={sectionKey}
                materialId={materialId}
                draft={draft}
                onDraftChange={onDraftChange}
              />
            )}
            {interactive && !printLayout && idx < sections.length - 1 ? <div style={{ height: 12 }} /> : null}
          </div>
        );
      })}
    </>
  );

  if (printLayout) return <>{content}</>;

  return (
    <Card
      size="small"
      className="declCfgRenderSubCard"
      title={
        <div className="declCfgRenderSubHeaderTitle">
          <span className="declCfgRenderSubHeaderTitleMain">
            {title || "子模块"}
          </span>
          {interactive && helpText ? (
            <span className="declCfgRenderSubHeaderHelp" title={helpText}>
              {helpText}
            </span>
          ) : null}
        </div>
      }
    >
      {content}
    </Card>
  );
}

function ModuleSectionContent({
  mod,
  mi,
  interactive,
  printLayout,
  materialPreview,
  materialId,
  draft,
  onDraftChange,
}: {
  mod: RawModule;
  mi: number;
  interactive: boolean;
  printLayout: boolean;
  materialPreview: boolean;
  materialId?: number;
  draft: DeclarationDraftShape;
  onDraftChange: (next: DeclarationDraftShape) => void;
}) {
  const key = typeof mod.key === "string" ? mod.key : `module_${mi}`;
  const subsRaw = Array.isArray(mod.subModules) ? mod.subModules : [];
  const subs = sortByOrder(
    subsRaw.filter((s) => s && typeof s === "object") as RawSubModule[],
  );
  if (subs.length === 0) {
    return <Typography.Text type="secondary">（本模块下暂无子模块）</Typography.Text>;
  }
  return (
    <>
      {subs.map((sub, si) => (
        <SubModuleBlock
          key={(typeof sub.key === "string" ? sub.key : "sub") + si}
          sub={sub}
          si={si}
          interactive={interactive}
          printLayout={printLayout}
          materialPreview={materialPreview}
          rowKeyPrefix={`${key}-${si}`}
          moduleKey={key}
          materialId={materialId}
          draft={draft}
          onDraftChange={onDraftChange}
        />
      ))}
    </>
  );
}

/**
 * 管理端预览与填报端共用：preview 只读；fill 可填，若传入 onDraftChange（通常配合 draft）则由外部持久化。
 */
export function DeclarationConfigRenderer({
  config,
  variant = "preview",
  hint,
  moduleLayout = "stack",
  draft: draftProp,
  onDraftChange,
  leadingTab,
  materialId,
  displayMode = "standard",
}: DeclarationConfigRendererProps) {
  const interactive = variant === "fill";
  const printFlow = !interactive || displayMode === "print";
  const [internalDraft, setInternalDraft] = useState<DeclarationDraftShape>(() =>
    emptyDeclarationDraft(),
  );
  const controlled = typeof onDraftChange === "function";
  const hasDraftProp = draftProp !== undefined;
  const materialPreview = !interactive && hasDraftProp;
  const draft = normalizeDeclarationDraft(
    hasDraftProp ? draftProp : internalDraft,
  );
  const commitDraft = useCallback(
    (next: DeclarationDraftShape) => {
      if (controlled) onDraftChange(next);
      else setInternalDraft(next);
    },
    [controlled, onDraftChange],
  );
  const normalized = normalizeDeclarationConfig(config);
  const modulesRaw = Array.isArray(normalized.modules) ? normalized.modules : [];
  const modules = sortByOrder(
    modulesRaw.filter((m) => m && typeof m === "object") as RawModule[],
  );
  const profileBinding =
    normalized.profileBinding && typeof normalized.profileBinding === "object"
      ? (normalized.profileBinding as Record<string, unknown>)
      : null;
  const profilePreview =
    !interactive && profileBinding && leadingTab == null ? (
      <ProfileBindingPrintPreview binding={profileBinding} />
    ) : null;

  const moduleTabKeys = useMemo(() => {
    const keys = modules.map((mod, mi) =>
      typeof mod.key === "string" ? mod.key : `module_${mi}`,
    );
    return leadingTab?.key ? [leadingTab.key, ...keys] : keys;
  }, [modules, leadingTab?.key]);

  const [activeModuleTabKey, setActiveModuleTabKey] = useState<string>("");

  useEffect(() => {
    if (moduleTabKeys.length === 0) {
      if (activeModuleTabKey !== "") setActiveModuleTabKey("");
      return;
    }
    if (!activeModuleTabKey || !moduleTabKeys.includes(activeModuleTabKey)) {
      setActiveModuleTabKey(moduleTabKeys[0] ?? "");
    }
  }, [moduleTabKeys, activeModuleTabKey]);

  const configModuleTabItems = useMemo(
    () =>
      modules.map((mod, mi) => {
        const tabKey = typeof mod.key === "string" ? mod.key : `module_${mi}`;
        const title = typeof mod.title === "string" ? mod.title : tabKey;
        return {
          key: tabKey,
          label: title?.trim() ? title : "未命名模块",
          children: (
            <div className="declCfgRenderModuleTabPane">
              <ModuleSectionContent
                mod={mod}
                mi={mi}
                interactive={interactive}
                printLayout={printFlow}
                materialPreview={materialPreview}
                materialId={materialId}
                draft={draft}
                onDraftChange={commitDraft}
              />
            </div>
          ),
        };
      }),
    [modules, interactive, draft, commitDraft],
  );

  const tabsItems = useMemo(() => {
    const lead =
      leadingTab != null
        ? [
            {
              key: leadingTab.key,
              label: leadingTab.label,
              children: (
                <div className="declCfgRenderModuleTabPane">{leadingTab.children}</div>
              ),
            },
          ]
        : [];
    return [...lead, ...configModuleTabItems];
  }, [leadingTab, configModuleTabItems]);

  if (modules.length === 0) {
    if (leadingTab != null && moduleLayout === "tabs") {
      return (
        <div className="declCfgRender">
          {hint ? <div className="declCfgRenderHint">{hint}</div> : null}
          <Tabs
            className="declCfgRenderModuleTabs"
            size="small"
            destroyOnHidden={false}
            activeKey={activeModuleTabKey}
            onChange={setActiveModuleTabKey}
            items={tabsItems}
          />
        </div>
      );
    }
    if (leadingTab != null && moduleLayout === "stack") {
      return (
        <div className="declCfgRender">
          {hint ? <div className="declCfgRenderHint">{hint}</div> : null}
          <Card size="small" className="declCfgRenderModule" title={leadingTab.label}>
            {leadingTab.children}
          </Card>
          <Typography.Text type="secondary">
            当前配置暂无模块，请在可视化或 JSON 中添加 modules。
          </Typography.Text>
        </div>
      );
    }
    return (
      <div className="declCfgRender">
        {hint ? <div className="declCfgRenderHint">{hint}</div> : null}
        {profilePreview}
        <Typography.Text type="secondary">当前配置暂无模块，请在可视化或 JSON 中添加 modules。</Typography.Text>
      </div>
    );
  }

  if (moduleLayout === "tabs") {
    return (
      <div className="declCfgRender">
        {hint ? <div className="declCfgRenderHint">{hint}</div> : null}
        <Tabs
          className="declCfgRenderModuleTabs"
          size="small"
          destroyOnHidden={false}
          activeKey={activeModuleTabKey}
          onChange={setActiveModuleTabKey}
          items={tabsItems}
        />
      </div>
    );
  }

  return (
    <div className={printFlow ? "declCfgRender declCfgRenderPrintFlow" : "declCfgRender"}>
      {hint ? <div className="declCfgRenderHint">{hint}</div> : null}
      {profilePreview}
      {leadingTab != null && printFlow ? (
        <div className="declCfgRenderPrintLeading">{leadingTab.children}</div>
      ) : null}
      {leadingTab != null && !printFlow ? (
        <Card size="small" className="declCfgRenderModule" title={leadingTab.label}>
          {leadingTab.children}
        </Card>
      ) : null}
      {modules.map((mod, mi) => {
        const key = typeof mod.key === "string" ? mod.key : `module_${mi}`;
        const title = typeof mod.title === "string" ? mod.title : key;
        if (printFlow) {
          return (
            <ModuleSectionContent
              key={key}
              mod={mod}
              mi={mi}
              interactive={interactive}
              printLayout={printFlow}
              materialPreview={materialPreview}
              materialId={materialId}
              draft={draft}
              onDraftChange={commitDraft}
            />
          );
        }
        return (
          <Card key={key} size="small" className="declCfgRenderModule" title={title}>
            <ModuleSectionContent
              mod={mod}
              mi={mi}
              interactive={interactive}
              printLayout={printFlow}
              materialPreview={materialPreview}
              materialId={materialId}
              draft={draft}
              onDraftChange={commitDraft}
            />
          </Card>
        );
      })}
    </div>
  );
}
