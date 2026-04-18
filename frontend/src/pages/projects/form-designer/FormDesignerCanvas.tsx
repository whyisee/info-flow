import {
  CheckSquareOutlined,
  DeleteOutlined,
  DragOutlined,
  FieldBinaryOutlined,
  FileTextOutlined,
  MinusOutlined,
  StarOutlined,
} from "@ant-design/icons";
import { Button, Checkbox, DatePicker, Input, Radio, Rate, Select, Space, Switch, Typography, Upload } from "antd";
import { useState } from "react";
import type { FieldDef, FormNode } from "../../../features/form-designer/types";
import { insertNode, moveNode, removeNode } from "./schemaOps";
import "./FormDesignerCanvas.css";

type DragPayload = { kind: "palette"; node: FormNode } | { kind: "move"; nodeId: string };
const DND_MIME = "application/x-form-designer";
const GLOBAL_KEY = "__fd_dnd_payload__";

function decodePayload(raw: string): DragPayload | null {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

const FIELD_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  radio: { label: "单选题", icon: <StarOutlined />, color: "#1677ff" },
  checkbox: { label: "多选题", icon: <CheckSquareOutlined />, color: "#52c41a" },
  input: { label: "单行文本", icon: <FileTextOutlined />, color: "#595959" },
  textarea: { label: "多行文本", icon: <FieldBinaryOutlined />, color: "#595959" },
  select: { label: "下拉", icon: <FileTextOutlined />, color: "#722ed1" },
  date: { label: "日期", icon: <FileTextOutlined />, color: "#fa8c16" },
  switch: { label: "是否", icon: <MinusOutlined />, color: "#8c8c8c" },
  rating: { label: "评分", icon: <StarOutlined />, color: "#fa541c" },
};

export function FormDesignerCanvas({
  schema,
  selectedId,
  onSelect,
  onSchemaChange,
  fields,
  readOnly = false,
}: {
  schema: FormNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSchemaChange: (next: FormNode) => void;
  fields?: Record<string, FieldDef>;
  readOnly?: boolean;
}) {
  const [overTarget, setOverTarget] = useState<string | null>(null);

  // schema.children 是所有题目的一维列表
  const children: FormNode[] = ("children" in schema && Array.isArray(schema.children)) ? schema.children : [];

  const doDrop = (targetId: string, pos: "before" | "after", raw: string) => {
    const payload = decodePayload(raw);
    if (!payload) return;
    if (payload.kind === "palette") {
      onSchemaChange(insertNode(schema, targetId, pos, payload.node));
      onSelect(payload.node.id);
    } else if (payload.kind === "move") {
      onSchemaChange(moveNode(schema, payload.nodeId, targetId, pos));
    }
    setOverTarget(null);
  };

  const handleDrop = (targetId: string, pos: "before" | "after") => (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const raw = e.dataTransfer.getData(DND_MIME) || ((window as any)[GLOBAL_KEY] as string) || "";
    doDrop(targetId, pos, raw);
  };

  const handleDragOver = (targetId: string, pos: "before" | "after") => (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOverTarget(`${targetId}:${pos}`);
  };

  const handleDragLeave = (targetId: string, pos: "before" | "after") => () => {
    setOverTarget((p) => p === `${targetId}:${pos}` ? null : p);
  };

  const nodeLabel = (node: FormNode) => {
    const fieldType = (node as any).fieldType as string | undefined;
    const title = (node as any).title as string | undefined;
    if (title) return title;
    if (fieldType) return FIELD_META[fieldType]?.label || fieldType;
    return node.name || "未命名";
  };

  const nodeIcon = (node: FormNode) => {
    const fieldType = (node as any).fieldType as string | undefined;
    return fieldType ? FIELD_META[fieldType]?.icon : <FileTextOutlined />;
  };

  const nodeColor = (node: FormNode) => {
    const fieldType = (node as any).fieldType as string | undefined;
    return fieldType ? FIELD_META[fieldType]?.color : "#595959";
  };

  const nodeTypeLabel = (node: FormNode) => {
    const fieldType = (node as any).fieldType as string | undefined;
    return fieldType ? FIELD_META[fieldType]?.label : null;
  };

  const getFieldDef = (node: FormNode): FieldDef | null => {
    const name = (node as any).name as string | undefined;
    if (!name || !fields) return null;
    return fields[name] ?? null;
  };

  const nodePreview = (node: FormNode) => {
    const fieldType = (node as any).fieldType as string | undefined;
    const fd = getFieldDef(node);
    const opts = fd?.options ?? [];
    const previewStyle: React.CSSProperties = { marginTop: 6, marginLeft: 30 };

    switch (fieldType) {
      case "radio":
        return (
          <div style={previewStyle}>
            <Radio.Group value={opts[0]?.value}>
              {opts.map((o) => (
                <Radio key={o.value} value={o.value} style={{ fontSize: 13 }}>{o.label}</Radio>
              ))}
            </Radio.Group>
          </div>
        );
      case "checkbox":
        return (
          <div style={previewStyle}>
            <Checkbox.Group value={[]} options={opts} />
          </div>
        );
      case "input":
        return (
          <div style={{ ...previewStyle, paddingRight: 16 }}>
            <Input placeholder="单行文本输入" size="small" readOnly />
          </div>
        );
      case "textarea":
        return (
          <div style={{ ...previewStyle, paddingRight: 16 }}>
            <Input.TextArea placeholder="多行文本输入" size="small" readOnly rows={2} />
          </div>
        );
      case "select":
        return (
          <div style={{ ...previewStyle, width: 160 }}>
            <Select placeholder="请选择" size="small" disabled options={opts} style={{ width: "100%" }} />
          </div>
        );
      case "date":
        return (
          <div style={{ ...previewStyle, width: 160 }}>
            <DatePicker size="small" disabled style={{ width: "100%" }} />
          </div>
        );
      case "switch":
        return (
          <div style={{ ...previewStyle }}>
            <Space size={12}>
              <Switch size="small" />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>是 / 否</Typography.Text>
            </Space>
          </div>
        );
      case "rating":
        return (
          <div style={previewStyle}>
            <Rate disabled value={0} count={5} />
          </div>
        );
      case "attachment":
        return (
          <div style={{ ...previewStyle, paddingRight: 16 }}>
            <Upload.Dragger disabled showUploadList={false} style={{ background: "#fafafa" }}>
              <p style={{ fontSize: 12, color: "#8c8c8c", margin: 0 }}>点击或拖拽上传文件</p>
            </Upload.Dragger>
          </div>
        );
      case "list":
        return (
          <div style={{ ...previewStyle, paddingRight: 16 }}>
            <div style={{ border: "1px dashed #d9d9d9", borderRadius: 6, padding: "8px 12px" }}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                第 1 行（可添加多行）
              </Typography.Text>
              <Input placeholder="请输入" size="small" readOnly style={{ marginTop: 4 }} />
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div
      className="fdCanvas"
      onClick={(e) => { if (readOnly) return; e.stopPropagation(); onSelect(schema.id); }}
      onDragOver={(e) => { if (readOnly) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
      onDrop={(e) => {
        if (readOnly) return;
        e.preventDefault();
        const raw = e.dataTransfer.getData(DND_MIME) || ((window as any)[GLOBAL_KEY] as string) || "";
        const payload = decodePayload(raw);
        if (!payload) return;
        if (payload.kind === "palette") {
          onSchemaChange(insertNode(schema, schema.id, "inside", payload.node));
          onSelect(payload.node.id);
        } else if (payload.kind === "move") {
          onSchemaChange(moveNode(schema, payload.nodeId, schema.id, "inside"));
        }
        setOverTarget(null);
      }}
    >
      {/* 题目列表：每道题之前都有放置线 */}
      {children.length === 0 && (
        <div
          className={`fdDropLine ${overTarget === `${schema.id}:after` ? "fdDropLineActive" : ""}`}
          style={{ height: 48 }}
          onDragOver={handleDragOver(schema.id, "after")}
          onDragLeave={handleDragLeave(schema.id, "after")}
          onDrop={handleDrop(schema.id, "after")}
        />
      )}

      {children.map((child) => (
        <div key={child.id}>
          {/* 放置线：插入到此题之前 */}
          <div
            className={`fdDropLine ${overTarget === `${child.id}:before` ? "fdDropLineActive" : ""}`}
            onDragOver={handleDragOver(child.id, "before")}
            onDragLeave={handleDragLeave(child.id, "before")}
            onDrop={handleDrop(child.id, "before")}
          />

          {/* 题目节点 */}
          <div
            className={`fdNode ${selectedId === child.id ? "fdNodeSelected" : ""}`}
            style={{
              background: selectedId === child.id ? "#f0f7ff" : "#fff",
              borderColor: selectedId === child.id ? "#1677ff" : "#e4e9f0",
            }}
            draggable={!readOnly}
            onDragStart={(e) => {
              if (readOnly) return;
              const p = JSON.stringify({ kind: "move", nodeId: child.id });
              (window as any)[GLOBAL_KEY] = p;
              e.dataTransfer.setData(DND_MIME, p);
              e.dataTransfer.setData("text/plain", p);
            }}
            onDragEnd={() => { try { delete (window as any)[GLOBAL_KEY]; } catch { (window as any)[GLOBAL_KEY] = undefined; } setOverTarget(null); }}
            onClick={(e) => { if (readOnly) return; e.stopPropagation(); onSelect(child.id); }}
          >
            <div className="fdNodeHeader">
              <Space size={8}>
                <DragOutlined style={{ color: "#bfbfbf", fontSize: 13, cursor: readOnly ? "default" : "grab" }} />
                <span style={{ color: nodeColor(child), fontSize: 16 }}>{nodeIcon(child)}</span>
                <span style={{ fontSize: 14, fontWeight: 500, color: "#1a1a1a" }}>{nodeLabel(child)}</span>
                {getFieldDef(child)?.description && (
                  <span style={{ fontSize: 12, color: "#8c8c8c", fontWeight: 400 }}>
                    {getFieldDef(child)?.description}
                  </span>
                )}
              </Space>
              {!readOnly && (
                <Button
                  size="small" type="text" danger icon={<DeleteOutlined />} className="fdNodeDelete"
                  onClick={(e) => { e.stopPropagation(); onSchemaChange(removeNode(schema, child.id).next); }}
                />
              )}
            </div>
            {nodePreview(child)}
          </div>
        </div>
      ))}

      {/* 末尾放置线：追加到最后 */}
      <div
        className={`fdDropLine ${overTarget === `${schema.id}:after` ? "fdDropLineActive" : ""}`}
        onDragOver={handleDragOver(schema.id, "after")}
        onDragLeave={handleDragLeave(schema.id, "after")}
        onDrop={handleDrop(schema.id, "after")}
      />

      {children.length === 0 && !readOnly && (
        <Typography.Text type="secondary" style={{ fontSize: 13, marginTop: 8, display: "block" }}>
          从左侧拖入题目到此处
        </Typography.Text>
      )}
    </div>
  );
}
