import { useEffect, useState } from "react";
import { Form, Button, message, Space, Spin, Tag } from "antd";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
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
  type DeclarationConfigRendererProps,
} from "../../features/declaration-config-render";
import MaterialBasicInfoFromProfile from "./MaterialBasicInfoFromProfile";
import {
  isMaterialDone,
  materialStatusLabel,
  materialStepCount,
} from "../../utils/materialApproval";
import "../declaration/profile/ProfileBasicConfig.css";
import "./MaterialForm.css";

function MaterialDeclarationBridge({
  value,
  onChange,
  config,
  leadingTab,
  variant,
  materialId,
}: {
  value?: unknown;
  onChange?: (v: DeclarationDraftShape) => void;
  config: Record<string, unknown>;
  leadingTab: DeclarationConfigRendererProps["leadingTab"];
  variant?: "preview" | "fill";
  materialId?: number;
}) {
  return (
    <DeclarationConfigRenderer
      variant={variant ?? "fill"}
      config={config}
      moduleLayout="tabs"
      draft={normalizeDeclarationDraft(value)}
      onDraftChange={onChange}
      leadingTab={leadingTab}
      materialId={materialId}
    />
  );
}

export default function MaterialForm() {
  const { id } = useParams();
  const isEdit = id && id !== "new";
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form] = Form.useForm();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeDecl, setActiveDecl] = useState<DeclarationConfigRecord | null>(
    null,
  );
  const [declLoading, setDeclLoading] = useState(false);
  const [material, setMaterial] = useState<Material | null>(null);

  const newPidRaw = searchParams.get("project_id");
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
    if (newProjectIdOk) return;
    navigate("/declaration/materials", { replace: true });
  }, [isEdit, newProjectIdOk, navigate]);

  useEffect(() => {
    projectService.getProjects().then(setProjects);
    if (isEdit) {
      materialService.getMaterial(Number(id)).then((m) => {
        setMaterial(m);
        const { declaration: declFromContent } = m.content ?? {};
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
    const content = {
      declaration: declaration ?? {},
    };
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
    const content = { declaration: declaration ?? {} };

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

  const basicInfoTab = {
    key: "material_profile_basic",
    label: "基本信息",
    children: <MaterialBasicInfoFromProfile />,
  } as const;

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
                    leadingTab={basicInfoTab}
                    materialId={material?.id}
                  />
                </Form.Item>
              ) : null}
            </Spin>
          </div>
        ) : null}
      </Form>
    </div>
  );
}
