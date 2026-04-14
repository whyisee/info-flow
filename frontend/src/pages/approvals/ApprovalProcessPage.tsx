import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Image,
  Input,
  Modal,
  Select,
  Space,
  Tabs,
  Segmented,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import { InfoCircleOutlined } from "@ant-design/icons";
import type { ApprovalRecord, Material, Project } from "../../types";
import { materialStatusLabel, materialStepCount } from "../../utils/materialApproval";
import * as approvalService from "../../services/approvals";
import * as materialService from "../../services/materials";
import * as projectService from "../../services/projects";
import PdfJsBlobViewer from "../../components/PdfJsBlobViewer";
import { previewMaterialMergedPdf } from "../../services/materials";
import request from "../../services/request";
import * as declarationConfigApi from "../../services/declarationConfig";
import type { DeclarationConfigRecord } from "../../services/declarationConfig";
import { DeclarationConfigRenderer, normalizeDeclarationDraft } from "../../features/declaration-config-render";
import "../../features/declaration-config-render/DeclarationConfigRenderer.css";
import { listUserModuleConfigs, type UserModuleConfigDTO } from "../../services/moduleConfig";
import { mergeModulesIntoFormValues } from "../declaration/profile/profileModuleFields";
import { NATIONALITY_OPTIONS } from "../../data/nationalityOptions";
import { HIGHEST_DEGREE_LEVEL_OPTIONS, HIGHEST_EDUCATION_LEVEL_OPTIONS } from "../../data/educationDegreeOptions";
import { useDictFlatItems } from "../../hooks/useDictFlatItems";
import { getProfileFileUrlFromUploadFile } from "../../services/profileFile";
import type { UploadFile } from "antd/es/upload/interface";
import MaterialApprovalProgress from "../materials/MaterialApprovalProgress";
import "./ApprovalProcessPage.css";

const STATUS_COLORS: Record<number, string> = {
  0: "default",
  1: "processing",
  2: "blue",
  3: "cyan",
  4: "green",
  5: "red",
};

function renderValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return v.trim() ? v : "—";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

type Option = { value: string; label: string };
function mapOption(options: readonly Option[], raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  const hit = options.find((o) => o.value === raw);
  return hit ? hit.label : null;
}

type KVItem = { key: string; label: string; value: unknown; span?: number };
function toDescItems(
  list: KVItem[],
  renderV: (key: string, v: unknown) => React.ReactNode,
) {
  return list.map((it) => ({
    key: it.key,
    label: it.label,
    span: it.span,
    children: renderV(it.key, it.value),
  }));
}

function firstProfileUploadUrl(v: unknown): string | undefined {
  if (!Array.isArray(v)) return undefined;
  for (const raw of v) {
    const u = getProfileFileUrlFromUploadFile(raw as UploadFile);
    if (u?.trim()) return u.trim();
  }
  return undefined;
}

function firstProfileUploadName(v: unknown): string | undefined {
  if (!Array.isArray(v)) return undefined;
  for (const raw of v) {
    const f = raw as UploadFile;
    if (f?.status === "removed") continue;
    if (typeof f?.name === "string" && f.name.trim()) return f.name.trim();
  }
  return undefined;
}

const CHINA_REGION_PROVINCE_DICT = "china_region_province";
const TASK_POST_DICT = "task_post";
const SUBJECT_DIRECTION_DICT = "subject_direction";
const TASK_KEYWORD_DICT = "task_keyword";
const RESEARCH_CATEGORY_DICT = "research_category";
const SCI_RESEARCH_CLASS_DICT = "sci_research_class";

const ID_TYPE_LABELS: Record<string, string> = {
  id_card: "居民身份证",
  passport: "护照",
  hk_macao_permit: "港澳居民来往内地通行证",
  tw_permit: "台湾居民来往大陆通行证",
  foreign_perm_residence: "外国人永久居留身份证",
  other: "其他",
};

export default function ApprovalProcessPage() {
  const navigate = useNavigate();
  const { materialId } = useParams();
  const mid = Number(materialId);

  const [material, setMaterial] = useState<Material | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [pendingRecord, setPendingRecord] = useState<ApprovalRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [laneIndex, setLaneIndex] = useState<number | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [processOpen, setProcessOpen] = useState(false);
  const [processActionLoading, setProcessActionLoading] = useState<null | "approve" | "reject">(null);
  const [processComment, setProcessComment] = useState("");
  const [declCfg, setDeclCfg] = useState<DeclarationConfigRecord | null>(null);
  const [declCfgLoading, setDeclCfgLoading] = useState(false);
  const [profileRows, setProfileRows] = useState<UserModuleConfigDTO[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfViewerMode, setPdfViewerMode] = useState<"system" | "light">("system");

  const regionFlat = useDictFlatItems(CHINA_REGION_PROVINCE_DICT);
  const taskFlat = useDictFlatItems(TASK_POST_DICT);
  const subjectFlat = useDictFlatItems(SUBJECT_DIRECTION_DICT);
  const keywordFlat = useDictFlatItems(TASK_KEYWORD_DICT);
  const researchCatFlat = useDictFlatItems(RESEARCH_CATEGORY_DICT);
  const sciResearchFlat = useDictFlatItems(SCI_RESEARCH_CLASS_DICT);

  const dictMap = useMemo(() => {
    const toMap = (flat: { value: string; label: string }[]) => {
      const m = new Map<string, string>();
      flat.forEach((x) => m.set(x.value, x.label));
      return m;
    };
    return {
      region: toMap(regionFlat),
      task: toMap(taskFlat),
      subject: toMap(subjectFlat),
      keyword: toMap(keywordFlat),
      researchCat: toMap(researchCatFlat),
      sciResearch: toMap(sciResearchFlat),
    };
  }, [keywordFlat, regionFlat, researchCatFlat, sciResearchFlat, subjectFlat, taskFlat]);

  const openAuthedFileInNewTab = useCallback(async (url: string, displayName?: string) => {
    try {
      const blob = (await request.get(url.replace(/^\/api/, ""), {
        responseType: "blob",
      })) as Blob;
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, "_blank", "noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch {
      message.error(displayName ? `打开失败：${displayName}` : "打开失败");
    }
  }, []);

  const renderProfileValue = useCallback(
    (key: string, v: unknown): React.ReactNode => {
      // 上传字段（证件照 / pdf）
      if (key === "id_photo") {
        const list = Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
        const first = list.find((x) => typeof x?.url === "string" && (x.url as string).trim());
        const url = first && typeof first.url === "string" ? first.url : null;
        if (!url) return "—";
        return (
          <div className="approvalProcessProfilePhotoCell">
            <Image
              src={`/api/${url}`}
              alt="证件照片"
              width={120}
              height={160}
              style={{ objectFit: "cover" }}
            />
          </div>
        );
      }
      if (
        key === "id_pdf" ||
        key === "birth_proof_pdf" ||
        key === "highest_edu_proof_pdf" ||
        key === "highest_degree_proof_pdf"
      ) {
        const url = firstProfileUploadUrl(v);
        const name = firstProfileUploadName(v) ?? "查看附件";
        if (!url) {
          const hint = firstProfileUploadName(v);
          if (hint) {
            return (
              <Space size={6} align="center">
                <Typography.Text type="secondary">{hint}</Typography.Text>
                <Tooltip
                  title={`已记录「${hint}」，但缺少可下载地址；请申请人在基本信息中重新上传该 PDF 后再预览。`}
                >
                  <InfoCircleOutlined className="approvalProcessUploadHintIcon" />
                </Tooltip>
              </Space>
            );
          }
          return "—";
        }
        return (
          <Button
            type="link"
            style={{ padding: 0, height: "auto" }}
            onClick={() => openAuthedFileInNewTab(`/api/${url}`, name || "附件")}
          >
            {name || "查看附件"}
          </Button>
        );
      }

      const s = typeof v === "string" ? v : null;
      if (!s) return renderValue(v);

      // 固定枚举 / options
      if (key === "gender") {
        if (s === "male") return "男";
        if (s === "female") return "女";
      }
      if (key === "nationality" || key === "highest_edu_country" || key === "highest_degree_country") {
        const label = mapOption(NATIONALITY_OPTIONS as readonly Option[], s);
        if (label) return label;
      }
      if (key === "highest_edu_level") {
        const label = mapOption(HIGHEST_EDUCATION_LEVEL_OPTIONS as readonly Option[], s);
        if (label) return label;
      }
      if (key === "highest_degree_level") {
        const label = mapOption(HIGHEST_DEGREE_LEVEL_OPTIONS as readonly Option[], s);
        if (label) return label;
      }
      if (key === "office_level") {
        if (s === "none") return "无";
        if (s === "county") return "处级";
        if (s === "bureau") return "厅局级";
      }
      if (key === "id_type_display") {
        return ID_TYPE_LABELS[s] ?? s;
      }

      // 系统字典（与编辑页一致）
      if (key === "work_region" || key === "work_province") {
        return dictMap.region.get(s) ?? s;
      }
      if (key.startsWith("task_pos")) {
        return dictMap.task.get(s) ?? s;
      }
      if (key.startsWith("subject_")) {
        return dictMap.subject.get(s) ?? s;
      }
      if (key === "kw_cat") {
        return dictMap.keyword.get(s) ?? s;
      }
      if (key === "research_major") {
        return dictMap.researchCat.get(s) ?? s;
      }
      if (key === "research_sub") {
        return dictMap.sciResearch.get(s) ?? s;
      }

      return s;
    },
    [dictMap, openAuthedFileInNewTab],
  );

  const pendingLanes = pendingRecord?.pending_parallel_lane_indexes ?? null;
  const needLanePick = useMemo(() => {
    return Boolean(pendingLanes && pendingLanes.length > 1);
  }, [pendingLanes]);

  const reload = useCallback(async () => {
    if (!Number.isFinite(mid) || mid <= 0) return;
    setLoading(true);
    try {
      const m = await materialService.getMaterial(mid);
      setMaterial(m);
      const pid = m.project_id;
      const [p, pendings] = await Promise.all([
        projectService.getProject(pid).catch(() => null),
        approvalService.getPendingApprovals().catch(() => [] as ApprovalRecord[]),
      ]);
      setProject(p);
      const pr = (pendings ?? []).find((r) => r.material_id === mid) ?? null;
      setPendingRecord(pr);
      const lanes = pr?.pending_parallel_lane_indexes ?? null;
      if (lanes && lanes.length === 1) {
        setLaneIndex(lanes[0]);
      }
    } catch {
      message.error("加载审批信息失败");
    } finally {
      setLoading(false);
    }
  }, [mid]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!material) {
      setDeclCfg(null);
      return;
    }
    let cancelled = false;
    setDeclCfgLoading(true);
    declarationConfigApi
      .getActiveDeclarationConfig(material.project_id)
      .then((row) => {
        if (!cancelled) setDeclCfg(row);
      })
      .catch(() => {
        if (!cancelled) setDeclCfg(null);
      })
      .finally(() => {
        if (!cancelled) setDeclCfgLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [material?.project_id]);

  useEffect(() => {
    if (!material) {
      setProfileRows([]);
      return;
    }
    let cancelled = false;
    setProfileLoading(true);
    listUserModuleConfigs(material.user_id)
      .then((rows) => {
        if (!cancelled) setProfileRows(rows);
      })
      .catch(() => {
        if (!cancelled) setProfileRows([]);
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [material?.user_id]);

  const openPdfPreview = useCallback(async () => {
    if (!material) return;
    setPdfOpen(true);
    setPdfLoading(true);
    try {
      const blob = await previewMaterialMergedPdf(material.id);
      const url = URL.createObjectURL(blob);
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch {
      message.error("PDF 预览加载失败");
      setPdfOpen(false);
    } finally {
      setPdfLoading(false);
    }
  }, [material]);

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  const profileMerged = useMemo(() => {
    return mergeModulesIntoFormValues(
      profileRows.map((r) => ({
        module: r.module,
        config: r.config && typeof r.config === "object" ? r.config : {},
      })),
    );
  }, [profileRows]);

  const profilePreviewItems = useMemo(() => {
    const v = (k: string) => profileMerged[k];
    return [
      { key: "full_name", label: "姓名", value: v("full_name") },
      { key: "gender", label: "性别", value: v("gender") },
      { key: "nationality", label: "国籍", value: v("nationality") },
      { key: "birth_date", label: "出生日期", value: v("birth_date") },
      { key: "id_type_display", label: "身份证件类型", value: v("id_type_display") },
      { key: "id_number", label: "证件号码", value: v("id_number") },
      { key: "id_pdf", label: "证件(pdf)", value: v("id_pdf") },
      { key: "birth_proof_pdf", label: "特殊证明", value: v("birth_proof_pdf") },
      { key: "highest_edu_country", label: "最高学历国家/地区", value: v("highest_edu_country") },
      { key: "highest_edu_school", label: "最高学历学校", value: v("highest_edu_school") },
      { key: "highest_edu_level", label: "最高学历层次", value: v("highest_edu_level") },
      { key: "highest_edu_proof_pdf", label: "最高学历证明", value: v("highest_edu_proof_pdf") },
      { key: "highest_degree_country", label: "最高学位国家/地区", value: v("highest_degree_country") },
      { key: "highest_degree_school", label: "最高学位学校", value: v("highest_degree_school") },
      { key: "highest_degree_level", label: "最高学位层次", value: v("highest_degree_level") },
      { key: "highest_degree_proof_pdf", label: "最高学位证明", value: v("highest_degree_proof_pdf") },
      { key: "work_region", label: "现任职单位区域", value: v("work_region") },
      { key: "work_province", label: "现任职单位省份", value: v("work_province") },
      { key: "mobile", label: "手机号", value: v("mobile") },
      { key: "phone_home", label: "家庭电话", value: v("phone_home") },
      { key: "phone_office", label: "办公电话", value: v("phone_office") },
      { key: "fax", label: "传真", value: v("fax") },
      { key: "email", label: "邮箱", value: v("email") },
      { key: "address", label: "通讯地址", value: v("address"), span: 2 },
      { key: "postal_code", label: "邮编", value: v("postal_code") },
      { key: "work_unit_detail", label: "现任职单位", value: v("work_unit_detail"), span: 2 },
      { key: "unit_attr_display", label: "单位属性", value: v("unit_attr_display") },
      { key: "tech_title", label: "职称", value: v("tech_title") },
      { key: "admin_title", label: "行政职务", value: v("admin_title") },
      { key: "office_level", label: "任职级别", value: v("office_level") },
    ];
  }, [profileMerged]);

  const idPhotoUrl = useMemo(() => {
    const v = profileMerged["id_photo"];
    const list = Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
    const first = list.find((x) => typeof x?.url === "string" && (x.url as string).trim());
    const url = first && typeof first.url === "string" ? first.url : null;
    return url ? `/api/${url}` : null;
  }, [profileMerged]);

  const [idPhotoBlobUrl, setIdPhotoBlobUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!idPhotoUrl) {
        setIdPhotoBlobUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return null;
        });
        return;
      }
      try {
        const blob = (await request.get(idPhotoUrl.replace(/^\/api/, ""), {
          responseType: "blob",
        })) as Blob;
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        setIdPhotoBlobUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      } catch {
        setIdPhotoBlobUrl(null);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [idPhotoUrl]);

  const taskKeywordItems = useMemo(() => {
    const v = (k: string) => profileMerged[k];
    return [
      { key: "task_pos1_a", label: "岗位1-研究方向A", value: v("task_pos1_a") },
      { key: "task_pos1_b", label: "岗位1-研究方向B", value: v("task_pos1_b") },
      { key: "task_pos2_a", label: "岗位2-研究方向A", value: v("task_pos2_a") },
      { key: "task_pos2_b", label: "岗位2-研究方向B", value: v("task_pos2_b") },
      { key: "subject_a1", label: "学科门类A1", value: v("subject_a1") },
      { key: "subject_a2", label: "学科门类A2", value: v("subject_a2") },
      { key: "subject_a3", label: "学科门类A3", value: v("subject_a3") },
      { key: "subject_b1", label: "学科门类B1", value: v("subject_b1") },
      { key: "subject_b2", label: "学科门类B2", value: v("subject_b2") },
      { key: "subject_b3", label: "学科门类B3", value: v("subject_b3") },
      { key: "research_major", label: "研究方向", value: v("research_major") },
      { key: "research_sub", label: "研究子方向", value: v("research_sub") },
      { key: "kw_cat", label: "关键词类别", value: v("kw_cat") },
      { key: "kw1", label: "关键词1", value: v("kw1") },
      { key: "kw2", label: "关键词2", value: v("kw2") },
      { key: "kw3", label: "关键词3", value: v("kw3") },
      { key: "task_desc", label: "岗位/任务描述", value: v("task_desc"), span: 2 },
    ];
  }, [profileMerged]);

  const supervisorRecuseItems = useMemo(() => {
    const v = (k: string) => profileMerged[k];
    return [
      { key: "master_sup_1", label: "硕士导师1", value: v("master_sup_1") },
      { key: "master_sup_2", label: "硕士导师2", value: v("master_sup_2") },
      { key: "master_sup_3", label: "硕士导师3", value: v("master_sup_3") },
      { key: "phd_sup_1", label: "博士导师1", value: v("phd_sup_1") },
      { key: "phd_sup_2", label: "博士导师2", value: v("phd_sup_2") },
      { key: "phd_sup_3", label: "博士导师3", value: v("phd_sup_3") },
      { key: "postdoc_sup_1", label: "博士后合作导师1", value: v("postdoc_sup_1") },
      { key: "postdoc_sup_2", label: "博士后合作导师2", value: v("postdoc_sup_2") },
      { key: "postdoc_sup_3", label: "博士后合作导师3", value: v("postdoc_sup_3") },
      { key: "family_rel_1", label: "家庭关系回避1", value: v("family_rel_1") },
      { key: "family_rel_2", label: "家庭关系回避2", value: v("family_rel_2") },
      { key: "family_rel_3", label: "家庭关系回避3", value: v("family_rel_3") },
      { key: "recuse_exp_1", label: "需回避专家1", value: v("recuse_exp_1") },
      { key: "recuse_exp_2", label: "需回避专家2", value: v("recuse_exp_2") },
      { key: "recuse_exp_3", label: "需回避专家3", value: v("recuse_exp_3") },
    ];
  }, [profileMerged]);

  const n = material ? materialStepCount(material) : pendingRecord?.approval_step_count ?? 3;
  const phaseLabel = material && typeof material.status === "number" ? materialStatusLabel(material.status, n) : "—";
  const phaseColor =
    material && typeof material.status === "number"
      ? material.status === 0
        ? "default"
        : material.status === 5
          ? "red"
          : material.status === n + 1
            ? "green"
            : STATUS_COLORS[material.status] ?? "processing"
      : "default";

  const laneOptions = useMemo(() => {
    if (!pendingLanes) return [];
    return pendingLanes.map((i) => ({ value: i, label: `子轨 ${i + 1}` }));
  }, [pendingLanes]);

  const doAction = useCallback(
    async (action: "approve" | "reject", comment: string, lane_index?: number | null) => {
      if (!material) return;
      if (action === "approve" && needLanePick) {
        if (laneIndex == null) {
          message.error("请选择并行子轨");
          return;
        }
      }
      setProcessActionLoading(action);
      try {
        if (action === "approve") {
          await approvalService.approve(material.id, comment, lane_index);
        } else {
          await approvalService.reject(material.id, comment);
        }
        message.success("操作成功");
        setProcessComment("");
        setProcessOpen(false);
        await reload();
      } catch {
        message.error("操作失败");
      } finally {
        setProcessActionLoading(null);
      }
    },
    [laneIndex, material, needLanePick, reload],
  );

  const onClickProcess = useCallback(() => {
    setProcessComment("");
    setProcessOpen(true);
  }, []);

  const onApprove = useCallback(() => {
    const li = needLanePick ? laneIndex : laneIndex;
    doAction("approve", processComment, li);
  }, [doAction, laneIndex, needLanePick, processComment]);

  const onReject = useCallback(() => {
    doAction("reject", processComment);
  }, [doAction, processComment]);

  if (!Number.isFinite(mid) || mid <= 0) {
    return <Alert type="error" showIcon message="无效的材料 ID" />;
  }

  return (
    <div className="approvalProcessPage">
      <div className="approvalProcessHeader">
        <div className="approvalProcessHeaderLeft">
          <Typography.Title level={4} className="approvalProcessTitle">
            处理审批 · 申报 #{mid}
          </Typography.Title>
          <Space size={8} wrap>
            <Tag color={phaseColor as string}>{phaseLabel}</Tag>
            {project ? (
              <Typography.Text type="secondary">项目：{project.name}</Typography.Text>
            ) : null}
            {pendingRecord?.step_index != null ? (
              <Typography.Text type="secondary">
                环节：{(pendingRecord.step_index as number) + 1}
                {pendingRecord.lane_index != null ? ` · 子轨 ${pendingRecord.lane_index + 1}` : ""}
              </Typography.Text>
            ) : null}
          </Space>
        </div>
        <Space className="approvalProcessHeaderRight" wrap>
          <Button onClick={() => navigate("/declaration/approvals")}>返回</Button>
          <Button onClick={reload} loading={loading}>
            刷新
          </Button>
          <Button onClick={() => setPreviewOpen(true)} disabled={!material}>
            审批流程
          </Button>
          <Button type="primary" onClick={onClickProcess} disabled={!material}>
            处理
          </Button>
        </Space>
      </div>

      <Card
        className="approvalProcessCard"
        title="材料预览"
        extra={
          <Button onClick={openPdfPreview} disabled={!material}>
            预览PDF
          </Button>
        }
      >
        {declCfgLoading ? (
          <Typography.Text type="secondary">正在加载申报配置…</Typography.Text>
        ) : declCfg ? (
          <div className="approvalProcessDeclRenderer">
            <DeclarationConfigRenderer
              variant="preview"
              moduleLayout="tabs"
              config={declCfg.config ?? {}}
              draft={normalizeDeclarationDraft(
                (material?.content as { declaration?: unknown } | null | undefined)?.declaration,
              )}
              leadingTab={{
                key: "applicant_profile",
                label: "个人信息",
                children: profileLoading ? (
                  <Typography.Text type="secondary">正在加载个人信息…</Typography.Text>
                ) : profileRows.length > 0 ? (
                  <div className="approvalProcessProfileGroups">
                    <div className="approvalProcessProfileGroup">
                      <div className="approvalProcessProfileGroupTitle">基本信息</div>
                        <div className="approvalProcessProfileDescWrap">
                          {idPhotoUrl ? (
                            <div className="approvalProcessProfilePhotoFloat">
                              <Image
                                src={idPhotoBlobUrl ?? idPhotoUrl}
                                alt="证件照片"
                                width={110}
                                height={150}
                                preview
                              />
                            </div>
                          ) : null}
                          <Descriptions
                            size="small"
                            bordered
                            column={2}
                            className="approvalProcessProfileDesc"
                            styles={{ label: { width: 180 } }}
                            items={toDescItems(profilePreviewItems, renderProfileValue)}
                          />
                        </div>
                    </div>
                    <div className="approvalProcessProfileGroup">
                      <div className="approvalProcessProfileGroupTitle">任务（岗位）及关键词</div>
                      <Descriptions
                        size="small"
                        bordered
                        column={2}
                        className="approvalProcessProfileDesc"
                        styles={{ label: { width: 180 } }}
                        items={toDescItems(taskKeywordItems, renderProfileValue)}
                      />
                    </div>
                    <div className="approvalProcessProfileGroup">
                      <div className="approvalProcessProfileGroupTitle">导师与回避信息</div>
                      <Descriptions
                        size="small"
                        bordered
                        column={2}
                        className="approvalProcessProfileDesc"
                        styles={{ label: { width: 180 } }}
                        items={toDescItems(supervisorRecuseItems, renderProfileValue)}
                      />
                    </div>
                  </div>
                ) : (
                  <Typography.Text type="secondary">未获取到个人信息</Typography.Text>
                ),
              }}
            />
          </div>
        ) : (
          <div className="approvalProcessDeclRenderer">
            <div className="declCfgRender">
              <div className="declCfgRenderModuleTabs">
                <Tabs
                  items={[
                    {
                      key: "applicant_profile",
                      label: "个人信息",
                      children: profileLoading ? (
                        <Typography.Text type="secondary">正在加载个人信息…</Typography.Text>
                      ) : profileRows.length > 0 ? (
                        <div className="approvalProcessProfileGroups">
                          <div className="approvalProcessProfileGroup">
                            <div className="approvalProcessProfileGroupTitle">基本信息</div>
                            <div className="approvalProcessProfileDescWrap">
                              {idPhotoUrl ? (
                                <div className="approvalProcessProfilePhotoFloat">
                                  <Image
                                    src={idPhotoBlobUrl ?? idPhotoUrl}
                                    alt="证件照片"
                                    width={110}
                                    height={150}
                                    preview
                                  />
                                </div>
                              ) : null}
                              <Descriptions
                                size="small"
                                bordered
                                column={2}
                                className="approvalProcessProfileDesc"
                                styles={{ label: { width: 180 } }}
                                items={toDescItems(profilePreviewItems, renderProfileValue)}
                              />
                            </div>
                          </div>
                          <div className="approvalProcessProfileGroup">
                            <div className="approvalProcessProfileGroupTitle">任务（岗位）及关键词</div>
                            <Descriptions
                              size="small"
                              bordered
                              column={2}
                              className="approvalProcessProfileDesc"
                              styles={{ label: { width: 180 } }}
                              items={toDescItems(taskKeywordItems, renderProfileValue)}
                            />
                          </div>
                          <div className="approvalProcessProfileGroup">
                            <div className="approvalProcessProfileGroupTitle">导师与回避信息</div>
                            <Descriptions
                              size="small"
                              bordered
                              column={2}
                              className="approvalProcessProfileDesc"
                              styles={{ label: { width: 180 } }}
                              items={toDescItems(supervisorRecuseItems, renderProfileValue)}
                            />
                          </div>
                        </div>
                      ) : (
                        <Typography.Text type="secondary">未获取到个人信息</Typography.Text>
                      ),
                    },
                    {
                      key: "declaration_raw",
                      label: "申报内容",
                      children: (
                        <pre className="approvalProcessContentPre">
                          {renderValue(
                            (material?.content as { declaration?: unknown } | null | undefined)
                              ?.declaration,
                          )}
                        </pre>
                      ),
                    },
                  ]}
                />
              </div>
            </div>
          </div>
        )}
        <Typography.Paragraph type="secondary" className="approvalProcessPreviewHint">
          {declCfgLoading
            ? "正在加载申报配置…"
            : declCfg
              ? "已按项目当前生效的申报配置渲染（只读预览）。"
              : "未获取到申报配置，已回退为原始内容预览（content.declaration）。"}
        </Typography.Paragraph>
      </Card>

      {material ? null : <Card loading className="approvalProcessCard" />}

      <Modal
        title={material ? `处理 · 申报 #${material.id}` : "处理"}
        open={processOpen}
        onCancel={() => setProcessOpen(false)}
        destroyOnHidden
        maskClosable={processActionLoading == null}
        okButtonProps={{ style: { display: "none" } }}
        cancelButtonProps={{ style: { display: "none" } }}
        footer={
          <Space className="approvalProcessModalFooter" wrap>
            <Button onClick={() => setProcessOpen(false)} disabled={processActionLoading != null}>
              取消
            </Button>
            <Button
              danger
              onClick={onReject}
              loading={processActionLoading === "reject"}
              disabled={processActionLoading != null}
            >
              驳回
            </Button>
            <Button
              type="primary"
              onClick={onApprove}
              loading={processActionLoading === "approve"}
              disabled={processActionLoading != null}
            >
              通过
            </Button>
          </Space>
        }
      >
        {needLanePick ? (
          <div className="approvalProcessLaneRow">
            <div className="approvalProcessFieldLabel">并行子轨</div>
            <Select
              className="approvalProcessLaneSelect"
              placeholder="请选择并行子轨"
              options={laneOptions}
              value={laneIndex ?? undefined}
              onChange={(v) => setLaneIndex(v)}
            />
          </div>
        ) : null}
        <div className="approvalProcessCommentRow">
          <div className="approvalProcessFieldLabel">处理意见</div>
          <Input.TextArea
            value={processComment}
            placeholder="请输入处理意见（可选）"
            autoSize={{ minRows: 3, maxRows: 6 }}
            onChange={(e) => setProcessComment(e.target.value)}
          />
        </div>
      </Modal>

      <Modal
        title={material ? `审批流程预览 · 申报 #${material.id}` : "审批流程预览"}
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        footer={null}
        width={860}
        destroyOnHidden
      >
        {material ? (
          <MaterialApprovalProgress
            materialId={material.id}
            materialStatus={material.status}
            projectId={material.project_id}
            snapshotDisplay={material.approval_snapshot_display ?? null}
          />
        ) : null}
      </Modal>

      <Modal
        title={material ? `PDF 预览 · 申报 #${material.id}` : "PDF 预览"}
        open={pdfOpen}
        onCancel={() => setPdfOpen(false)}
        footer={null}
        width={960}
        destroyOnHidden
      >
        <div style={{ marginBottom: 10, display: "flex", justifyContent: "flex-end" }}>
          <Segmented
            value={pdfViewerMode}
            onChange={(v) => setPdfViewerMode(v as "system" | "light")}
            options={[
              { label: "系统查看器", value: "system" },
              { label: "白色查看器", value: "light" },
            ]}
          />
        </div>
        {pdfLoading ? (
          <Typography.Text type="secondary">加载中…</Typography.Text>
        ) : pdfUrl ? (
          pdfViewerMode === "light" ? (
            <PdfJsBlobViewer url={pdfUrl} />
          ) : (
            <iframe
              className="approvalProcessPdfFrame"
              src={pdfUrl}
              title="pdf-preview"
            />
          )
        ) : (
          <Typography.Text type="secondary">暂无可预览内容</Typography.Text>
        )}
      </Modal>
    </div>
  );
}

