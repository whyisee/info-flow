import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Button,
  Card,
  Space,
  Table,
  Tag,
  message,
  Popconfirm,
  Typography,
} from "antd";
import type { DeclarationConfigRecord } from "../../services/declarationConfig";
import * as declarationConfigApi from "../../services/declarationConfig";
import * as projectService from "../../services/projects";
import type { Project } from "../../types";
import {
  EMPTY_DECLARATION_CONFIG,
  SAMPLE_DECLARATION_CONFIG,
} from "./declarationConfigSample";
import { DeclarationConfigEditModal } from "./DeclarationConfigEditModal";
import "./ProjectDeclarationConfig.css";

const statusLabel: Record<string, { color: string; text: string }> = {
  draft: { color: "default", text: "草稿" },
  published: { color: "green", text: "已发布" },
  archived: { color: "default", text: "已归档" },
};

export default function ProjectDeclarationConfig() {
  const { projectId: projectIdParam } = useParams<{ projectId: string }>();
  const projectId = Number(projectIdParam);

  const [project, setProject] = useState<Project | null>(null);
  const [rows, setRows] = useState<DeclarationConfigRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<DeclarationConfigRecord | null>(
    null,
  );
  /** 每次打开编辑递增，保证弹窗内 useLayoutEffect 一定重新灌入表单（避免 config 未变时跳过） */
  const [editorHydrateKey, setEditorHydrateKey] = useState(0);

  const loadAll = useCallback(async () => {
    if (!Number.isFinite(projectId) || projectId < 1) return;
    setLoading(true);
    try {
      const [p, list] = await Promise.all([
        projectService.getProject(projectId),
        declarationConfigApi.listDeclarationConfigs(projectId),
      ]);
      setProject(p);
      setRows(list);
    } catch {
      message.error("加载失败");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const openEdit = async (record: DeclarationConfigRecord) => {
    if (record.status !== "draft") {
      message.warning("仅草稿可编辑");
      return;
    }
    setLoading(true);
    try {
      const fresh = await declarationConfigApi.getDeclarationConfig(
        projectId,
        record.id,
      );
      setEditingRecord(fresh);
      setEditorHydrateKey((k) => k + 1);
      setEditorOpen(true);
    } catch {
      message.error("加载配置失败");
    } finally {
      setLoading(false);
    }
  };

  const createVersion = async (useSample: boolean) => {
    setLoading(true);
    try {
      await declarationConfigApi.createDeclarationConfig(projectId, {
        label: useSample ? "示例骨架" : undefined,
        config: useSample ? SAMPLE_DECLARATION_CONFIG : EMPTY_DECLARATION_CONFIG,
      });
      message.success("已新建版本");
      loadAll();
    } catch {
      message.error("新建失败");
    } finally {
      setLoading(false);
    }
  };

  const publish = async (record: DeclarationConfigRecord) => {
    try {
      await declarationConfigApi.publishDeclarationConfig(projectId, record.id);
      message.success("已发布");
      loadAll();
    } catch {
      message.error("发布失败");
    }
  };

  if (!Number.isFinite(projectId) || projectId < 1) {
    return (
      <Card>
        <Typography.Text type="danger">无效的项目 ID</Typography.Text>
      </Card>
    );
  }

  return (
    <div className="projectDeclarationConfig">
      <div className="projectDeclarationPageHeader">
        <div className="projectDeclarationPageHeaderTitleGroup">
          <h2 className="projectDeclarationPageTitle projectDeclarationPageTitlePrimary">
            申报配置
            {project ? ` — ${project.name}` : ""}
          </h2>
        </div>
        <Space className="projectDeclarationPageActions" size="middle" wrap>
          <Button onClick={() => createVersion(false)} loading={loading}>
            新建空版本
          </Button>
          <Button type="primary" onClick={() => createVersion(true)} loading={loading}>
            新建示例版本
          </Button>
        </Space>
      </div>

      <Table<DeclarationConfigRecord>
        loading={loading}
        rowKey="id"
        dataSource={rows}
        pagination={false}
        columns={[
          { title: "版本", dataIndex: "version", width: 80 },
          { title: "说明", dataIndex: "label", ellipsis: true },
          {
            title: "状态",
            dataIndex: "status",
            width: 100,
            render: (s: string) => {
              const m = statusLabel[s] ?? { color: "default", text: s };
              return <Tag color={m.color}>{m.text}</Tag>;
            },
          },
          {
            title: "更新时间",
            dataIndex: "updated_at",
            width: 200,
            render: (v: string | null | undefined, r) => v ?? r.created_at,
          },
          {
            title: "操作",
            key: "action",
            width: 240,
            render: (_: unknown, record) => (
              <Space wrap size="small">
                <Button type="link" size="small" onClick={() => openEdit(record)}>
                  编辑配置
                </Button>
                {record.status === "draft" && (
                  <Popconfirm
                    title="发布后教师端将拉取此版本，原已发布版本将归档。确定？"
                    onConfirm={() => publish(record)}
                  >
                    <Button type="link" size="small">
                      发布
                    </Button>
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />

      <DeclarationConfigEditModal
        projectId={projectId}
        open={editorOpen}
        hydrateKey={editorHydrateKey}
        record={editingRecord}
        onClose={() => {
          setEditorOpen(false);
          setEditingRecord(null);
        }}
        onSaved={loadAll}
      />
    </div>
  );
}
