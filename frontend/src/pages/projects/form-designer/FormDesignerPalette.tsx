import {
  CheckSquareOutlined,
  FieldBinaryOutlined,
  FileTextOutlined,
  FileOutlined,
  MinusOutlined,
  PlusOutlined,
  StarOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import { Card, Typography } from "antd";
import type { FormNode } from "../../../features/form-designer/types";
import "./FormDesignerPalette.css";

const DND_MIME = "application/x-form-designer";
const GLOBAL_KEY = "__fd_dnd_payload__";

const QUESTION_TYPES = [
  { fieldType: "radio", label: "单选题", icon: <StarOutlined />, color: "#1677ff" },
  { fieldType: "checkbox", label: "多选题", icon: <CheckSquareOutlined />, color: "#52c41a" },
  { fieldType: "input", label: "单行文本", icon: <FileTextOutlined />, color: "#595959" },
  { fieldType: "textarea", label: "多行文本", icon: <FieldBinaryOutlined />, color: "#595959" },
  { fieldType: "select", label: "下拉选择", icon: <FileTextOutlined />, color: "#722ed1" },
  { fieldType: "date", label: "日期", icon: <FileTextOutlined />, color: "#fa8c16" },
  { fieldType: "switch", label: "是否", icon: <MinusOutlined />, color: "#8c8c8c" },
  { fieldType: "rating", label: "评分", icon: <StarOutlined />, color: "#fa541c" },
  { fieldType: "attachment", label: "附件上传", icon: <FileOutlined />, color: "#13c2c2" },
  { fieldType: "list", label: "列表", icon: <UnorderedListOutlined />, color: "#eb2f96" },
] as const;

function makeField(type: typeof QUESTION_TYPES[number]) {
  return {
    id: `field_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    kind: "Field",
    name: `q_${Date.now()}`,
    fieldType: type.fieldType,
    title: type.label,
  } as FormNode;
}

function PaletteItem({ label, icon, color }: { label: string; icon: React.ReactNode; color: string }) {
  return (
    <div
      className="palette-item"
      draggable
      onDragStart={(e) => {
        const item = QUESTION_TYPES.find((t) => t.label === label);
        if (!item) { console.error("[Palette] item not found:", label); return; }
        const node = makeField(item);
        const p = JSON.stringify({ kind: "palette", node });
        (window as any)[GLOBAL_KEY] = p;
        e.dataTransfer.setData(DND_MIME, p);
        e.dataTransfer.setData("text/plain", p);
        e.dataTransfer.effectAllowed = "copy";
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragEnd={() => {
        try { delete (window as any)[GLOBAL_KEY]; } catch { (window as any)[GLOBAL_KEY] = undefined; }
      }}
    >
      <span className="palette-item-icon" style={{ color }}>{icon}</span>
      <span className="palette-item-label">{label}</span>
    </div>
  );
}

export function FormDesignerPalette() {
  return (
    <Card
      size="small"
      title={<span style={{ fontSize: 13 }}>题目组件</span>}
      styles={{ body: { padding: "8px 10px" } }}
    >
      <div className="palette-grid">
        {QUESTION_TYPES.map((t) => (
          <PaletteItem key={t.fieldType} label={String(t.label)} icon={t.icon} color={String(t.color)} />
        ))}
      </div>
      <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, fontSize: 11 }}>
        拖入画布添加题目，点击题目可编辑属性
      </Typography.Paragraph>
    </Card>
  );
}
