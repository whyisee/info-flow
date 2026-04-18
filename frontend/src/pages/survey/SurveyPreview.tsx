import {
  Button,
  Card,
  Cascader,
  Checkbox,
  DatePicker,
  Divider,
  Input,
  InputNumber,
  message,
  Radio,
  Rate,
  Select,
  Slider,
  Space,
  Switch,
  TreeSelect,
  Typography,
  Upload,
} from "antd";
import { PlusOutlined, DeleteOutlined, InboxOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useState } from "react";
import type { FieldDef, FormNode } from "../../features/form-designer/types";
import { uploadSurveyFile } from "../../services/surveyResponses";

type PreviewValue = Record<string, unknown>;

function safeParse<T>(raw: string | undefined, fallback: T): T {
  try {
    if (!raw || !raw.trim()) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function getChildren(node: FormNode): FormNode[] {
  return "children" in node && Array.isArray((node as any).children)
    ? (node as any).children
    : [];
}

function resolveFieldDef(node: FormNode, fields: Record<string, FieldDef>): FieldDef | null {
  const name = (node as any).name as string;
  if (!name) return null;
  if (fields[name]) return fields[name];
  const ft = (node as any).fieldType as string;
  if (ft) {
    return {
      name,
      label: (node as any).title || (node as any).name || "",
      type: ft as any,
    };
  }
  return null;
}

function QuestionCard({
  index,
  showIndex,
  children,
}: {
  index: number;
  showIndex: boolean;
  children: React.ReactNode;
}) {
  if (!showIndex) {
    return (
      <Card
        size="small"
        style={{
          marginBottom: 12,
          borderRadius: 10,
          border: "1px solid #e5e7eb",
        }}
        bodyStyle={{ padding: "16px 20px" }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      </Card>
    );
  }
  return (
    <Card
      size="small"
      style={{
        marginBottom: 12,
        borderRadius: 10,
        border: "1px solid #e5e7eb",
      }}
      bodyStyle={{ padding: "16px 20px" }}
    >
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div
          style={{
            minWidth: 28,
            height: 28,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            marginTop: 2,
          }}
        >
          {index}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      </div>
    </Card>
  );
}

function renderField(
  node: FormNode,
  fd: FieldDef | null,
  values: PreviewValue,
  onChange: (name: string, val: unknown) => void,
  readOnly: boolean,
  templateId?: number,
  version?: number,
) {
  const name = (node as any).name as string;
  const label = fd?.label ?? (node as any).title ?? name ?? "";
  const value = values[name];
  const required = fd?.rules?.required;
  const description = fd?.description;
  const fieldType = fd?.type ?? (node as any).fieldType ?? "input";

  const labelEl = (
    <div style={{ marginBottom: 10 }}>
      <Space size={4} align="start" style={{ flexWrap: "nowrap" }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: "#111827", lineHeight: "22px", whiteSpace: "nowrap" }}>
          {label}
        </span>
        {required && <span style={{ color: "#ef4444", fontSize: 15, lineHeight: "22px" }}>*</span>}
      </Space>
      {description && (
        <div style={{ fontSize: 13, color: "#6b7280", marginTop: 3, lineHeight: "18px" }}>
          {description}
        </div>
      )}
    </div>
  );

  switch (fieldType) {
    case "radio":
      return (
        <>
          {labelEl}
          <Radio.Group value={value} onChange={(e) => onChange(name, e.target.value)} style={{ width: "100%" }}>
            {(fd?.options ?? []).map((o) => (
              <Radio key={o.value} value={o.value} style={{ fontSize: 14, marginRight: 16 }}>
                {o.label}
              </Radio>
            ))}
          </Radio.Group>
        </>
      );

    case "checkbox": {
      const checkedValues: string[] = Array.isArray(value) ? value : [];
      return (
        <>
          {labelEl}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "8px 24px",
            }}
          >
            {(fd?.options ?? []).map((o) => (
              <Checkbox
                key={o.value}
                checked={checkedValues.includes(o.value)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...checkedValues, o.value]
                    : checkedValues.filter((v) => v !== o.value);
                  onChange(name, next);
                }}
                style={{ fontSize: 14 }}
              >
                {o.label}
              </Checkbox>
            ))}
          </div>
        </>
      );
    }

    case "input":
      return (
        <>
          {labelEl}
          <Input
            size="large"
            value={(value as string) ?? ""}
            onChange={(e) => onChange(name, e.target.value)}
            placeholder="请输入"
            style={{ width: "100%" }}
          />
        </>
      );

    case "textarea":
      return (
        <>
          {labelEl}
          <Input.TextArea
            size="large"
            value={(value as string) ?? ""}
            onChange={(e) => onChange(name, e.target.value)}
            rows={3}
            placeholder="请输入"
            style={{ width: "100%" }}
          />
        </>
      );

    case "select":
      return (
        <>
          {labelEl}
          <Select
            size="large"
            value={value as string}
            onChange={(v) => onChange(name, v)}
            options={fd?.options ?? []}
            placeholder="请选择"
            style={{ width: "100%" }}
          />
        </>
      );

    case "date":
      return (
        <>
          {labelEl}
          <DatePicker
            size="large"
            value={value ? dayjs(value as string) : undefined}
            onChange={(_, ds) => onChange(name, ds)}
            style={{ width: 240 }}
          />
        </>
      );

    case "datetime":
      return (
        <>
          {labelEl}
          <DatePicker showTime size="large" value={value ? dayjs(value as string) : undefined} onChange={(_, ds) => onChange(name, ds)} style={{ width: 280 }} />
        </>
      );

    case "switch":
      return (
        <>
          {labelEl}
          <Space>
            <Switch checked={!!value} onChange={(v) => onChange(name, v)} checkedChildren="是" unCheckedChildren="否" />
          </Space>
        </>
      );

    case "rating":
      return (
        <>
          {labelEl}
          <Rate value={(value as number) ?? 0} onChange={(v) => onChange(name, v)} count={fd?.count ?? 5} style={{ fontSize: 24 }} />
        </>
      );

    case "number":
      return (
        <>
          {labelEl}
          <InputNumber size="large" value={value as number} onChange={(v) => onChange(name, v)} style={{ width: "100%" }} />
        </>
      );

    case "phone":
      return (
        <>
          {labelEl}
          <Input size="large" value={(value as string) ?? ""} onChange={(e) => onChange(name, e.target.value)} placeholder="请输入手机号" style={{ width: "100%" }} />
        </>
      );

    case "email":
      return (
        <>
          {labelEl}
          <Input size="large" value={(value as string) ?? ""} onChange={(e) => onChange(name, e.target.value)} placeholder="请输入邮箱" style={{ width: "100%" }} />
        </>
      );

    case "attachment":
    case "image": {
      const accept = fd?.attachment?.accept;
      const maxSize = fd?.attachment?.maxSize;
      const maxCount = fd?.attachment?.maxCount ?? 5;
      // value = [{ fileName, filePath }] 或 undefined
      const currentFiles = (Array.isArray(value) ? value : []) as { fileName: string; filePath: string }[];
      const fileList = currentFiles.map((f: { fileName: string; filePath: string }, i: number) => ({
        uid: String(i),
        name: f.fileName,
        status: "done" as const,
      }));
      return (
        <>
          {labelEl}
          <Upload.Dragger
            accept={accept || undefined}
            fileList={fileList}
            multiple={true}
            disabled={readOnly}
            beforeUpload={(file) => {
              if (maxSize && file.size > maxSize * 1024 * 1024) { message.error(`文件大小不能超过 ${maxSize}MB`); return Upload.LIST_IGNORE; }
              return true;
            }}
            customRequest={async (options) => {
              const { file, onError, onSuccess } = options;
              if (!templateId || !version) {
                message.error("问卷信息缺失");
                onError?.(new Error("missing templateId/version"));
                return;
              }
              try {
                const info = await uploadSurveyFile(templateId, version, name, file as File);
                const prev = (Array.isArray(values[name]) ? values[name] : []) as { fileName: string; filePath: string }[];
                onChange(name, [...prev, { fileName: info.file_name, filePath: info.file_path }]);
                onSuccess?.({ url: info.file_path }, file as File);
              } catch (e) {
                message.error("上传失败，请重试");
                onError?.(e as Error);
              }
            }}
            onRemove={() => {
              if (readOnly) return;
              onChange(name, []);
            }}
          >
            <p style={{ fontSize: 40, color: "#d1d5db", marginBottom: 8 }}>
              <InboxOutlined />
            </p>
            <p style={{ fontSize: 14, color: "#374151", margin: 0 }}>点击或拖拽上传文件</p>
            {accept && <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>支持：{accept}</p>}
          </Upload.Dragger>
        </>
      );
    }

    case "list": {
      const rows: string[] = Array.isArray(value) ? value : [""];
      const maxRows = fd?.list?.maxRows ?? 10;
      return (
        <>
          {labelEl}
          <Space direction="vertical" size={8} style={{ width: "100%" }}>
            {rows.map((_, i) => (
              <Space key={i} size={8} style={{ width: "100%" }}>
                <span style={{ color: "#9ca3af", fontSize: 13, minWidth: 20 }}>{i + 1}.</span>
                <Input
                  size="large"
                  value={rows[i]}
                  onChange={(e) => {
                    const next = [...rows];
                    next[i] = e.target.value;
                    onChange(name, next);
                  }}
                  placeholder={`第 ${i + 1} 项`}
                  style={{ flex: 1 }}
                />
                {rows.length > 1 && (
                  <Button danger size="middle" icon={<DeleteOutlined />} onClick={() => onChange(name, rows.filter((_, j) => j !== i))} />
                )}
              </Space>
            ))}
            {rows.length < maxRows && (
              <Button type="dashed" size="large" icon={<PlusOutlined />} onClick={() => onChange(name, [...rows, ""])} block>
                添加一行
              </Button>
            )}
          </Space>
        </>
      );
    }

    case "cascader":
      return (
        <>
          {labelEl}
          <Cascader onChange={(v) => onChange(name, v)} options={[]} placeholder="请选择" style={{ width: "100%" }} />
        </>
      );

    case "treeSelect":
      return (
        <>
          {labelEl}
          <TreeSelect onChange={(v) => onChange(name, v)} treeData={[]} placeholder="请选择" style={{ width: "100%" }} />
        </>
      );

    default:
      return (
        <>
          {labelEl}
          <Input size="large" value={(value as string) ?? ""} onChange={(e) => onChange(name, e.target.value)} placeholder="请输入" style={{ width: "100%" }} />
        </>
      );
  }
}

function renderNode(
  node: FormNode,
  fields: Record<string, FieldDef>,
  values: PreviewValue,
  onChange: (name: string, val: unknown) => void,
  indexMap: Map<string, number>,
  readOnly: boolean,
  showIndex: boolean,
  templateId?: number,
  version?: number,
): React.ReactNode {
  if (node.kind === "Field") {
    const fd = resolveFieldDef(node, fields);
    const idx = indexMap.get(node.id);
    return (
      <QuestionCard key={node.id} index={idx ?? 0} showIndex={showIndex}>
        {renderField(node, fd, values, onChange, readOnly, templateId, version)}
      </QuestionCard>
    );
  }

  const children = getChildren(node);
  if (children.length === 0) return null;

  return (
    <div key={node.id} style={{ marginBottom: children.length > 0 ? 20 : 0 }}>
      {node.kind === "Group" && (node as any).title && (
        <>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "#374151",
              marginBottom: 10,
              paddingBottom: 6,
              borderBottom: "1px solid #d1d5db",
            }}
          >
            {(node as any).title}
          </div>
          {children.map((child) => renderNode(child, fields, values, onChange, indexMap, readOnly, showIndex))}
        </>
      )}
      {node.kind === "Divider" && <Divider style={{ margin: "12px 0" }} />}
      {node.kind === "Text" && (
        <div style={{ color: "#6b7280", fontSize: 13, marginBottom: 12, fontStyle: "italic" }}>
          {(node as any).text}
        </div>
      )}
    </div>
  );
}

function buildIndexMap(schema: FormNode): Map<string, number> {
  const map = new Map<string, number>();
  let counter = 1;
  function walk(n: FormNode) {
    if (n.kind === "Field") map.set(n.id, counter++);
    const children = "children" in n && Array.isArray((n as any).children) ? (n as any).children : [];
    children.forEach(walk);
  }
  walk(schema);
  return map;
}

export function SurveyPreview({
  schemaJson,
  fieldsJson,
  title,
  description,
  onSubmit,
  submitting = false,
  templateId,
  version,
  readOnly = false,
  showIndex = true,
}: {
  schemaJson?: string;
  fieldsJson?: string;
  title?: string;
  description?: string;
  onSubmit?: (answers: PreviewValue) => void;
  submitting?: boolean;
  templateId?: number;
  version?: number;
  readOnly?: boolean;
  /** 是否显示题目序号，默认 true（填写页）；嵌入申报页面时传 false */
  showIndex?: boolean;
}) {
  const schema: FormNode = safeParse(schemaJson, { id: "root", kind: "Group", children: [] });
  const fields: Record<string, FieldDef> = safeParse(fieldsJson, {});
  const [values, setValues] = useState<PreviewValue>({});
  const indexMap = buildIndexMap(schema);

  const onChange = (name: string, val: unknown) => {
    setValues((prev) => ({ ...prev, [name]: val }));
  };

  const children = getChildren(schema);

  if (children.length === 0 && !title) {
    return (
      <div style={{ textAlign: "center", padding: "60px 0", color: "#9ca3af", fontSize: 15 }}>
        问卷暂无题目
      </div>
    );
  }

  return (
    <div>
      {/* 问卷页头 */}
      {(title || description) && (
        <div style={{ textAlign: "center", marginBottom: 32, paddingBottom: 24, borderBottom: "2px solid #e5e7eb" }}>
          {title && (
            <Typography.Title level={3} style={{ margin: "0 0 10px", fontWeight: 700, color: "#111827", letterSpacing: "0.02em" }}>
              {title}
            </Typography.Title>
          )}
          {description && (
            <Typography.Text type="secondary" style={{ fontSize: 14, lineHeight: "20px" }}>
              {description}
            </Typography.Text>
          )}
        </div>
      )}

      {/* 题目列表 */}
      <div>
        {children.length > 0 ? (
          children.map((child) => renderNode(child, fields, values, onChange, indexMap, readOnly, showIndex, templateId, version))
        ) : (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#9ca3af" }}>问卷暂无题目</div>
        )}
      </div>

      {/* 提交按钮 */}
      {onSubmit && !readOnly && (
        <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid #e5e7eb", textAlign: "center" }}>
          <Button type="primary" size="large" loading={submitting} onClick={() => onSubmit(values)} style={{ minWidth: 160 }}>
            提交
          </Button>
        </div>
      )}
    </div>
  );
}
