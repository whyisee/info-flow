import { useEffect, useState } from "react";
import { Button, Card, Select, Table, Typography, message } from "antd";
import dayjs from "dayjs";
import { listAuditLogs, type AuditLog } from "../../services/auditLogs";

const actionLabels: Record<string, string> = {
  project_archive_export: "项目归档导出",
};

export default function AuditLogPage() {
  const [rows, setRows] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<string | undefined>();

  const load = () => {
    setLoading(true);
    listAuditLogs(action)
      .then(setRows)
      .catch(() => message.error("加载审计日志失败"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [action]);

  return (
    <Card
      title="审计日志"
      extra={
        <Button onClick={load} loading={loading}>
          刷新
        </Button>
      }
    >
      <div style={{ marginBottom: 12 }}>
        <Select
          allowClear
          placeholder="全部操作"
          style={{ width: 220 }}
          value={action}
          options={[
            { value: "project_archive_export", label: "项目归档导出" },
          ]}
          onChange={setAction}
        />
      </div>
      <Table<AuditLog>
        rowKey="id"
        loading={loading}
        dataSource={rows}
        scroll={{ x: 920 }}
        columns={[
          {
            title: "时间",
            dataIndex: "created_at",
            width: 170,
            render: (value: string) =>
              dayjs(value).isValid() ? dayjs(value).format("YYYY-MM-DD HH:mm:ss") : "—",
          },
          {
            title: "操作",
            dataIndex: "action",
            width: 150,
            render: (value: string) => actionLabels[value] ?? value,
          },
          { title: "操作者", dataIndex: "actor_id", width: 100 },
          {
            title: "对象",
            key: "target",
            width: 150,
            render: (_, row) => `${row.target_type} #${row.target_id ?? "—"}`,
          },
          {
            title: "详情",
            dataIndex: "detail",
            render: (value?: Record<string, unknown> | null) => (
              <Typography.Text code>
                {value ? JSON.stringify(value) : "—"}
              </Typography.Text>
            ),
          },
        ]}
      />
    </Card>
  );
}
