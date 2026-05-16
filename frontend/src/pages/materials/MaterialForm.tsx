import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Drawer,
  Form,
  message,
  Modal,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  Upload,
} from "antd";
import { UploadOutlined } from "@ant-design/icons";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type { Material, Project } from "../../types";
import type { Attachment } from "../../types";
import * as materialService from "../../services/materials";
import type { MaterialValidationIssue } from "../../services/materials";
import type { MaterialReturnComment } from "../../services/materials";
import * as projectService from "../../services/projects";
import * as declarationConfigApi from "../../services/declarationConfig";
import {
  attachmentDownloadUrl,
  deleteAttachment,
  listAttachments,
  uploadAttachment,
} from "../../services/attachments";
import type { DeclarationConfigRecord } from "../../services/declarationConfig";
import {
  DeclarationConfigRenderer,
  emptyDeclarationDraft,
  normalizeDeclarationDraft,
  validateDeclarationDraftAttachments,
  validateDeclarationDraftForm,
  type DeclarationDraftShape,
} from "../../features/declaration-config-render";
import MaterialBasicInfoFromProfile from "./MaterialBasicInfoFromProfile";
import {
  isMaterialDone,
  materialStatusLabel,
  materialStepCount,
} from "../../utils/materialApproval";
import { previewMaterialMergedPdf } from "../../services/materials";
import { useAuth } from "../../store/AuthContext";
import "../declaration/profile/ProfileBasicConfig.css";
import "./MaterialForm.css";

function MaterialDeclarationBridge({
  value,
  onChange,
  config,
  variant,
  materialId,
  leadingTab,
}: {
  value?: unknown;
  onChange?: (v: DeclarationDraftShape) => void;
  config: Record<string, unknown>;
  variant?: "preview" | "fill";
  materialId?: number;
  leadingTab?: { key: string; label: React.ReactNode; children: React.ReactNode };
}) {
  return (
    <DeclarationConfigRenderer
      variant={variant ?? "fill"}
      config={config}
      moduleLayout={variant === "fill" ? "stack" : "tabs"}
      displayMode={variant === "fill" ? "print" : "standard"}
      draft={normalizeDeclarationDraft(value)}
      onDraftChange={onChange}
      materialId={materialId}
      leadingTab={leadingTab}
    />
  );
}

function getProfileBinding(config: Record<string, unknown>): Record<string, unknown> | null {
  const raw = config.profileBinding;
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

function isProfileBindingEnabled(config: Record<string, unknown>): boolean {
  const binding = getProfileBinding(config);
  return binding?.enabled !== false;
}

function isFilledProfileValue(value: unknown): boolean {
  if (value == null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function validateProfileBindingRequired(
  config: Record<string, unknown>,
  profileValues: Record<string, unknown>,
): string | null {
  const binding = getProfileBinding(config);
  if (!binding || binding.enabled === false) return null;
  const fields = Array.isArray(binding.fields) ? binding.fields : [];
  for (const raw of fields) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    if (item.required_in_project !== true) continue;
    const key = typeof item.field_key === "string" ? item.field_key : "";
    if (!key || isFilledProfileValue(profileValues[key])) continue;
    const label =
      typeof item.visible_label === "string" && item.visible_label.trim()
        ? item.visible_label.trim()
        : key;
    return `请先完善基本信息：${label}`;
  }
  return null;
}

function apiErrorMessage(error: unknown, fallback: string): string {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    return detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const msg = (item as Record<string, unknown>).message;
          return typeof msg === "string" ? msg : JSON.stringify(item);
        }
        return String(item);
      })
      .filter(Boolean)
      .slice(0, 3)
      .join("；");
  }
  return fallback;
}

export default function MaterialForm() {
  const { id } = useParams();
  const isEdit = Boolean(id && id !== "new");
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [form] = Form.useForm();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeDecl, setActiveDecl] = useState<DeclarationConfigRecord | null>(
    null,
  );
  const [declLoading, setDeclLoading] = useState(false);
  const [material, setMaterial] = useState<Material | null>(null);
  // 基本信息 tab 的数据（存到 content 顶层，单独保存）
  const [profileData, setProfileData] = useState<Record<string, unknown>>({});
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "dirty" | "saving" | "saved" | "failed">("idle");
  const serverRevisionRef = useRef<number | undefined>(undefined);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentLoading, setAttachmentLoading] = useState(false);
  const [returnComments, setReturnComments] = useState<MaterialReturnComment[]>([]);
  const [returnCommentLoading, setReturnCommentLoading] = useState(false);
  const declarationDraft = Form.useWatch("declaration", form);

  // 直接读 window.location，避免 React Router useLocation 的 stale 问题
  const newPidRaw = (() => {
    const urlPid = new URLSearchParams(window.location.search).get("project_id");
    if (urlPid) return urlPid;
    if (typeof location.state === "object" && location.state != null) {
      return String((location.state as Record<string, unknown>).project_id ?? null);
    }
    return null;
  })();
  const parsedNewPid =
    newPidRaw != null && newPidRaw !== "" ? Number(newPidRaw) : NaN;
  const newProjectIdOk = Number.isFinite(parsedNewPid) && parsedNewPid > 0;
  const resolvedProjectId = isEdit
    ? material?.project_id
    : newProjectIdOk
      ? parsedNewPid
      : undefined;

  const materialIsEditableStatus = Boolean(
    material &&
      (material.workflow_status != null
        ? ["draft", "returned", "rejected", "cancelled"].includes(material.workflow_status)
        : [0, 5].includes(material.status)),
  );
  const canEditMaterial = Boolean(
    isEdit && material && user && material.user_id === user.id && materialIsEditableStatus,
  );
  const readOnly = Boolean(isEdit && material && !canEditMaterial);

  useEffect(() => {
    if (isEdit) return;
    // 仅在 URL 有 ?project_id=xxx 但解析失败时才跳转回列表
    if (!newProjectIdOk && newPidRaw != null && newPidRaw !== "") {
      navigate("/declaration/materials", { replace: true });
    }
  }, [isEdit, navigate, newProjectIdOk, newPidRaw]);

  useEffect(() => {
    projectService.getProjects().then(setProjects);
    if (isEdit) {
      materialService.getMaterialEditContext(Number(id)).then((ctx) => {
        const m = ctx.material;
        setMaterial(m);
        setLastSavedAt(ctx.lastSavedAt ?? null);
        const content = ctx.draft ?? m.content ?? {};
        const { declaration: declFromContent } = content;
        const profileFromContent = content;
        // 基本信息存在 content 顶层，单独提取
        setProfileData(
          Object.fromEntries(
            Object.entries(profileFromContent).filter(
              ([k]) => k !== "declaration",
            ),
          ),
        );
        form.setFieldsValue({
          declaration: normalizeDeclarationDraft(declFromContent),
        });
      });
    }
  }, [id, isEdit, form]);

  useEffect(() => {
    if (resolvedProjectId == null || typeof resolvedProjectId !== "number") {
      setActiveDecl(null);
      return;
    }
    let cancelled = false;
    setDeclLoading(true);
    declarationConfigApi
      .getActiveDeclarationConfig(resolvedProjectId)
      .then((row) => {
        if (!cancelled) setActiveDecl(row);
      })
      .catch(() => {
        if (!cancelled) setActiveDecl(null);
      })
      .finally(() => {
        if (!cancelled) setDeclLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [resolvedProjectId]);

  const buildContent = useCallback(() => {
    const values = form.getFieldsValue();
    const { declaration } = values as { declaration?: Record<string, unknown> };
    return { ...profileData, declaration: declaration ?? {} } as Record<string, unknown>;
  }, [form, profileData]);

  const saveDraftNow = useCallback(
    async (saveType = "manual") => {
      if (!isEdit || !id || readOnly) return;
      const content = buildContent();
      setSaveState("saving");
      try {
        const result = await materialService.saveMaterialDraft(Number(id), {
          data: content,
          clientRevision: serverRevisionRef.current,
          saveType,
        });
        serverRevisionRef.current = result.serverRevision;
        setLastSavedAt(result.savedAt);
        setSaveState("saved");
      } catch {
        setSaveState("failed");
        throw new Error("保存失败");
      }
    },
    [buildContent, id, isEdit, readOnly],
  );

  useEffect(() => {
    if (!isEdit || !material || readOnly) return;
    setSaveState("dirty");
    const timer = window.setTimeout(() => {
      saveDraftNow("autosave").catch(() => {
        message.warning("自动保存失败，请稍后手动保存");
      });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [declarationDraft, profileData, isEdit, material, readOnly, saveDraftNow]);

  const onSave = async () => {
    const values = await form.validateFields();
    const { declaration } = values as { declaration?: Record<string, unknown> };
    // profileData 存在 content 顶层，和 declaration 平级
    const content: Record<string, unknown> = { ...profileData, declaration: declaration ?? {} };
    const pid = resolvedProjectId;
    if (!isEdit && (pid == null || typeof pid !== "number")) return;
    setLoading(true);
    try {
      if (isEdit) {
        await saveDraftNow("manual");
      } else {
        const created = await materialService.createMaterial({ project_id: pid!, content });
        message.success("保存成功");
        navigate(`/declaration/materials/${created.id}`);
        return;
      }
      message.success("保存成功");
    } catch {
      message.error("保存失败");
    } finally {
      setLoading(false);
    }
  };

  const showSubmitIssues = useCallback(
    (issues: Array<{ message: string; detail?: string }>) => {
      Modal.warning({
        title: "提交前请先补全申报内容",
        width: 560,
        content: (
          <Space direction="vertical" size="small" style={{ width: "100%" }}>
            {issues.slice(0, 8).map((item, index) => (
              <div key={`${item.message}-${index}`}>
                <Typography.Text>{item.message}</Typography.Text>
                {item.detail ? (
                  <Typography.Text type="secondary" style={{ display: "block", fontSize: 12 }}>
                    {item.detail}
                  </Typography.Text>
                ) : null}
              </div>
            ))}
            {issues.length > 8 ? (
              <Typography.Text type="secondary">
                还有 {issues.length - 8} 个问题，请继续补全后再提交。
              </Typography.Text>
            ) : null}
          </Space>
        ),
        okText: "知道了",
      });
    },
    [],
  );

  const issueDetail = (item: {
    moduleKey?: string | null;
    subKey?: string | null;
    sectionKey?: string | null;
    fieldKey?: string | null;
    attachmentKey?: string | null;
  }) =>
    [item.moduleKey, item.subKey, item.sectionKey, item.fieldKey || item.attachmentKey]
      .filter(Boolean)
      .join(" / ");

  const loadAttachments = useCallback(async () => {
    if (!isEdit || !id) return;
    setAttachmentLoading(true);
    try {
      setAttachments(await listAttachments(Number(id)));
    } catch {
      message.error("加载附件失败");
    } finally {
      setAttachmentLoading(false);
    }
  }, [id, isEdit]);

  const loadReturnComments = useCallback(async () => {
    if (!isEdit || !id) return;
    setReturnCommentLoading(true);
    try {
      setReturnComments(await materialService.listMaterialReturnComments(Number(id)));
    } catch {
      message.error("加载退回意见失败");
    } finally {
      setReturnCommentLoading(false);
    }
  }, [id, isEdit]);

  useEffect(() => {
    if (isEdit && material) void loadReturnComments();
  }, [isEdit, loadReturnComments, material]);

  const openAttachmentCenter = useCallback(() => {
    setAttachmentOpen(true);
    void loadAttachments();
  }, [loadAttachments]);

  /** 草稿：校验并保存内容后提交进入审批 */
  const onSubmit = async () => {
    if (!isEdit || !id) return;
    const values = await form.validateFields();
    const { declaration } = values as { declaration?: Record<string, unknown> };
    const content: Record<string, unknown> = { ...profileData, declaration: declaration ?? {} };

    const cfg =
      activeDecl?.config && typeof activeDecl.config === "object"
        ? activeDecl.config
        : { modules: [] };
    const profileError = validateProfileBindingRequired(
      cfg as Record<string, unknown>,
      profileData,
    );
    if (profileError) {
      showSubmitIssues([{ message: profileError }]);
      return;
    }
    const v = validateDeclarationDraftAttachments({
      config: cfg as Record<string, unknown>,
      draft: declaration ?? {},
    });
    if (!v.ok) {
      showSubmitIssues(v.errors.map((item) => ({ message: item.message, detail: issueDetail(item) })));
      return;
    }
    const vf = validateDeclarationDraftForm({
      config: cfg as Record<string, unknown>,
      draft: declaration ?? {},
    });
    if (!vf.ok) {
      showSubmitIssues(vf.errors.map((item) => ({ message: item.message, detail: issueDetail(item) })));
      return;
    }
    setLoading(true);
    try {
      await materialService.saveMaterialDraft(Number(id), {
        data: content,
        clientRevision: serverRevisionRef.current,
        saveType: "manual",
      });
      const backendValidation = await materialService.validateMaterial(Number(id), {
        data: content,
        scope: "all",
      });
      if (!backendValidation.valid) {
        showSubmitIssues(
          backendValidation.errors.map((item: MaterialValidationIssue) => ({
            message: item.message,
            detail: issueDetail(item),
          })),
        );
        return;
      }
      const m = await materialService.submitMaterial(Number(id));
      setMaterial(m);
      message.success("已提交审批");
    } catch (error) {
      message.error(apiErrorMessage(error, "提交失败，请确认已保存为草稿且内容完整"));
    } finally {
      setLoading(false);
    }
  };

  const openPdfPreview = useCallback(async () => {
    if (!material) return;
    setPdfOpen(true);
    setPdfLoading(true);
    try {
      if (!readOnly) {
        await saveDraftNow("manual");
      }
      const blob = await previewMaterialMergedPdf(material.id);
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    } catch {
      message.error("生成预览失败");
      setPdfOpen(false);
    } finally {
      setPdfLoading(false);
    }
  }, [material, readOnly, saveDraftNow]);

  useEffect(() => {
    if (!pdfOpen && pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
      setPdfUrl(null);
    }
  }, [pdfOpen, pdfUrl]);

  const projectLabel =
    resolvedProjectId != null
      ? projects.find((p) => p.id === resolvedProjectId)?.name ??
        `项目 #${resolvedProjectId}`
      : null;

  const headerTitleText = `${projectLabel ? `${projectLabel} · ` : ""}${isEdit ? "编辑申报" : "新建申报"}`;
  const activeConfig =
    activeDecl?.config && typeof activeDecl.config === "object"
      ? activeDecl.config
      : { modules: [] };
  const profileBinding = getProfileBinding(activeConfig);

  return (
    <div className="materialFormPage">
      <div className="profilePageHeader profileFirstSectionHeader materialFormHeader">
        <div className="profilePageHeaderTitleGroup">
          <h2 className="profileSectionTitle profileSectionTitlePrimary">{headerTitleText}</h2>
          {isEdit && material != null ? (
            <Tag
              className="profileFormStatusTag"
              color={
                material.status === 5
                || material.workflow_status === "returned"
                || material.workflow_status === "rejected"
                  ? "red"
                  : isMaterialDone(material)
                    ? "green"
                    : "blue"
              }
            >
              {materialStatusLabel(
                material.status,
                materialStepCount(material),
                material.workflow_status,
                material.current_step_index,
              )}
            </Tag>
          ) : null}
          {isEdit && canEditMaterial ? (
            <Tag
              color={
                saveState === "failed"
                  ? "red"
                  : saveState === "saving"
                    ? "blue"
                    : saveState === "saved"
                      ? "green"
                      : "default"
              }
            >
              {saveState === "saving"
                ? "保存中"
                : saveState === "failed"
                  ? "保存失败"
                  : saveState === "dirty"
                    ? "有未保存修改"
                    : lastSavedAt
                      ? `已保存 ${new Date(lastSavedAt).toLocaleTimeString()}`
                      : "自动保存已启用"}
            </Tag>
          ) : null}
        </div>
        <Space className="profileFirstSectionActions" size="middle">
          <Button onClick={() => navigate("/declaration/materials")}>取消</Button>
          {isEdit && material != null && (
            <Button onClick={openPdfPreview}>
              打印预览
            </Button>
          )}
          {isEdit && material != null ? (
            <Button onClick={openAttachmentCenter}>附件中心</Button>
          ) : null}
          {!isEdit || canEditMaterial ? (
            <Button onClick={onSave} loading={loading}>
              {isEdit ? "保存" : "保存草稿"}
            </Button>
          ) : null}
          {isEdit && material != null && canEditMaterial ? (
            <Button type="primary" onClick={onSubmit} loading={loading}>
              {material.workflow_status === "returned" || material.workflow_status === "rejected" || material.status === 5
                ? "重新提交"
                : "提交"}
            </Button>
          ) : null}
        </Space>
      </div>

      {isEdit && returnComments.length > 0 ? (
        <Card
          className="materialReturnCommentCard"
          size="small"
          loading={returnCommentLoading}
          title="退回意见"
          extra={
            <Tag color={returnComments.some((item) => !item.resolved) ? "red" : "green"}>
              {returnComments.filter((item) => !item.resolved).length} 条待处理
            </Tag>
          }
        >
          <Space direction="vertical" size="small" style={{ width: "100%" }}>
            {returnComments.map((item) => (
              <Alert
                key={item.approveRecordId}
                type={item.resolved ? "success" : "warning"}
                showIcon
                message={
                  <Space wrap>
                    <span>
                      {item.action === "return" ? "退回意见" : "驳回意见"}
                      {item.approverName ? ` · ${item.approverName}` : ""}
                    </span>
                    <Tag>{item.resolved ? "已处理" : "待处理"}</Tag>
                  </Space>
                }
                description={
                  <div>
                    <Typography.Paragraph style={{ marginBottom: 8 }}>
                      {item.comment || "未填写意见"}
                    </Typography.Paragraph>
                    <Space wrap>
                      {[item.moduleKey, item.sectionKey, item.fieldKey || item.attachmentKey]
                        .filter(Boolean)
                        .join(" / ") || "整份材料"}
                      <Button
                        size="small"
                        type={item.resolved ? "default" : "primary"}
                        onClick={async () => {
                          try {
                            await materialService.resolveMaterialReturnComment(
                              Number(id),
                              item.approveRecordId,
                              !item.resolved,
                            );
                            await loadReturnComments();
                          } catch {
                            message.error("更新处理状态失败");
                          }
                        }}
                      >
                        {item.resolved ? "标记未处理" : "标记已处理"}
                      </Button>
                    </Space>
                  </div>
                }
              />
            ))}
          </Space>
        </Card>
      ) : null}

      <Form
        form={form}
        layout="vertical"
        className="materialForm"
        initialValues={{ declaration: emptyDeclarationDraft() }}
      >
        {isEdit && material == null ? (
          <div className="materialFormLoading">
            <Spin size="large" />
          </div>
        ) : resolvedProjectId != null ? (
          <div className="materialFormDeclStructure">
            <Spin spinning={declLoading}>
              {!declLoading ? (
                <Form.Item
                  key={resolvedProjectId}
                  name="declaration"
                  initialValue={emptyDeclarationDraft()}
                  noStyle
                >
                  <MaterialDeclarationBridge
                    variant={readOnly ? "preview" : "fill"}
                    config={activeConfig}
                    materialId={material?.id}
                    leadingTab={
                      resolvedProjectId != null && !declLoading && isProfileBindingEnabled(activeConfig)
                        ? {
                            key: "basic",
                            label: "基本信息",
                            children: (
                              <MaterialBasicInfoFromProfile
                                onFieldsLoaded={setProfileData}
                                profileBinding={profileBinding}
                                framed={false}
                              />
                            ),
                          }
                        : undefined
                    }
                  />
                </Form.Item>
              ) : null}
            </Spin>
          </div>
        ) : null}
      </Form>

      <Modal
        open={pdfOpen}
        onCancel={() => setPdfOpen(false)}
        footer={null}
        width={720}
        title="打印预览"
      >
        {pdfLoading ? (
          <div style={{ textAlign: "center", padding: 40 }}>
            <Spin size="large" />
            <div style={{ marginTop: 16 }}>正在生成预览…</div>
          </div>
        ) : pdfUrl ? (
          <iframe
            className="materialFormPdfFrame"
            src={pdfUrl}
            title="pdf-preview"
          />
        ) : null}
      </Modal>

      <Drawer
        title="附件中心"
        open={attachmentOpen}
        onClose={() => setAttachmentOpen(false)}
        width={720}
      >
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          {canEditMaterial && material ? (
            <Upload
              showUploadList={false}
              customRequest={async (options) => {
                try {
                  const file = options.file as File;
                  await uploadAttachment(material.id, file);
                  options.onSuccess?.({});
                  message.success("上传成功");
                  await loadAttachments();
                } catch {
                  options.onError?.(new Error("upload failed"));
                  message.error("上传失败");
                }
              }}
            >
              <Button icon={<UploadOutlined />}>上传补充附件</Button>
            </Upload>
          ) : null}
          <Typography.Text type="secondary">
            字段或表格行中的必传附件仍建议在对应位置上传；这里用于集中查看和补充材料。
          </Typography.Text>
          <Table<Attachment>
            size="small"
            rowKey="id"
            loading={attachmentLoading}
            dataSource={attachments}
            pagination={false}
            columns={[
              {
                title: "文件名",
                dataIndex: "file_name",
                ellipsis: true,
                render: (value: string, row) => (
                  <a href={attachmentDownloadUrl(row.id)} target="_blank" rel="noreferrer">
                    {value}
                  </a>
                ),
              },
              {
                title: "类型",
                dataIndex: "file_type",
                width: 90,
                render: (value?: string) => value || "—",
              },
              {
                title: "大小",
                dataIndex: "file_size",
                width: 110,
                render: (value?: number) =>
                  typeof value === "number" ? `${Math.ceil(value / 1024)} KB` : "—",
              },
              {
                title: "操作",
                key: "action",
                width: 88,
                render: (_, row) =>
                  !canEditMaterial ? null : (
                    <Button
                      type="link"
                      danger
                      size="small"
                      onClick={async () => {
                        try {
                          await deleteAttachment(row.id);
                          message.success("已删除");
                          await loadAttachments();
                        } catch {
                          message.error("删除失败");
                        }
                      }}
                    >
                      删除
                    </Button>
                  ),
              },
            ]}
          />
        </Space>
      </Drawer>
    </div>
  );
}
