import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import { EyeOutlined, ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import {
  listDeclarationConfigTemplates,
  updateDeclarationConfigTemplate,
  type DeclarationConfigTemplate,
} from "../../services/declarationConfigTemplates";
import { DeclarationConfigRenderer } from "../../features/declaration-config-render";
import "./DeclarationConfigTemplateLibrary.css";

const categoryOptions = [
  { value: "人才类", label: "人才类" },
  { value: "奖项类", label: "奖项类" },
  { value: "项目类", label: "项目类" },
  { value: "年度申报类", label: "年度申报类" },
];

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = dayjs(value);
  return d.isValid() ? d.format("YYYY-MM-DD HH:mm") : "—";
}

export default function DeclarationConfigTemplateLibrary() {
  const [rows, setRows] = useState<DeclarationConfigTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [keyword, setKeyword] = useState("");
  const [preview, setPreview] = useState<DeclarationConfigTemplate | null>(null);
  const [editing, setEditing] = useState<DeclarationConfigTemplate | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [categoryDraft, setCategoryDraft] = useState<string | undefined>();
  const [descriptionDraft, setDescriptionDraft] = useState("");

  const load = () => {
    setLoading(true);
    listDeclarationConfigTemplates(statusFilter === "all" ? undefined : statusFilter)
      .then(setRows)
      .catch(() => message.error("加载申报配置模板失败"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [statusFilter]);

  const filteredRows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return rows;
    return rows.filter((item) =>
      [item.name, item.category, item.description, `v${item.version}`]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(kw),
    );
  }, [keyword, rows]);

  const openEdit = (row: DeclarationConfigTemplate) => {
    setEditing(row);
    setNameDraft(row.name);
    setCategoryDraft(row.category ?? undefined);
    setDescriptionDraft(row.description ?? "");
  };

  const saveEdit = async () => {
    if (!editing) return;
    const name = nameDraft.trim();
    if (!name) {
      message.error("模板名称不能为空");
      return;
    }
    setLoading(true);
    try {
      await updateDeclarationConfigTemplate(editing.id, {
        name,
        category: categoryDraft ?? null,
        description: descriptionDraft.trim() || null,
      });
      message.success("已保存");
      setEditing(null);
      load();
    } catch {
      message.error("保存失败");
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = async (row: DeclarationConfigTemplate) => {
    const next = row.status === "enabled" ? "disabled" : "enabled";
    setLoading(true);
    try {
      await updateDeclarationConfigTemplate(row.id, { status: next });
      message.success(next === "enabled" ? "已启用" : "已停用");
      load();
    } catch {
      message.error("更新状态失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="declConfigTemplateLibrary">
      <div className="declConfigTemplateLibraryHeader">
        <div>
          <h2 className="declConfigTemplateLibraryTitle">申报配置模板库</h2>
          <div className="declConfigTemplateLibrarySubtitle">
            集中维护项目申报配置模板，供项目申报配置快速复用。
          </div>
        </div>
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
          刷新
        </Button>
      </div>

      <Card>
        <div className="declConfigTemplateLibraryFilters">
          <Space wrap>
            <Select
              value={statusFilter}
              style={{ width: 150 }}
              options={[
                { value: "all", label: "全部状态" },
                { value: "enabled", label: "已启用" },
                { value: "disabled", label: "已停用" },
              ]}
              onChange={setStatusFilter}
            />
            <Input.Search
              allowClear
              placeholder="搜索名称、分类、说明"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              style={{ width: 260 }}
            />
          </Space>
          <Typography.Text type="secondary">
            共 {filteredRows.length} 个模板
          </Typography.Text>
        </div>
      </Card>

      <Table<DeclarationConfigTemplate>
        rowKey="id"
        loading={loading}
        dataSource={filteredRows}
        scroll={{ x: 980 }}
        columns={[
          {
            title: "模板名称",
            dataIndex: "name",
            ellipsis: true,
            render: (value: string, row) => (
              <Space size={6} wrap>
                <Typography.Text strong>{value}</Typography.Text>
                <Tag>v{row.version}</Tag>
              </Space>
            ),
          },
          {
            title: "分类",
            dataIndex: "category",
            width: 120,
            render: (value?: string | null) => value || "—",
          },
          {
            title: "状态",
            dataIndex: "status",
            width: 100,
            render: (value: DeclarationConfigTemplate["status"]) => (
              <Tag color={value === "enabled" ? "green" : "default"}>
                {value === "enabled" ? "已启用" : "已停用"}
              </Tag>
            ),
          },
          {
            title: "说明",
            dataIndex: "description",
            ellipsis: true,
            render: (value?: string | null) => value || "—",
          },
          {
            title: "更新时间",
            dataIndex: "updated_at",
            width: 168,
            render: (_: string | null, row) => formatDate(row.updated_at || row.created_at),
          },
          {
            title: "操作",
            key: "action",
            width: 250,
            fixed: "right",
            render: (_, row) => (
              <Space size={4}>
                <Button
                  type="link"
                  size="small"
                  icon={<EyeOutlined />}
                  onClick={() => setPreview(row)}
                >
                  预览
                </Button>
                <Button type="link" size="small" onClick={() => openEdit(row)}>
                  编辑
                </Button>
                <Button type="link" size="small" onClick={() => void toggleStatus(row)}>
                  {row.status === "enabled" ? "停用" : "启用"}
                </Button>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={preview ? `模板预览：${preview.name}` : "模板预览"}
        open={preview != null}
        onCancel={() => setPreview(null)}
        footer={null}
        width={980}
        destroyOnClose
      >
        {preview ? (
          <div className="declConfigTemplatePreview">
            <DeclarationConfigRenderer
              variant="preview"
              config={preview.config ?? { modules: [] }}
              moduleLayout="stack"
            />
          </div>
        ) : null}
      </Modal>

      <Modal
        title="编辑模板信息"
        open={editing != null}
        onCancel={() => setEditing(null)}
        onOk={() => void saveEdit()}
        confirmLoading={loading}
        okText="保存"
      >
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <div className="declConfigTemplateFormRow">
            <span>名称</span>
            <Input
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              maxLength={200}
            />
          </div>
          <div className="declConfigTemplateFormRow">
            <span>分类</span>
            <Select
              allowClear
              value={categoryDraft}
              options={categoryOptions}
              onChange={setCategoryDraft}
              placeholder="选择分类"
            />
          </div>
          <div className="declConfigTemplateFormRow declConfigTemplateFormRowBlock">
            <span>说明</span>
            <Input.TextArea
              value={descriptionDraft}
              onChange={(event) => setDescriptionDraft(event.target.value)}
              rows={4}
              maxLength={500}
            />
          </div>
        </Space>
      </Modal>
    </div>
  );
}
