import { useEffect, useMemo, useState } from "react";
import { Button, Card, List, Progress, Space, Statistic, Table, Tag, Typography, message } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import {
  getAdminDashboard,
  exportProjectArchive,
  type AdminDashboardData,
  type AdminDashboardProjectRow,
} from "../../services/adminDashboard";
import "./AdminDashboard.css";

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = dayjs(value);
  return d.isValid() ? d.format("YYYY-MM-DD HH:mm") : "—";
}

export default function AdminDashboard() {
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    getAdminDashboard()
      .then(setData)
      .catch(() => message.error("加载管理员看板失败"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const projectRows = useMemo(
    () => [...(data?.projects ?? [])].sort((a, b) => b.totalMaterials - a.totalMaterials),
    [data?.projects],
  );

  const downloadArchive = async (row: AdminDashboardProjectRow) => {
    try {
      setLoading(true);
      const blob = await exportProjectArchive(row.projectId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `project-${row.projectId}-archive.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      message.error("导出归档失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="adminDashboard">
      <div className="adminDashboardHeader">
        <div>
          <h2 className="adminDashboardTitle">管理员数据看板</h2>
          <div className="adminDashboardSubtitle">
            汇总项目、材料、审核、退回和截止风险，辅助管理员掌握申报进度。
          </div>
        </div>
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
          刷新
        </Button>
      </div>

      <div className="adminDashboardSummary">
        <Card>
          <Statistic title="项目总数" value={data?.summary.projects ?? 0} />
        </Card>
        <Card>
          <Statistic title="开放项目" value={data?.summary.openProjects ?? 0} />
        </Card>
        <Card>
          <Statistic title="申报材料" value={data?.summary.materials ?? 0} />
        </Card>
        <Card>
          <Statistic title="临近截止" value={data?.summary.deadlineSoon ?? 0} />
        </Card>
      </div>

      <Card title="材料状态分布" loading={loading}>
        <div className="adminDashboardStatusGrid">
          <Card size="small">
            <Statistic title="草稿" value={data?.statusCounts.draft ?? 0} />
          </Card>
          <Card size="small">
            <Statistic title="审核中" value={data?.statusCounts.reviewing ?? 0} />
          </Card>
          <Card size="small">
            <Statistic title="已通过" value={data?.statusCounts.approved ?? 0} />
          </Card>
          <Card size="small">
            <Statistic title="已退回/驳回" value={data?.statusCounts.returned ?? 0} />
          </Card>
        </div>
      </Card>

      <div className="adminDashboardTwoCol">
        <Card title="临近截止项目" loading={loading}>
          <List
            dataSource={data?.deadlineSoon ?? []}
            locale={{ emptyText: "暂无临近截止项目" }}
            renderItem={(item) => (
              <List.Item>
                <List.Item.Meta
                  title={
                    <Space wrap>
                      <Typography.Text strong>{item.projectName}</Typography.Text>
                      <Tag color="red">剩余 {item.daysLeft} 天</Tag>
                    </Space>
                  }
                  description={`截止时间：${formatDate(item.deadline)} · 草稿 ${item.draftMaterials} 份`}
                />
              </List.Item>
            )}
          />
        </Card>
        <Card title="退回较多项目" loading={loading}>
          <List
            dataSource={data?.highReturnProjects ?? []}
            locale={{ emptyText: "暂无退回记录" }}
            renderItem={(item) => (
              <List.Item>
                <List.Item.Meta
                  title={
                    <Space wrap>
                      <Typography.Text strong>{item.projectName}</Typography.Text>
                      <Tag color="orange">{item.returnedMaterials} 份退回</Tag>
                    </Space>
                  }
                  description={`申报 ${item.totalMaterials} 份 · 通过 ${item.approvedMaterials} 份`}
                />
              </List.Item>
            )}
          />
        </Card>
      </div>

      <Card title="项目申报进度" loading={loading}>
        <Table<AdminDashboardProjectRow>
          rowKey="projectId"
          dataSource={projectRows}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 1100 }}
          columns={[
            {
              title: "项目",
              dataIndex: "projectName",
              fixed: "left",
              width: 240,
              ellipsis: true,
            },
            {
              title: "截止时间",
              dataIndex: "deadline",
              width: 170,
              render: (value?: string | null) => formatDate(value),
            },
            {
              title: "总材料",
              dataIndex: "totalMaterials",
              width: 90,
            },
            {
              title: "草稿",
              dataIndex: "draftMaterials",
              width: 80,
            },
            {
              title: "审核中",
              dataIndex: "reviewingMaterials",
              width: 90,
            },
            {
              title: "通过",
              dataIndex: "approvedMaterials",
              width: 80,
            },
            {
              title: "退回",
              dataIndex: "returnedMaterials",
              width: 80,
              render: (value: number) => (
                <Tag color={value > 0 ? "orange" : "default"}>{value}</Tag>
              ),
            },
            {
              title: "提交率",
              dataIndex: "submitRate",
              width: 160,
              render: (value: number) => <Progress percent={value} size="small" />,
            },
            {
              title: "通过率",
              dataIndex: "approvedRate",
              width: 160,
              render: (value: number) => <Progress percent={value} size="small" />,
            },
            {
              title: "操作",
              key: "action",
              width: 110,
              fixed: "right",
              render: (_, row) => (
                <Button
                  type="link"
                  size="small"
                  disabled={row.totalMaterials === 0}
                  onClick={() => void downloadArchive(row)}
                >
                  导出归档
                </Button>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
