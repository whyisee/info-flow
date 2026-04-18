import { Button, Card, Modal, Space, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import type { FieldDef, FormNode } from "../../../features/form-designer/types";
import { FormDesignerCanvas } from "./FormDesignerCanvas";
import { FormDesignerInspector } from "./FormDesignerInspector";
import { FormDesignerPalette } from "./FormDesignerPalette";
import { newGroup } from "./nodeFactory";

function safeParse<T>(raw: string | undefined, fallback: T): T {
  try {
    if (!raw || !raw.trim()) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeParseSchema(raw: string | undefined): FormNode {
  const v = safeParse<unknown>(raw, null);
  if (v && typeof v === "object" && typeof (v as any).id === "string" && typeof (v as any).kind === "string") {
    return v as FormNode;
  }
  return newGroup();
}

function safeParseFields(raw: string | undefined): Record<string, FieldDef> {
  const v = safeParse<unknown>(raw, {});
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, FieldDef>;
  return {};
}

export function FormDesignerEditor({
  value,
  onChange,
  readOnly = false,
}: {
  value: { schemaJson?: string; fieldsJson?: string };
  onChange: (next: { schemaJson: string; fieldsJson: string }) => void;
  readOnly?: boolean;
}) {
  const [schema, setSchema] = useState<FormNode>(() => safeParseSchema(value.schemaJson));
  const [fields, setFields] = useState<Record<string, FieldDef>>(() => safeParseFields(value.fieldsJson));
  const [selectedId, setSelectedId] = useState<string | null>(schema.id);
  const [rawOpen, setRawOpen] = useState(false);

  useEffect(() => {
    setSchema(safeParseSchema(value.schemaJson));
    setFields(safeParseFields(value.fieldsJson));
  }, [value.schemaJson, value.fieldsJson]);

  const commit = (nextSchema: FormNode, nextFields: Record<string, FieldDef>) => {
    // 自动为 schema 中有但 fields 中没有的节点创建 FieldDef
    const allNames = new Set<string>();
    function collectNames(n: FormNode) {
      allNames.add(n.id);
      if ("children" in n && Array.isArray(n.children)) {
        n.children.forEach(collectNames);
      }
    }
    collectNames(nextSchema);

    // 找出需要补全的 field 节点名（kind=Field 且有 name）
    function needsFieldDef(n: FormNode): FormNode | null {
      if (n.kind === "Field" && (n as any).name) return n;
      if ("children" in n && Array.isArray(n.children)) {
        for (const c of n.children) {
          const f = needsFieldDef(c);
          if (f) return f;
        }
      }
      return null;
    }
    const nodeNeedingField = needsFieldDef(nextSchema);
    let autoFields = nextFields;

    // 简单策略：如果 schema 里有 Field 但 fields 为空，说明是刚从 palette 拖过来的
    // 遍历所有 Field 节点，补全缺失的 FieldDef
    function fillFields(n: FormNode, fields: Record<string, FieldDef>): Record<string, FieldDef> {
      if (n.kind === "Field" && (n as any).name) {
        const name = (n as any).name as string;
        if (!fields[name]) {
          fields = { ...fields };
          const ft = (n as any).fieldType || "input";
          fields[name] = {
            name,
            label: (n as any).title || "",
            type: ft,
            options: ["radio", "checkbox", "select"].includes(ft)
              ? [
                  { label: "选项 A", value: "a" },
                  { label: "选项 B", value: "b" },
                ]
              : undefined,
            ...(ft === "attachment"
              ? { attachment: { accept: "", maxSize: 10, maxCount: 5 } }
              : {}),
            ...(ft === "list"
              ? { list: { maxRows: 10 } }
              : {}),
          };
        }
      }
      if ("children" in n && Array.isArray(n.children)) {
        for (const c of n.children) {
          fields = fillFields(c, fields);
        }
      }
      return fields;
    }

    autoFields = fillFields(nextSchema, nextFields);

    setSchema(nextSchema);
    setFields(autoFields);
    onChange({
      schemaJson: JSON.stringify(nextSchema, null, 2),
      fieldsJson: JSON.stringify(autoFields, null, 2),
    });
  };

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      {!readOnly && <FormDesignerPalette />}

      <Card
        size="small"
        title="画布"
        style={{ flex: 1, minWidth: 0 }}
        extra={
          <Space size={8}>
            {readOnly && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                只读模式（查看历史版本）
              </Typography.Text>
            )}
            <Button size="small" onClick={() => setRawOpen(true)}>
              JSON
            </Button>
          </Space>
        }
      >
        <div style={{ position: "relative" }}>
          <FormDesignerCanvas
            schema={schema}
            selectedId={readOnly ? null : selectedId}
            onSelect={readOnly ? () => {} : setSelectedId}
            onSchemaChange={readOnly ? () => {} : (next) => commit(next, fields)}
            fields={fields}
          />
        </div>
      </Card>

      {!readOnly && (
          <FormDesignerInspector
            schema={schema}
            selectedId={selectedId}
            fields={fields}
            onSchemaChange={(next) => commit(next, fields)}
            onFieldsChange={(next) => commit(schema, next)}
          />
      )}

      <Modal
        title="表单 JSON"
        open={rawOpen}
        onCancel={() => setRawOpen(false)}
        footer={null}
        width={960}
        destroyOnClose
        centered
      >
        <Space direction="vertical" size={10} style={{ width: "100%" }}>
          <Card size="small" title="schema">
            <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{JSON.stringify(schema, null, 2)}</pre>
          </Card>
          <Card size="small" title="fields">
            <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{JSON.stringify(fields, null, 2)}</pre>
          </Card>
        </Space>
      </Modal>
    </div>
  );
}
