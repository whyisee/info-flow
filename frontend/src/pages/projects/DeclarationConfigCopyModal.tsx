import { useEffect, useMemo } from "react";
import { Form, Input, Modal, Select, Space, Typography } from "antd";
import type { DeclarationConfigRecord } from "../../services/declarationConfig";

type Props = {
  open: boolean;
  loading?: boolean;
  rows: DeclarationConfigRecord[];
  onCancel: () => void;
  onOk: (args: { sourceId: number; label?: string }) => void | Promise<void>;
};

function versionOptionLabel(r: DeclarationConfigRecord) {
  const statusText =
    r.status === "published" ? "已发布" : r.status === "draft" ? "草稿" : "已归档";
  const desc = r.label ? ` — ${r.label}` : "";
  return `v${r.version}（${statusText}）${desc}`;
}

export function DeclarationConfigCopyModal({
  open,
  loading,
  rows,
  onCancel,
  onOk,
}: Props) {
  const [form] = Form.useForm<{ sourceId: number; label?: string }>();

  const defaultSourceId = useMemo(() => {
    if (!rows.length) return undefined;
    const published = rows.find((r) => r.status === "published");
    return (published ?? rows[0]).id;
  }, [rows]);

  useEffect(() => {
    if (!open) return;
    if (!defaultSourceId) return;
    form.setFieldsValue({ sourceId: defaultSourceId, label: undefined });
  }, [open, defaultSourceId, form]);

  return (
    <Modal
      title="复制新建版本"
      open={open}
      onCancel={onCancel}
      okText="复制新建"
      confirmLoading={loading}
      onOk={() => void form.submit()}
      destroyOnClose
      centered
    >
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          从一个已有版本复制配置，生成新的<strong>草稿</strong>版本。
        </Typography.Paragraph>
        <Form
          form={form}
          layout="vertical"
          onFinish={(vals) => onOk(vals)}
          requiredMark={false}
        >
          <Form.Item
            label="源版本"
            name="sourceId"
            rules={[{ required: true, message: "请选择要复制的版本" }]}
          >
            <Select
              placeholder="选择一个版本"
              options={rows.map((r) => ({
                value: r.id,
                label: versionOptionLabel(r),
              }))}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item label="新版本说明（可选）" name="label">
            <Input placeholder="如：复制自 v3（按需调整）" maxLength={200} />
          </Form.Item>
        </Form>
      </Space>
    </Modal>
  );
}

