import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Empty, List, Progress, Space, Statistic, Tag, Typography, message } from "antd";
import { BellOutlined, FileTextOutlined, ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useNavigate } from "react-router-dom";
import {
  getTeacherWorkbench,
  type TeacherWorkbench as TeacherWorkbenchData,
  type TeacherWorkbenchProject,
} from "../../services/teacherWorkbench";
import * as materialService from "../../services/materials";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "../../services/notifications";
import { materialStatusLabel } from "../../utils/materialApproval";
import "./TeacherWorkbench.css";

function statusTag(item: TeacherWorkbenchProject) {
  if (item.materialStatus === "not_started") return <Tag>未开始</Tag>;
  if (item.materialStatus === "returned") return <Tag color="red">已退回</Tag>;
  const status = Number(item.materialStatus);
  const color = status === 0 ? "default" : status === 5 ? "red" : "processing";
  return <Tag color={color}>{materialStatusLabel(status, 3)}</Tag>;
}

function formatDate(v?: string | null) {
  if (!v) return "—";
  const d = dayjs(v);
  return d.isValid() ? d.format("YYYY-MM-DD HH:mm") : "—";
}

export default function TeacherWorkbench() {
  const [data, setData] = useState<TeacherWorkbenchData | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    getTeacherWorkbench()
      .then(setData)
      .catch(() => message.error("加载教师工作台失败"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const sortedProjects = useMemo(
    () =>
      [...(data?.projects ?? [])].sort((a, b) => {
        const ad = a.daysLeft ?? 99999;
        const bd = b.daysLeft ?? 99999;
        return ad - bd;
      }),
    [data?.projects],
  );

  const openProject = async (item: TeacherWorkbenchProject) => {
    if (item.materialId) {
      navigate(`/declaration/materials/${item.materialId}`);
      return;
    }
    try {
      setLoading(true);
      const created = await materialService.createMaterial({
        project_id: item.projectId,
        content: {},
      });
      navigate(`/declaration/materials/${created.id}`);
    } catch {
      message.error("创建申报材料失败");
    } finally {
      setLoading(false);
    }
  };

  const openTarget = async (id: number, target?: string | null) => {
    try {
      await markNotificationRead(id);
      load();
    } catch {
      // 已读失败不阻塞跳转
    }
    if (target) navigate(target);
  };

  const unreadCount = (data?.notifications ?? []).filter((item) => {
    const readAt = item.readAt ?? item.read_at;
    return !readAt;
  }).length;

  return (
    <div className="teacherWorkbench">
      <div className="teacherWorkbenchHeader">
        <div>
          <h2 className="teacherWorkbenchTitle">教师工作台</h2>
          <div className="teacherWorkbenchSubtitle">
            查看可申报项目、待办事项和材料保存状态。
          </div>
        </div>
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
          刷新
        </Button>
      </div>

      <div className="teacherWorkbenchSummary">
        <Card>
          <Statistic title="可申报项目" value={data?.summary.availableProjects ?? 0} />
        </Card>
        <Card>
          <Statistic title="草稿材料" value={data?.summary.draftMaterials ?? 0} />
        </Card>
        <Card>
          <Statistic title="退回待修改" value={data?.summary.returnedMaterials ?? 0} />
        </Card>
        <Card>
          <Statistic title="临近截止" value={data?.summary.deadlineSoon ?? 0} />
        </Card>
      </div>

      <div className="teacherWorkbenchInfoGrid">
        <Card
          title={
            <Space>
              <BellOutlined />
              <span>站内通知</span>
              {unreadCount ? <Badge count={unreadCount} /> : null}
            </Space>
          }
          extra={
            unreadCount ? (
              <Button
                type="link"
                size="small"
                onClick={async () => {
                  try {
                    await markAllNotificationsRead();
                    load();
                  } catch {
                    message.error("标记已读失败");
                  }
                }}
              >
                全部已读
              </Button>
            ) : null
          }
        >
          {(data?.notifications ?? []).length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无通知" />
          ) : (
            <List
              size="small"
              dataSource={data?.notifications ?? []}
              renderItem={(item) => {
                const readAt = item.readAt ?? item.read_at;
                const target = item.targetUrl ?? item.target_url;
                return (
                  <List.Item
                    actions={[
                      target ? (
                        <Button
                          key="open"
                          type="link"
                          size="small"
                          onClick={() => void openTarget(item.id, target)}
                        >
                          查看
                        </Button>
                      ) : null,
                    ].filter(Boolean)}
                  >
                    <List.Item.Meta
                      title={
                        <Space size={6}>
                          {!readAt ? <Badge status="processing" /> : <Badge status="default" />}
                          <span>{item.title}</span>
                        </Space>
                      }
                      description={item.content || "—"}
                    />
                  </List.Item>
                );
              }}
            />
          )}
        </Card>

        <Card title="待办事项">
          {(data?.todos ?? []).length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无待办" />
          ) : (
            <List
              size="small"
              dataSource={data?.todos ?? []}
              renderItem={(item) => (
                <List.Item
                  actions={[
                    <Button
                      key="go"
                      type="link"
                      size="small"
                      onClick={() => navigate(item.targetUrl)}
                    >
                      处理
                    </Button>,
                  ]}
                >
                  <List.Item.Meta title={item.title} description={item.content} />
                </List.Item>
              )}
            />
          )}
        </Card>
      </div>

      <Card title="我的申报项目" loading={loading}>
        {sortedProjects.length === 0 ? (
          <Empty description="暂无可查看项目" />
        ) : (
          <div className="teacherWorkbenchProjectGrid">
            {sortedProjects.map((item) => {
              const primaryText =
                item.materialStatus === "not_started"
                  ? "开始填报"
                  : item.materialStatus === 5 || item.materialStatus === "returned"
                    ? "去修改"
                    : item.materialStatus === 0
                      ? "继续填报"
                      : "查看进度";
              return (
                <Card
                  className="teacherWorkbenchProjectCard"
                  key={item.projectId}
                  size="small"
                >
                  <div className="teacherWorkbenchProjectTop">
                    <h3 className="teacherWorkbenchProjectName">{item.projectName}</h3>
                    {statusTag(item)}
                  </div>
                  <div className="teacherWorkbenchProjectDesc">
                    <Typography.Paragraph ellipsis={{ rows: 2 }} style={{ margin: 0 }}>
                      {item.description || "暂无项目说明"}
                    </Typography.Paragraph>
                  </div>
                  <div className="teacherWorkbenchProjectMeta">
                    <Tag color={item.daysLeft != null && item.daysLeft <= 7 ? "red" : "blue"}>
                      截止：{formatDate(item.deadline)}
                    </Tag>
                    {item.daysLeft != null ? <Tag>剩余 {item.daysLeft} 天</Tag> : null}
                    {item.lastSavedAt ? <Tag>保存：{formatDate(item.lastSavedAt)}</Tag> : null}
                  </div>
                  <div className="teacherWorkbenchProgressLine">
                    <Progress
                      percent={item.completion}
                      size="small"
                      status={item.errorCount > 0 ? "exception" : "active"}
                    />
                    <Space size={4}>
                      {item.errorCount > 0 ? <Tag color="red">{item.errorCount} 错误</Tag> : null}
                      {item.warningCount > 0 ? <Tag color="gold">{item.warningCount} 提示</Tag> : null}
                    </Space>
                  </div>
                  <Button
                    type="primary"
                    icon={<FileTextOutlined />}
                    onClick={() => void openProject(item)}
                    block
                  >
                    {primaryText}
                  </Button>
                </Card>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
