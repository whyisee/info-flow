import { Button, Card, Input, Modal, Space, Table, Typography, message } from "antd";
import { CopyOutlined } from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createSurveyTemplate,
  deleteSurveyTemplate,
  listSurveyTemplates,
  publishSurveyTemplate,
  type SurveyTemplate,
} from "../../services/surveyTemplates";

export default function SurveyDesignList() {
  const nav = useNavigate();
  const [rows, setRows] = useState<SurveyTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      setRows(await listSurveyTemplates());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const columns = useMemo(
    () => [
      { title: "ID", dataIndex: "id", width: 90 },
      { title: "名称", dataIndex: "name" },
      {
        title: "已发布版本",
        dataIndex: "published_version",
        width: 140,
        render: (v: number) => (v > 0 ? `v${v}` : <Typography.Text type="secondary">未发布</Typography.Text>),
      },
      {
        title: "操作",
        key: "actions",
        width: 280,
        render: (_: unknown, r: SurveyTemplate) => (
          <Space size={8}>
            <Button size="small" type="primary" onClick={() => nav(`/survey/design/${r.id}`, { state: { tabLabel: r.name } })}>
              设计
            </Button>
            <Button
              size="small"
              onClick={async () => {
                await publishSurveyTemplate(r.id);
                message.success("已发布");
                await load();
              }}
            >
              发布
            </Button>
            <Button
              size="small"
              icon={<CopyOutlined />}
              disabled={r.published_version === 0}
              onClick={() => {
                const url = `${window.location.origin}/survey/fill/${r.id}/${r.published_version}`;
                navigator.clipboard.writeText(url).then(() => message.success("链接已复制"));
              }}
            >
              复制链接
            </Button>
            <Button
              size="small"
              danger
              onClick={() => {
                Modal.confirm({
                  title: "确认删除模板？",
                  content: "删除将同时删除所有发布版本，且不可恢复。",
                  okText: "删除",
                  okButtonProps: { danger: true },
                  cancelText: "取消",
                  onOk: async () => {
                    await deleteSurveyTemplate(r.id);
                    message.success("已删除");
                    await load();
                  },
                });
              }}
            >
              删除
            </Button>
          </Space>
        ),
      },
    ],
    [nav],
  );

  return (
    <Card
      title="问卷设计模板"
      extra={
        <Space size={8}>
          <Button onClick={() => void load()} loading={loading}>
            刷新
          </Button>
          <Button type="primary" onClick={() => setCreateOpen(true)}>
            新建模板
          </Button>
        </Space>
      }
    >
      <Table
        rowKey="id"
        loading={loading}
        columns={columns as any}
        dataSource={rows}
        pagination={{ pageSize: 20 }}
      />

      <Modal
        title="新建模板"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        okText="创建"
        cancelText="取消"
        onOk={async () => {
          if (!name.trim()) {
            message.error("请输入模板名称");
            return;
          }
          const created = await createSurveyTemplate({ name: name.trim(), description: desc.trim() || undefined });
          message.success("已创建");
          setCreateOpen(false);
          setName("");
          setDesc("");
          await load();
          nav(`/survey/design/${created.id}`);
        }}
        destroyOnClose
      >
        <Space direction="vertical" size={10} style={{ width: "100%" }}>
          <div>
            <Typography.Text>名称</Typography.Text>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：学生基本信息表" />
          </div>
          <div>
            <Typography.Text>说明（可选）</Typography.Text>
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="用于区分用途/场景" />
          </div>
        </Space>
      </Modal>
    </Card>
  );
}
