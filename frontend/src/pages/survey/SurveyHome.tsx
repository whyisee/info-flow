import { Card, Col, Row, Statistic, Table, Typography, Space, Button, Tag } from "antd";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  listSurveyTemplates,
  type SurveyTemplate,
} from "../../services/surveyTemplates";

export default function SurveyHome() {
  const nav = useNavigate();
  const [rows, setRows] = useState<SurveyTemplate[]>([]);
  const [loading, setLoading] = useState(false);

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

  const total = rows.length;
  const published = rows.filter((r) => r.published_version > 0).length;
  const draft = total - published;

  const recentColumns = [
    { title: "名称", dataIndex: "name", render: (v: string, r: SurveyTemplate) => (
      <Button type="link" style={{ padding: 0 }} onClick={() => nav(`/survey/design/${r.id}`)}>{v}</Button>
    )},
    { title: "状态", dataIndex: "published_version", render: (v: number) => v > 0 ? <Tag color="green">已发布 v{v}</Tag> : <Tag>草稿</Tag> },
    { title: "时间", dataIndex: "updated_at", render: (v: string) => v ? new Date(v).toLocaleDateString() : "-" },
  ];

  return (
    <div style={{ padding: "0 4px" }}>
      <Typography.Title level={4} style={{ marginBottom: 16 }}>问卷概览</Typography.Title>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card size="small">
            <Statistic title="模板总数" value={total} />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic title="已发布" value={published} valueStyle={{ color: "#52c41a" }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic title="草稿" value={draft} valueStyle={{ color: "#fa8c16" }} />
          </Card>
        </Col>
      </Row>

      <Card
        size="small"
        title="最近模板"
        extra={<Button size="small" onClick={() => nav("/survey/design")}>全部</Button>}
      >
        <Table
          size="small"
          rowKey="id"
          loading={loading}
          columns={recentColumns as any}
          dataSource={rows.slice(0, 5)}
          pagination={false}
        />
      </Card>
    </div>
  );
}
