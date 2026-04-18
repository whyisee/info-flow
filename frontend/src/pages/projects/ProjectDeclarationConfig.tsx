import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Button,
  Card,
  Input,
  type InputRef,
  Modal,
  Select,
  Space,
  Tag,
  message,
  Typography,
} from "antd";
import { EditOutlined } from "@ant-design/icons";
import type { DeclarationConfigRecord } from "../../services/declarationConfig";
import * as declarationConfigApi from "../../services/declarationConfig";
import * as projectService from "../../services/projects";
import type { Project } from "../../types";
import {
  DeclarationConfigRenderer,
  normalizeDeclarationConfig,
} from "../../features/declaration-config-render";
import { DeclarationConfigCopyModal } from "./DeclarationConfigCopyModal";
import {
  DeclarationConfigEditorPanel,
  type DeclarationConfigEditorPanelRef,
} from "./DeclarationConfigEditorPanel";
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
  const [copyOpen, setCopyOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [labelEditing, setLabelEditing] = useState(false);
  const [panelKey, setPanelKey] = useState(0);
  const editorRef = useRef<DeclarationConfigEditorPanelRef | null>(null);
  const [labelDraft, setLabelDraft] = useState("");
  const labelInputRef = useRef<InputRef | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

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
      const latest = list.length ? list[0] : null;
      setSelectedId((prev) => {
        if (prev != null && list.some((x) => x.id === prev)) return prev;
        return latest ? latest.id : null;
      });
    } catch {
      message.error("加载失败");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const selectedRecord = useMemo(() => {
    if (!selectedId) return null;
    return rows.find((r) => r.id === selectedId) || null;
  }, [rows, selectedId]);

  const canEditSelected = selectedRecord?.status === "draft";
  const canCopySelected = selectedRecord?.status === "published";

  useEffect(() => {
    setLabelDraft(selectedRecord?.label ?? "");
  }, [selectedRecord?.id, selectedRecord?.label]);

  const copyCreateVersion = async (args: {
    sourceId: number;
    label?: string;
  }) => {
    const source = rows.find((r) => r.id === args.sourceId);
    if (!source) {
      message.error("源版本不存在或已刷新");
      return;
    }
    setLoading(true);
    try {
      // 深拷贝：避免引用共享导致后续编辑出现奇怪的“连带修改”
      const config = JSON.parse(JSON.stringify(source.config ?? {})) as Record<
        string,
        unknown
      >;
      await declarationConfigApi.createDeclarationConfig(projectId, {
        label: args.label?.trim() || `复制自 v${source.version}`,
        config,
      });
      message.success("已复制新建版本");
      setCopyOpen(false);
      loadAll();
    } catch {
      message.error("复制新建失败");
    } finally {
      setLoading(false);
    }
  };

  const quickCopyFromSelected = async () => {
    if (!selectedRecord || !canCopySelected) return;
    setLoading(true);
    try {
      const config = JSON.parse(
        JSON.stringify(selectedRecord.config ?? {}),
      ) as Record<string, unknown>;
      const created = await declarationConfigApi.createDeclarationConfig(
        projectId,
        {
          label: `复制自 v${selectedRecord.version}`,
          config,
        },
      );
      message.success("已复制新建版本");
      await loadAll();
      setSelectedId(created.id);
      setEditing(true);
      setPanelKey((k) => k + 1);
    } catch {
      message.error("复制新建失败");
    } finally {
      setLoading(false);
    }
  };

  const startEdit = () => {
    if (!canEditSelected) return;
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setLabelEditing(false);
    setLabelDraft(selectedRecord?.label ?? "");
    setPanelKey((k) => k + 1);
  };

  const onSave = async () => {
    try {
      await editorRef.current?.save(labelDraft);
    } finally {
      // do nothing
    }
  };

  const onPublish = async () => {
    try {
      await editorRef.current?.publish();
      setEditing(false);
      setPanelKey((k) => k + 1);
      await loadAll();
    } finally {
      // do nothing
    }
  };

  const previewConfig = useMemo(() => {
    if (!selectedRecord) return null;
    const cfg =
      editorRef.current?.getPreviewConfig?.() ??
      ((selectedRecord.config ?? {}) as Record<string, unknown>);
    return normalizeDeclarationConfig(cfg);
  }, [selectedRecord, panelKey, editing, labelDraft]);

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
          {selectedRecord ? (
            <Tag
              color={
                (statusLabel[selectedRecord.status] ?? { color: "default" })
                  .color
              }
            >
              {
                (
                  statusLabel[selectedRecord.status] ?? {
                    text: selectedRecord.status,
                  }
                ).text
              }
              {` v${selectedRecord.version}`}
            </Tag>
          ) : null}
          {selectedRecord ? (
            <Space size={6} wrap>
              {/* <Typography.Text type="secondary"></Typography.Text> */}
              {!labelEditing ? (
                <>
                  <Typography.Text ellipsis style={{ maxWidth: 320 }}>
                    {labelDraft?.trim()
                      ? labelDraft
                      : selectedRecord.label?.trim()
                        ? selectedRecord.label
                        : "—"}
                  </Typography.Text>
                  <Button
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => {
                      if (!canEditSelected) return;
                      if (!editing) startEdit();
                      setLabelEditing(true);
                      setTimeout(() => labelInputRef.current?.focus(), 0);
                    }}
                    disabled={!canEditSelected}
                    aria-label="编辑版本说明"
                  />
                </>
              ) : (
                <Input
                  ref={labelInputRef}
                  size="small"
                  value={labelDraft}
                  onChange={(e) => setLabelDraft(e.target.value)}
                  onPressEnter={() => {
                    setLabelEditing(false);
                  }}
                  onBlur={() => {
                    setLabelEditing(false);
                  }}
                  placeholder="可选：例如“2026 春季申报”"
                  maxLength={200}
                  style={{ width: 360 }}
                />
              )}
            </Space>
          ) : null}
        </div>
        <Space className="projectDeclarationPageActions" size="middle" wrap>
          <Select
            value={selectedId != null ? String(selectedId) : undefined}
            style={{ width: 260 }}
            placeholder="选择版本"
            options={rows.map((r) => ({
              value: String(r.id),
              label: `v${r.version}（${statusLabel[r.status]?.text ?? r.status}）${r.label ? `：${r.label}` : ""}`,
            }))}
            onChange={async (v) => {
              const id = Number(v);
              if (!Number.isFinite(id) || id <= 0) return;
              setEditing(false);
              setPanelKey((k) => k + 1);
              setSelectedId(id);
              // 读取 fresh，避免列表里 config 不是最新
              try {
                setLoading(true);
                const fresh = await declarationConfigApi.getDeclarationConfig(
                  projectId,
                  id,
                );
                setRows((prev) => prev.map((x) => (x.id === id ? fresh : x)));
              } catch {
                message.error("加载配置失败");
              } finally {
                setLoading(false);
              }
            }}
          />
          {!editing ? (
            <>
              <Button
                onClick={() => setPreviewOpen(true)}
                disabled={!selectedRecord}
              >
                预览
              </Button>
              <Button
                onClick={quickCopyFromSelected}
                disabled={!canCopySelected}
                loading={loading}
              >
                复制新建
              </Button>
              <Button
                type="primary"
                onClick={startEdit}
                disabled={!canEditSelected}
              >
                编辑
              </Button>
            </>
          ) : (
            <>
              <Button onClick={cancelEdit}>取消</Button>
              <Button
                onClick={() => setPreviewOpen(true)}
                disabled={!selectedRecord}
              >
                预览
              </Button>
              <Button onClick={() => void onSave()} loading={loading}>
                保存
              </Button>
              <Button
                type="primary"
                onClick={() => void onPublish()}
                loading={loading}
              >
                提交
              </Button>
            </>
          )}
        </Space>
      </div>

      {selectedRecord ? (
        <DeclarationConfigEditorPanel
          key={panelKey}
          ref={editorRef}
          projectId={projectId}
          record={selectedRecord}
          editing={editing}
          label={labelDraft}
          onSaved={() => void loadAll()}
          onPublished={() => void loadAll()}
        />
      ) : (
        <Card>
          <Typography.Text type="secondary">
            暂无版本，请先新建一个版本。
          </Typography.Text>
        </Card>
      )}

      <DeclarationConfigCopyModal
        open={copyOpen}
        loading={loading}
        rows={rows}
        onCancel={() => setCopyOpen(false)}
        onOk={(args) => void copyCreateVersion(args)}
      />

      <Modal
        title={
          selectedRecord
            ? `申报配置预览 — v${selectedRecord.version}`
            : "申报配置预览"
        }
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        footer={null}
        width={960}
        destroyOnClose
        centered
      >
        {previewConfig ? (
          <DeclarationConfigRenderer config={previewConfig} />
        ) : (
          <Typography.Text type="secondary">暂无可预览的配置</Typography.Text>
        )}
      </Modal>
    </div>
  );
}
