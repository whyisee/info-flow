import {
  Button,
  Card,
  Col,
  Drawer,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import { DownloadOutlined, ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import {
  listSurveyResponses,
  type SurveyResponseOut,
} from "../../services/surveyResponses";
import {
  getSurveyTemplateVersion,
  listSurveyTemplates,
  type SurveyTemplate,
} from "../../services/surveyTemplates";

export default function SurveyExport() {
  const [templates, setTemplates] = useState<SurveyTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [responses, setResponses] = useState<SurveyResponseOut[]>([]);
  const [loading, setLoading] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedResponse, setSelectedResponse] = useState<SurveyResponseOut | null>(null);
  const [versionFields, setVersionFields] = useState<Record<string, unknown>>({});

  // 加载所有模板
  useEffect(() => {
    setTemplateLoading(true);
    listSurveyTemplates()
      .then((data) => setTemplates(data as SurveyTemplate[]))
      .catch(() => message.error("加载模板失败"))
      .finally(() => setTemplateLoading(false));
  }, []);

  // 加载选中模板的提交记录
  useEffect(() => {
    if (!selectedTemplateId) {
      setResponses([]);
      return;
    }
    setLoading(true);
    Promise.all([
      listSurveyResponses(selectedTemplateId),
      getSurveyTemplateVersion(selectedTemplateId, selectedTemplate?.published_version ?? 1),
    ])
      .then(([data, verData]) => {
        setResponses(data as SurveyResponseOut[]);
        setVersionFields(verData.fields as Record<string, unknown>);
      })
      .catch(() => message.error("加载提交记录失败"))
      .finally(() => setLoading(false));
  }, [selectedTemplateId]);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  const columns = [
    {
      title: "序号",
      key: "index",
      width: 60,
      render: (_: unknown, __: unknown, i: number) => i + 1,
    },
    {
      title: "提交时间",
      dataIndex: "submitted_at",
      key: "submitted_at",
      width: 180,
      render: (v: string) => dayjs(v).format("YYYY-MM-DD HH:mm:ss"),
    },
    {
      title: "版本",
      dataIndex: "version",
      key: "version",
      width: 80,
      render: (v: number) => <Tag color="blue">v{v}</Tag>,
    },
    {
      title: "操作",
      key: "actions",
      width: 100,
      render: (_: unknown, r: SurveyResponseOut) => (
        <Button
          size="small"
          type="link"
          onClick={() => {
            setSelectedResponse(r);
            setDetailOpen(true);
          }}
        >
          查看详情
        </Button>
      ),
    },
  ];

  const handleExportCSV = () => {
    if (!selectedResponse || !selectedTemplate) return;
    const fields = selectedTemplate.draft_fields as Record<string, { label?: string }>;
    const answers = selectedResponse.answers;

    // CSV header
    const headers = ["题目", "答案"];
    const rows = Object.entries(answers).map(([key, val]) => {
      const label = fields[key]?.label ?? key;
      const value = Array.isArray(val) ? val.join("；") : String(val ?? "");
      return [label, value];
    });

    const csvContent =
      "\uFEFF" +
      [headers, ...rows]
        .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
        .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedTemplate.name}_v${selectedResponse.version}_${dayjs(selectedResponse.submitted_at).format("YYYYMMDD_HHmmss")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: "0 4px" }}>
      <Typography.Title level={4} style={{ marginBottom: 16 }}>
        问卷数据
        <Button
          icon={<ReloadOutlined />}
          size="small"
          style={{ marginLeft: 12 }}
          onClick={() => selectedTemplateId && setSelectedTemplateId(selectedTemplateId)}
          loading={loading}
        >
          刷新
        </Button>
      </Typography.Title>

      <Card
        size="small"
        style={{ marginBottom: 16 }}
        bodyStyle={{ padding: "12px 16px" }}
      >
        <Space size={12} wrap>
          <Typography.Text style={{ fontSize: 13 }}>选择问卷：</Typography.Text>
          <Select
            placeholder="请选择问卷模板"
            style={{ width: 280 }}
            loading={templateLoading}
            value={selectedTemplateId}
            onChange={(v) => setSelectedTemplateId(v)}
            options={templates.map((t) => ({
              value: t.id,
              label: `${t.name}（${t.published_version > 0 ? `v${t.published_version}` : "未发布"}）`,
            }))}
          />
          {responses.length > 0 && (
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              共 {responses.length} 条提交记录
            </Typography.Text>
          )}
        </Space>
      </Card>

      <Card size="small" bodyStyle={{ padding: 0 }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 40 }}>
            <Spin />
          </div>
        ) : !selectedTemplateId ? (
          <div style={{ textAlign: "center", padding: 60, color: "#9ca3af" }}>
            请选择一个问卷模板查看提交数据
          </div>
        ) : responses.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "#9ca3af" }}>
            该问卷暂无提交记录
          </div>
        ) : (
          <Table
            rowKey="id"
            size="small"
            columns={columns as any}
            dataSource={responses}
            pagination={{ pageSize: 20 }}
          />
        )}
      </Card>

      <Drawer
        title="提交详情"
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={560}
        extra={
          <Button
            icon={<DownloadOutlined />}
            onClick={handleExportCSV}
            disabled={!selectedResponse}
          >
            导出 CSV
          </Button>
        }
      >
        {selectedResponse && selectedTemplate && (
          <div>
            <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
              <Col span={12}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  提交时间
                </Typography.Text>
                <div style={{ fontSize: 14, marginTop: 2 }}>
                  {dayjs(selectedResponse.submitted_at).format("YYYY-MM-DD HH:mm:ss")}
                </div>
              </Col>
              <Col span={12}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  问卷版本
                </Typography.Text>
                <div style={{ fontSize: 14, marginTop: 2 }}>
                  <Tag color="blue">v{selectedResponse.version}</Tag>
                </div>
              </Col>
            </Row>

            <Typography.Title level={5} style={{ marginTop: 16, marginBottom: 12 }}>
              填写内容
            </Typography.Title>
            <Card size="small" bodyStyle={{ padding: "12px 16px" }}>
              {Object.entries(selectedResponse.answers).map(([key, val]) => {
                // 优先用 version_fields（published version 的字段定义，含完整 type），fallback 到 draft_fields
                const allFields = { ...(selectedTemplate.draft_fields as Record<string, unknown>), ...versionFields } as Record<string, { label?: string; type?: string }>;
                const fd = allFields[key];
                const label = fd?.label ?? key;
                const fieldType = fd?.type as string | undefined;
                const displayValue = (fieldType === "attachment" || fieldType === "image")
                  ? (Array.isArray(val) ? val.join("、") : String(val ?? ""))
                  : Array.isArray(val)
                  ? val.join("、")
                  : typeof val === "object" && val !== null
                  ? JSON.stringify(val)
                  : String(val ?? "（未填写）");
                return (
                  <div
                    key={key}
                    style={{
                      padding: "10px 0",
                      borderBottom: "1px solid #f0f0f0",
                    }}
                  >
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {label}
                    </Typography.Text>
                    <div style={{ fontSize: 14, marginTop: 4, color: "#1a1a1a" }}>
                      {(fieldType === "attachment" || fieldType === "image")
                        ? (
                          Array.isArray(val) ? val.map((item: unknown, i: number) => {
                            const obj = item as { fileName?: string; filePath?: string };
                            const fileName = obj?.fileName ?? String(item);
                            const filePath = obj?.filePath;
                            const downloadUrl = filePath
                              ? `/api/survey/attachments/download?file_path=${encodeURIComponent(filePath)}&file_name=${encodeURIComponent(fileName)}`
                              : null;
                            return (
                              <span key={i} style={{ marginRight: 12 }}>
                                {downloadUrl ? (
                                  <a href={downloadUrl} target="_blank" rel="noopener noreferrer">{fileName}</a>
                                ) : (
                                  <span>{fileName}</span>
                                )}
                              </span>
                            );
                          }) : <span>{val}</span>
                        )
                        : displayValue || "（未填写）"}
                    </div>
                  </div>
                );
              })}
            </Card>
          </div>
        )}
      </Drawer>
    </div>
  );
}
