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
  Table,
  Tabs,
  Tag,
  Typography,
  Upload,
  message,
} from "antd";
import { UploadOutlined } from "@ant-design/icons";
import { normalizeDeclarationConfig } from "./normalize";
import type { DeclarationDraftShape } from "./declarationDraftShape";
import {
  emptyDeclarationDraft,
  getListRows,
  getMapFields,
  normalizeDeclarationDraft,
  setListRows as setDraftListRows,
  setMapField,
} from "./declarationDraftShape";
import "./DeclarationConfigRenderer.css";

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
  /**
   * 在 tabs 布局下插在最前的标签（如申报页「基本信息」）；stack 布局下显示在模块卡片之前。
   */
  leadingTab?: { key: string; label: ReactNode; children: ReactNode };
};

type RawModule = Record<string, unknown>;
type RawSubModule = Record<string, unknown>;

function sortByOrder<T extends { order?: unknown }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => {
    const ao = typeof a.order === "number" ? a.order : 0;
    const bo = typeof b.order === "number" ? b.order : 0;
    return ao - bo;
  });
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

function SubModuleMapBlock({
  sub,
  interactive,
  rowKeyPrefix,
  moduleKey,
  subKey,
  draft,
  onDraftChange,
}: {
  sub: RawSubModule;
  interactive: boolean;
  rowKeyPrefix: string;
  moduleKey: string;
  subKey: string;
  draft: DeclarationDraftShape;
  onDraftChange: (next: DeclarationDraftShape) => void;
}) {
  const title = typeof sub.title === "string" ? sub.title : "";
  const helpText = typeof sub.helpText === "string" ? sub.helpText : "";
  const sentenceTemplate =
    typeof sub.sentenceTemplate === "string" ? sub.sentenceTemplate.trim() : "";
  const fields = Array.isArray(sub.fields) ? sub.fields : [];
  const attachments = Array.isArray(sub.attachments) ? sub.attachments : [];
  const mapValues = interactive ? getMapFields(draft, moduleKey, subKey) : {};

  const patchMapField = useCallback(
    (fieldName: string, v: unknown) => {
      onDraftChange(setMapField(draft, moduleKey, subKey, fieldName, v));
    },
    [draft, moduleKey, subKey, onDraftChange],
  );

  return (
    <Card size="small" className="declCfgRenderSubCard" title={title || "子模块"}>
      {helpText ? <span className="declCfgRenderHelp">{helpText}</span> : null}
      {sentenceTemplate ? <div className="declCfgRenderTemplate">{sentenceTemplate}</div> : null}
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
              return (
                <li key={key + j}>
                  <Space size={4} wrap align="start">
                    <span>{lab}</span>
                    {req ? <Tag>必填</Tag> : <Tag>选填</Tag>}
                    {accept ? <Tag color="blue">{accept}</Tag> : null}
                    {maxSize != null ? <Tag>最大 {Math.round(maxSize / 1024)} KB</Tag> : null}
                    {interactive ? (
                      <Upload
                        maxCount={1}
                        showUploadList
                        beforeUpload={() => {
                          message.info("附件上传需对接存储服务后生效，当前可先填写其他项");
                          return false;
                        }}
                      >
                        <Button size="small" icon={<UploadOutlined />}>
                          选择文件
                        </Button>
                      </Upload>
                    ) : null}
                  </Space>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </Card>
  );
}

function SubModuleListBlock({
  sub,
  interactive,
  moduleKey,
  subKey,
  draft,
  onDraftChange,
}: {
  sub: RawSubModule;
  interactive: boolean;
  moduleKey: string;
  subKey: string;
  draft: DeclarationDraftShape;
  onDraftChange: (next: DeclarationDraftShape) => void;
}) {
  const title = typeof sub.title === "string" ? sub.title : "";
  const helpText = typeof sub.helpText === "string" ? sub.helpText : "";
  const columnsRaw = Array.isArray(sub.columns) ? sub.columns : [];
  const maxRows =
    typeof sub.maxRows === "number" && sub.maxRows > 0 ? sub.maxRows : 10;
  const tb = sub.toolbar && typeof sub.toolbar === "object" ? (sub.toolbar as Record<string, unknown>) : {};
  const toolbarBits: string[] = [];
  if (tb.add !== false) toolbarBits.push("添加");
  if (tb.edit !== false) toolbarBits.push("编辑");
  if (tb.remove !== false) toolbarBits.push("删除");
  if (tb.sort !== false) toolbarBits.push("排序");

  const showAdd = tb.add !== false;
  const showRemove = tb.remove !== false;

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

  const storedRows = interactive ? getListRows(draft, moduleKey, subKey) : null;
  const listRows =
    interactive && storedRows && storedRows.length > 0 ? storedRows : interactive ? [{}] : [];

  const updateCell = useCallback(
    (rowIndex: number, colName: string, v: unknown) => {
      const base = getListRows(draft, moduleKey, subKey);
      const nextBase = base && base.length > 0 ? [...base] : [{}];
      nextBase[rowIndex] = { ...nextBase[rowIndex], [colName]: v };
      onDraftChange(setDraftListRows(draft, moduleKey, subKey, nextBase));
    },
    [draft, moduleKey, subKey, onDraftChange],
  );

  const addListRow = useCallback(() => {
    const base = getListRows(draft, moduleKey, subKey);
    const current = base && base.length > 0 ? base : [{}];
    if (current.length >= maxRows) return;
    onDraftChange(setDraftListRows(draft, moduleKey, subKey, [...current, {}]));
  }, [draft, moduleKey, subKey, maxRows, onDraftChange]);

  const removeListRow = useCallback(
    (idx: number) => {
      const base = getListRows(draft, moduleKey, subKey) ?? [{}];
      if (base.length <= 1) return;
      onDraftChange(setDraftListRows(draft, moduleKey, subKey, base.filter((_, i) => i !== idx)));
    },
    [draft, moduleKey, subKey, onDraftChange],
  );

  const dataSourceReadonly: Record<string, unknown>[] = [];
  const dataSourceFill = listRows.map((row, i) => ({ ...row, key: i, __rowIndex: i }));

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

  return (
    <Card size="small" className="declCfgRenderSubCard" title={title || "子模块（列表）"}>
      {helpText ? <span className="declCfgRenderHelp">{helpText}</span> : null}
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
                          width: 72,
                          fixed: "right" as const,
                          render: (_: unknown, record: Record<string, unknown>) => (
                            <Button
                              type="link"
                              danger
                              size="small"
                              disabled={listRows.length <= 1}
                              onClick={() => removeListRow(Number(record.__rowIndex))}
                            >
                              删除
                            </Button>
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
    </Card>
  );
}

function SubModuleBlock({
  sub,
  si,
  interactive,
  rowKeyPrefix,
  moduleKey,
  draft,
  onDraftChange,
}: {
  sub: RawSubModule;
  si: number;
  interactive: boolean;
  rowKeyPrefix: string;
  moduleKey: string;
  draft: DeclarationDraftShape;
  onDraftChange: (next: DeclarationDraftShape) => void;
}) {
  const subKey = typeof sub.key === "string" ? sub.key : `sub_${si}`;
  const type = sub.type === "list" ? "list" : "map";
  if (type === "map") {
    return (
      <SubModuleMapBlock
        sub={sub}
        interactive={interactive}
        rowKeyPrefix={rowKeyPrefix}
        moduleKey={moduleKey}
        subKey={subKey}
        draft={draft}
        onDraftChange={onDraftChange}
      />
    );
  }
  return (
    <SubModuleListBlock
      sub={sub}
      interactive={interactive}
      moduleKey={moduleKey}
      subKey={subKey}
      draft={draft}
      onDraftChange={onDraftChange}
    />
  );
}

function ModuleSectionContent({
  mod,
  mi,
  interactive,
  draft,
  onDraftChange,
}: {
  mod: RawModule;
  mi: number;
  interactive: boolean;
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
          rowKeyPrefix={`${key}-${si}`}
          moduleKey={key}
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
}: DeclarationConfigRendererProps) {
  const interactive = variant === "fill";
  const [internalDraft, setInternalDraft] = useState<DeclarationDraftShape>(() =>
    emptyDeclarationDraft(),
  );
  const controlled = typeof onDraftChange === "function";
  const draft = normalizeDeclarationDraft(
    controlled ? (draftProp ?? emptyDeclarationDraft()) : internalDraft,
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
    <div className="declCfgRender">
      {hint ? <div className="declCfgRenderHint">{hint}</div> : null}
      {leadingTab != null ? (
        <Card size="small" className="declCfgRenderModule" title={leadingTab.label}>
          {leadingTab.children}
        </Card>
      ) : null}
      {modules.map((mod, mi) => {
        const key = typeof mod.key === "string" ? mod.key : `module_${mi}`;
        const title = typeof mod.title === "string" ? mod.title : key;
        return (
          <Card key={key} size="small" className="declCfgRenderModule" title={title}>
            <ModuleSectionContent
              mod={mod}
              mi={mi}
              interactive={interactive}
              draft={draft}
              onDraftChange={commitDraft}
            />
          </Card>
        );
      })}
    </div>
  );
}
