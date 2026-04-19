import { useCallback, useEffect, useState } from "react";
import { Form, Button, message, Space, Spin, Tag, Modal, Segmented } from "antd";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type { Material, Project } from "../../types";
import * as materialService from "../../services/materials";
import * as projectService from "../../services/projects";
import * as declarationConfigApi from "../../services/declarationConfig";
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
import PdfJsBlobViewer from "../../components/PdfJsBlobViewer";
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
      moduleLayout="tabs"
      draft={normalizeDeclarationDraft(value)}
      onDraftChange={onChange}
      materialId={materialId}
      leadingTab={leadingTab}
    />
  );
}

export default function MaterialForm() {
  const { id } = useParams();
  const isEdit = Boolean(id && id !== "new");
  const navigate = useNavigate();
  const location = useLocation();
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
  const [pdfViewerMode, setPdfViewerMode] = useState<"system" | "light">("system");

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

  const readOnly = Boolean(isEdit && material && material.status !== 0);

  useEffect(() => {
    if (isEdit) return;
    // 仅在 URL 有 ?project_id=xxx 但解析失败时才跳转回列表
    if (!newProjectIdOk && newPidRaw != null && newPidRaw !== "") {
      navigate("/declaration/materials", { replace: true });
    }
  }, [isEdit, newProjectIdOk, newPidRaw]);

  useEffect(() => {
    projectService.getProjects().then(setProjects);
    if (isEdit) {
      materialService.getMaterial(Number(id)).then((m) => {
        setMaterial(m);
        const { declaration: declFromContent } = m.content ?? {};
        const profileFromContent = (m.content as Record<string, unknown>) ?? {};
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
        await materialService.updateMaterial(Number(id), { content });
      } else {
        await materialService.createMaterial({ project_id: pid!, content });
      }
      message.success("保存成功");
      navigate("/declaration/materials");
    } catch {
      message.error("保存失败");
    } finally {
      setLoading(false);
    }
  };

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
    const v = validateDeclarationDraftAttachments({
      config: cfg as Record<string, unknown>,
      draft: declaration ?? {},
    });
    if (!v.ok) {
      message.error(v.errors[0]?.message ?? "请补齐必填附件");
      return;
    }
    const vf = validateDeclarationDraftForm({
      config: cfg as Record<string, unknown>,
      draft: declaration ?? {},
    });
    if (!vf.ok) {
      message.error(vf.errors[0]?.message ?? "请补齐必填项");
      return;
    }
    setLoading(true);
    try {
      await materialService.updateMaterial(Number(id), { content });
      const m = await materialService.submitMaterial(Number(id));
      setMaterial(m);
      message.success("已提交审批");
    } catch {
      message.error("提交失败，请确认已保存为草稿且内容完整");
    } finally {
      setLoading(false);
    }
  };

  const openPdfPreview = useCallback(async () => {
    if (!material) return;
    setPdfOpen(true);
    setPdfLoading(true);
    try {
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
  }, [material]);

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
                  ? "red"
                  : isMaterialDone(material)
                    ? "green"
                    : "blue"
              }
            >
              {materialStatusLabel(
                material.status,
                materialStepCount(material),
              )}
            </Tag>
          ) : null}
        </div>
        <Space className="profileFirstSectionActions" size="middle">
          <Button onClick={() => navigate("/declaration/materials")}>取消</Button>
          {isEdit && material != null && (
            <Button onClick={openPdfPreview}>预览PDF</Button>
          )}
          {!readOnly ? (
            <Button onClick={onSave} loading={loading}>
              保存
            </Button>
          ) : null}
          {isEdit && material?.status === 0 ? (
            <Button type="primary" onClick={onSubmit} loading={loading}>
              提交
            </Button>
          ) : null}
        </Space>
      </div>

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
                    config={
                      activeDecl?.config && typeof activeDecl.config === "object"
                        ? activeDecl.config
                        : { modules: [] }
                    }
                    materialId={material?.id}
                    leadingTab={
                      resolvedProjectId != null && !declLoading
                        ? {
                            key: "basic",
                            label: "基本信息",
                            children: (
                              <MaterialBasicInfoFromProfile onFieldsLoaded={setProfileData} />
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
        title="PDF 预览"
      >
        {pdfLoading ? (
          <div style={{ textAlign: "center", padding: 40 }}>
            <Spin size="large" />
            <div style={{ marginTop: 16 }}>正在生成预览…</div>
          </div>
        ) : pdfUrl ? (
          <>
            <div style={{ marginBottom: 12 }}>
              <Segmented
                value={pdfViewerMode}
                onChange={(v) => setPdfViewerMode(v as "system" | "light")}
                options={[
                  { label: "系统查看器", value: "system" },
                  { label: "轻量查看器", value: "light" },
                ]}
              />
            </div>
            {pdfViewerMode === "light" ? (
              <PdfJsBlobViewer url={pdfUrl} />
            ) : (
              <iframe
                className="materialFormPdfFrame"
                src={pdfUrl}
                title="pdf-preview"
              />
            )}
          </>
        ) : null}
      </Modal>
    </div>
  );
}
