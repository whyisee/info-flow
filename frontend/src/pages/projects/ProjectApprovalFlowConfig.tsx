import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Button,
  Card,
  Input,
  type InputRef,
  Popconfirm,
  Select,
  Space,
  Spin,
  Tag,
  message,
  Typography,
} from "antd";
import { EditOutlined } from "@ant-design/icons";
import type { ApprovalFlowVersionRecord } from "../../services/approvalFlowConfig";
import * as approvalFlowConfigApi from "../../services/approvalFlowConfig";
import * as projectService from "../../services/projects";
import type { ApproverOption, Project } from "../../types";
import {
  ApprovalFlowCanvasEditor,
  type ApprovalFlowCanvasHandle,
  type ApprovalStepDraft,
  defaultLinearStepDraft,
  normalizeApiStepsToDraft,
} from "../../features/approval-flow-canvas";
import {
  APPROVAL_FLOW_LIST_REFRESH,
  notifyApprovalFlowListRefresh,
} from "./approvalFlowListEvents";
import "./ProjectDeclarationConfig.css";

const statusLabel: Record<string, { color: string; text: string }> = {
  draft: { color: "default", text: "草稿" },
  published: { color: "green", text: "已发布" },
  archived: { color: "default", text: "已归档" },
};

export default function ProjectApprovalFlowConfig() {
  const { projectId: projectIdParam } = useParams<{ projectId: string }>();
  const projectId = Number(projectIdParam);
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [rows, setRows] = useState<ApprovalFlowVersionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [labelEditing, setLabelEditing] = useState(false);
  const [labelDraft, setLabelDraft] = useState("");
  const labelInputRef = useRef<InputRef | null>(null);
  const [approverOptions, setApproverOptions] = useState<ApproverOption[]>([]);
  const [canvasSteps, setCanvasSteps] = useState<ApprovalStepDraft[]>([defaultLinearStepDraft(1)]);
  const [canvasMountKey, setCanvasMountKey] = useState(0);
  const canvasRef = useRef<ApprovalFlowCanvasHandle>(null);

  const selectedRecord = useMemo(() => {
    if (!selectedId) return null;
    return rows.find((r) => r.id === selectedId) || null;
  }, [rows, selectedId]);

  const canEditSelected = selectedRecord?.status === "draft";

  const loadAll = useCallback(async () => {
    if (!Number.isFinite(projectId) || projectId < 1) return;
    setLoading(true);
    try {
      const [p, list, candidates] = await Promise.all([
        projectService.getProject(projectId),
        approvalFlowConfigApi.listApprovalFlowVersions(projectId),
        projectService.getApproverCandidates(),
      ]);
      setProject(p);
      setRows(list);
      setApproverOptions(candidates);
      // 自动选中已发布版本，没有则选草稿，都没有则选最新
      const published = list.find((r) => r.status === "published");
      const draft = list.find((r) => r.status === "draft");
      const fallback = list[0] ?? null;
      setSelectedId((prev) => {
        if (prev != null && list.some((x) => x.id === prev)) return prev;
        return published?.id ?? draft?.id ?? fallback?.id ?? null;
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

  useEffect(() => {
    const onRefresh = (ev: Event) => {
      const pid = (ev as CustomEvent<{ projectId?: number }>).detail?.projectId;
      if (pid === projectId) loadAll();
    };
    window.addEventListener(APPROVAL_FLOW_LIST_REFRESH, onRefresh);
    return () => window.removeEventListener(APPROVAL_FLOW_LIST_REFRESH, onRefresh);
  }, [projectId, loadAll]);

  useEffect(() => {
    setLabelDraft(selectedRecord?.label ?? "");
  }, [selectedRecord?.id, selectedRecord?.label]);

  useEffect(() => {
    if (selectedRecord) {
      const steps = normalizeApiStepsToDraft(selectedRecord.flow?.steps as unknown[]);
      setCanvasSteps(steps);
      setCanvasMountKey((k) => k + 1);
    }
  }, [selectedRecord?.id]);

  const startEdit = () => {
    if (!canEditSelected) return;
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setLabelEditing(false);
    setLabelDraft(selectedRecord?.label ?? "");
    setCanvasMountKey((k) => k + 1);
  };

  const onSave = async () => {
    if (!selectedRecord || selectedRecord.status !== "draft") return;
    const steps = canvasRef.current?.getSteps();
    if (!steps?.length) {
      message.error("无法读取画布环节");
      return;
    }
    setLoading(true);
    try {
      await approvalFlowConfigApi.updateApprovalFlowVersion(projectId, selectedRecord.id, {
        label: labelDraft,
        flow: { steps },
      });
      message.success("已保存");
      setEditing(false);
      setLabelEditing(false);
      notifyApprovalFlowListRefresh(projectId);
      await loadAll();
    } catch {
      message.error("保存失败");
    } finally {
      setLoading(false);
    }
  };

  const publish = async (record: ApprovalFlowVersionRecord) => {
    try {
      await approvalFlowConfigApi.publishApprovalFlowVersion(projectId, record.id);
      message.success("已发布");
      notifyApprovalFlowListRefresh(projectId);
      await loadAll();
    } catch {
      message.error("发布失败");
    }
  };

  const onVersionChange = async (id: number) => {
    if (!Number.isFinite(id) || id <= 0) return;
    setEditing(false);
    setLabelEditing(false);
    setSelectedId(id);
    try {
      setLoading(true);
      const fresh = await approvalFlowConfigApi.getApprovalFlowVersion(projectId, id);
      setRows((prev) => prev.map((x) => (x.id === id ? fresh : x)));
    } catch {
      message.error("加载配置失败");
    } finally {
      setLoading(false);
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
            审批流程配置
            {project ? ` — ${project.name}` : ""}
          </h2>
          {selectedRecord ? (
            <Tag
              color={
                (statusLabel[selectedRecord.status] ?? { color: "default" }).color
              }
            >
              {(
                statusLabel[selectedRecord.status] ?? { text: selectedRecord.status }
              ).text}
              {` v${selectedRecord.version}`}
            </Tag>
          ) : null}
          {selectedRecord ? (
            <Space size={6} wrap>
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
                  onPressEnter={() => setLabelEditing(false)}
                  onBlur={() => setLabelEditing(false)}
                  placeholder="可选：例如「2026 春季审批」"
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
              label: `v${r.version}（${statusLabel[r.status]?.text ?? r.status}）${
                r.label ? `：${r.label}` : ""
              }`,
            }))}
            onChange={(v) => onVersionChange(Number(v))}
          />
          {editing ? (
            <>
              <Button onClick={cancelEdit}>取消</Button>
              <Button type="primary" onClick={onSave} loading={loading}>
                保存
              </Button>
            </>
          ) : (
            <>
              <Button onClick={startEdit} disabled={!canEditSelected}>
                编辑流程
              </Button>
              {selectedRecord?.status === "draft" && (
                <Popconfirm
                  title="发布后新提交的申报将按此流程会签；原已发布版本将归档。确定？"
                  onConfirm={() => publish(selectedRecord)}
                >
                  <Button type="primary">发布</Button>
                </Popconfirm>
              )}
              <Button
                type="primary"
                onClick={async () => {
                  setLoading(true);
                  try {
                    await approvalFlowConfigApi.createApprovalFlowVersion(projectId, {});
                    message.success("已新建草稿版本");
                    notifyApprovalFlowListRefresh(projectId);
                    await loadAll();
                  } catch {
                    message.error("新建失败");
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                新建草稿版本
              </Button>
            </>
          )}
        </Space>
      </div>

      {loading && rows.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60 }}>
          <Spin size="large" />
        </div>
      ) : (
        <Card
          title="流程设计"
          extra={
            <Typography.Text type="secondary">
              {editing ? "编辑中" : "只读"}
            </Typography.Text>
          }
        >
          {selectedRecord ? (
            <ApprovalFlowCanvasEditor
              key={canvasMountKey}
              ref={canvasRef}
              steps={canvasSteps}
              readOnly={!editing}
              approverOptions={approverOptions}
            />
          ) : (
            <Typography.Text type="secondary">暂无可用版本</Typography.Text>
          )}
        </Card>
      )}
    </div>
  );
}
