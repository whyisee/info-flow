import {
  Button,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
  Typography,
} from "antd";
import { useState } from "react";
import {
  DeleteOutlined,
  DownOutlined,
  PlusOutlined,
  UpOutlined,
} from "@ant-design/icons";
import type { FieldDef, FormNode } from "../../../features/form-designer/types";
import { findNode, updateNode } from "./schemaOps";

const FIELD_TYPE_OPTIONS = [
  { value: "radio", label: "单选题" },
  { value: "checkbox", label: "多选题" },
  { value: "input", label: "单行文本" },
  { value: "textarea", label: "多行文本" },
  { value: "select", label: "下拉选择" },
  { value: "date", label: "日期" },
  { value: "switch", label: "是否" },
  { value: "rating", label: "评分" },
  { value: "attachment", label: "附件上传" },
  { value: "list", label: "列表" },
];

export function FormDesignerInspector({
  schema,
  selectedId,
  fields,
  onSchemaChange,
  onFieldsChange,
}: {
  schema: FormNode;
  selectedId: string | null;
  fields: Record<string, FieldDef>;
  onSchemaChange: (next: FormNode) => void;
  onFieldsChange: (next: Record<string, FieldDef>) => void;
}) {
  const node = selectedId ? findNode(schema, selectedId) : null;
  const isField = node?.kind === "Field";
  const [collapsed, setCollapsed] = useState(false);

  // 从 fields 中获取字段定义
  const fieldDef =
    isField && node ? (fields[(node as any).name] ?? null) : null;

  const applyNodePatch = (patch: Record<string, unknown>) => {
    if (!node) return;
    onSchemaChange(updateNode(schema, node.id, patch));
  };

  if (!node) {
    return (
      <div
        style={{
          position: "fixed",
          top: 70,
          right: 16,
          width: 260,
          background: "#fff",
          border: "1px solid #e8e8e8",
          borderRadius: 8,
          padding: "16px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          zIndex: 200,
        }}
      >
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          点击画布中的题目以编辑属性
        </Typography.Text>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 70,
        right: 16,
        width: 280,
        background: "#fff",
        border: "1px solid #e8e8e8",
        borderRadius: 8,
        padding: 0,
        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
        zIndex: 200,
        overflow: "hidden",
      }}
    >
      {/* 头部 */}
      <div
        style={{
          padding: "10px 14px",
          background: "#fafafa",
          borderBottom: "1px solid #f0f0f0",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <Typography.Text strong style={{ fontSize: 13 }}>
            题目属性
          </Typography.Text>
          <Typography.Text
            type="secondary"
            style={{ fontSize: 11, marginLeft: 8 }}
          >
            {isField ? (node as any).fieldType || "字段" : node.kind}
          </Typography.Text>
        </div>
        <Button
          size="small"
          type="text"
          icon={collapsed ? <DownOutlined /> : <UpOutlined />}
          onClick={() => setCollapsed((c) => !c)}
        />
      </div>

      {!collapsed ? (
        <div
          style={{
            padding: "12px 14px",
            maxHeight: "calc(100vh - 90px)",
            overflow: "auto",
          }}
        >
          {isField ? (
            <Space direction="vertical" size={10} style={{ width: "100%" }}>
              {/* 题目标题 */}
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  题目标题
                </Typography.Text>
                <Input
                  size="small"
                  value={(node as any).title || ""}
                  onChange={(e) => applyNodePatch({ title: e.target.value })}
                  placeholder="请输入题目标题"
                />
              </div>

              {/* 题型 */}
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  题型
                </Typography.Text>
                <Select
                  size="small"
                  style={{ width: "100%" }}
                  value={(node as any).fieldType || "input"}
                  options={FIELD_TYPE_OPTIONS}
                  onChange={(v) => applyNodePatch({ fieldType: v })}
                />
              </div>

              {/* 字段名（技术标识） */}
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  字段名（技术标识）
                </Typography.Text>
                <Input
                  size="small"
                  value={(node as any).name || ""}
                  onChange={(e) => applyNodePatch({ name: e.target.value })}
                  placeholder="fieldName"
                />
              </div>

              {/* label */}
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  表单标签
                </Typography.Text>
                <Input
                  size="small"
                  value={fieldDef?.label ?? ""}
                  onChange={(e) => {
                    const next = { ...fields };
                    const name = (node as any).name;
                    const base = fieldDef ?? {
                      name,
                      label: "",
                      type: (node as any).fieldType || "input",
                    };
                    next[name] = { ...base, label: e.target.value, name };
                    onFieldsChange(next);
                  }}
                  placeholder="表单中显示的标签"
                />
              </div>

              {/* 说明/提示文字 */}
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  说明（选填）
                </Typography.Text>
                <Input.TextArea
                  size="small"
                  rows={2}
                  value={fieldDef?.description ?? ""}
                  onChange={(e) => {
                    const next = { ...fields };
                    const name = (node as any).name;
                    const base = fieldDef ?? {
                      name,
                      label: (node as any).title || "",
                      type: (node as any).fieldType || "input",
                    };
                    next[name] = { ...base, description: e.target.value, name };
                    onFieldsChange(next);
                  }}
                  placeholder="补充说明或填写提示"
                />
              </div>

              {/* 选项（单选/多选/下拉） */}
              {((node as any).fieldType === "radio" ||
                (node as any).fieldType === "checkbox" ||
                (node as any).fieldType === "select") && (
                <div>
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    选项
                  </Typography.Text>
                  <Space
                    direction="vertical"
                    size={4}
                    style={{ width: "100%" }}
                  >
                    {(fieldDef?.options ?? []).map((opt, i) => (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          gap: 6,
                          alignItems: "center",
                        }}
                      >
                        <Input
                          size="small"
                          style={{ flex: 1 }}
                          value={opt.label}
                          placeholder="显示文字"
                          onChange={(e) => {
                            const next = { ...fields };
                            const name = (node as any).name;
                            const base = fieldDef ?? {
                              name,
                              label: (node as any).title || "",
                              type: (node as any).fieldType,
                            };
                            const newOptions = [...(base.options ?? [])];
                            newOptions[i] = {
                              ...newOptions[i],
                              label: e.target.value,
                              value: newOptions[i]?.value ?? e.target.value,
                            };
                            next[name] = { ...base, options: newOptions, name };
                            onFieldsChange(next);
                          }}
                        />
                        <Input
                          size="small"
                          style={{ width: 70 }}
                          value={opt.value}
                          placeholder="值"
                          onChange={(e) => {
                            const next = { ...fields };
                            const name = (node as any).name;
                            const base = fieldDef ?? {
                              name,
                              label: (node as any).title || "",
                              type: (node as any).fieldType,
                            };
                            const newOptions = [...(base.options ?? [])];
                            newOptions[i] = {
                              ...newOptions[i],
                              value: e.target.value,
                              label: newOptions[i]?.label ?? e.target.value,
                            };
                            next[name] = { ...base, options: newOptions, name };
                            onFieldsChange(next);
                          }}
                        />
                        <Button
                          size="small"
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => {
                            const next = { ...fields };
                            const name = (node as any).name;
                            const base = fieldDef ?? {
                              name,
                              label: (node as any).title || "",
                              type: (node as any).fieldType,
                            };
                            const newOptions = (base.options ?? []).filter(
                              (_, j) => j !== i,
                            );
                            next[name] = { ...base, options: newOptions, name };
                            onFieldsChange(next);
                          }}
                        />
                      </div>
                    ))}
                    <Button
                      size="small"
                      type="dashed"
                      icon={<PlusOutlined />}
                      onClick={() => {
                        const next = { ...fields };
                        const name = (node as any).name;
                        const base = fieldDef ?? {
                          name,
                          label: (node as any).title || "",
                          type: (node as any).fieldType,
                        };
                        const newOptions = [
                          ...(base.options ?? []),
                          {
                            label: `选项${(base.options?.length ?? 0) + 1}`,
                            value: String((base.options?.length ?? 0) + 1),
                          },
                        ];
                        next[name] = { ...base, options: newOptions, name };
                        onFieldsChange(next);
                      }}
                      block
                    >
                      添加选项
                    </Button>
                  </Space>
                </div>
              )}

              {/* 附件类型配置 */}
              {(node as any).fieldType === "attachment" && (
                <div>
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    附件配置
                  </Typography.Text>
                  <Space
                    direction="vertical"
                    size={6}
                    style={{ width: "100%" }}
                  >
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <Typography.Text style={{ fontSize: 11, width: 40 }}>
                        类型
                      </Typography.Text>
                      <Input
                        size="small"
                        placeholder="如：.pdf,.docx,.jpg"
                        value={fieldDef?.attachment?.accept ?? ""}
                        onChange={(e) => {
                          const next = { ...fields };
                          const name = (node as any).name;
                          const base = fieldDef ?? {
                            name,
                            label: (node as any).title || "",
                            type: "attachment",
                          };
                          next[name] = {
                            ...base,
                            attachment: {
                              ...base.attachment,
                              accept: e.target.value,
                            },
                            name,
                          };
                          onFieldsChange(next);
                        }}
                      />
                    </div>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <Typography.Text style={{ fontSize: 11, width: 40 }}>
                        大小(M)
                      </Typography.Text>
                      <InputNumber
                        size="small"
                        min={1}
                        placeholder="最大 MB"
                        value={fieldDef?.attachment?.maxSize ?? 10}
                        onChange={(v) => {
                          const next = { ...fields };
                          const name = (node as any).name;
                          const base = fieldDef ?? {
                            name,
                            label: (node as any).title || "",
                            type: "attachment",
                          };
                          next[name] = {
                            ...base,
                            attachment: {
                              ...base.attachment,
                              maxSize: v ?? 10,
                            },
                            name,
                          };
                          onFieldsChange(next);
                        }}
                        style={{ width: "100%" }}
                      />
                    </div>
                  </Space>
                </div>
              )}

              {/* 列表类型配置 */}
              {(node as any).fieldType === "list" && (
                <div>
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    列表配置
                  </Typography.Text>
                  <Space
                    direction="vertical"
                    size={6}
                    style={{ width: "100%" }}
                  >
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <Typography.Text style={{ fontSize: 11, width: 50 }}>
                        最大行数
                      </Typography.Text>
                      <InputNumber
                        size="small"
                        min={1}
                        max={20}
                        value={fieldDef?.list?.maxRows ?? 10}
                        onChange={(v) => {
                          const next = { ...fields };
                          const name = (node as any).name;
                          const base = fieldDef ?? {
                            name,
                            label: (node as any).title || "",
                            type: "list",
                          };
                          next[name] = {
                            ...base,
                            list: { ...base.list, maxRows: v ?? 10 },
                            name,
                          };
                          onFieldsChange(next);
                        }}
                        style={{ width: "100%" }}
                      />
                    </div>
                    <Typography.Text type="secondary" style={{ fontSize: 10 }}>
                      每行显示一个文本输入框，可填写多行
                    </Typography.Text>
                  </Space>
                </div>
              )}

              {/* 必填 */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  必填
                </Typography.Text>
                <Switch
                  size="small"
                  checked={fieldDef?.rules?.required === true}
                  onChange={(checked) => {
                    const next = { ...fields };
                    const name = (node as any).name;
                    const base = fieldDef ?? {
                      name,
                      label: (node as any).title || "",
                      type: (node as any).fieldType || "input",
                    };
                    next[name] = {
                      ...base,
                      rules: { ...(base.rules ?? {}), required: checked },
                      name,
                    };
                    onFieldsChange(next);
                  }}
                />
              </div>
            </Space>
          ) : (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {node.kind === "Group"
                ? "分组容器"
                : node.kind === "Text"
                  ? "说明文本"
                  : `节点类型：${node.kind}`}
            </Typography.Text>
          )}
        </div>
      ) : null}
    </div>
  );
}
