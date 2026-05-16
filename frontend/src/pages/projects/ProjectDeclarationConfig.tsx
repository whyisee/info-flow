import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  Dropdown,
  Input,
  type InputRef,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  message,
  Typography,
} from "antd";
import {
  CloseOutlined,
  CopyOutlined,
  DiffOutlined,
  DownloadOutlined,
  EditOutlined,
  EyeOutlined,
  FileAddOutlined,
  HistoryOutlined,
  MoreOutlined,
  PlusOutlined,
  SaveOutlined,
  SendOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import type {
  DeclarationConfigRecord,
  DeclarationConfigValidationIssue,
} from "../../services/declarationConfig";
import * as declarationConfigApi from "../../services/declarationConfig";
import * as projectService from "../../services/projects";
import type { Project } from "../../types";
import {
  createDeclarationConfigTemplate,
  listDeclarationConfigTemplates,
  type DeclarationConfigTemplate,
} from "../../services/declarationConfigTemplates";
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

const templateCategoryOptions = [
  { value: "人才类", label: "人才类" },
  { value: "奖项类", label: "奖项类" },
  { value: "项目类", label: "项目类" },
  { value: "年度申报类", label: "年度申报类" },
];

type ConfigDiffRow = {
  key: string;
  path: string;
  change: "added" | "removed" | "changed";
  before: string;
  after: string;
};

type ConfigRisk = {
  level: "error" | "warning";
  message: string;
  path: string;
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
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [templateRows, setTemplateRows] = useState<DeclarationConfigTemplate[]>(
    [],
  );
  const [templateLoading, setTemplateLoading] = useState(false);
  const [fromTemplateOpen, setFromTemplateOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(
    null,
  );
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateCategory, setTemplateCategory] = useState<string | undefined>(
    "年度申报类",
  );
  const [templateDescription, setTemplateDescription] = useState("");
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareLeftId, setCompareLeftId] = useState<number | null>(null);
  const [compareRightId, setCompareRightId] = useState<number | null>(null);
  const [historyCopyOpen, setHistoryCopyOpen] = useState(false);
  const [historyProjects, setHistoryProjects] = useState<Project[]>([]);
  const [historyProjectId, setHistoryProjectId] = useState<number | null>(null);
  const [historyCopyLabel, setHistoryCopyLabel] = useState("");

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

  const currentConfig = () =>
    editorRef.current?.getPreviewConfig?.() ??
    ((selectedRecord?.config ?? {}) as Record<string, unknown>);

  const compareLeft = useMemo(
    () => rows.find((item) => item.id === compareLeftId) ?? null,
    [compareLeftId, rows],
  );

  const compareRight = useMemo(
    () => rows.find((item) => item.id === compareRightId) ?? null,
    [compareRightId, rows],
  );

  const compareRows = useMemo(() => {
    if (!compareLeft || !compareRight) return [];
    return buildConfigDiffRows(compareLeft.config, compareRight.config);
  }, [compareLeft, compareRight]);

  const compareRisks = useMemo(
    () => buildConfigDiffRisks(compareRows),
    [compareRows],
  );

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

  const createBlankVersion = async () => {
    setLoading(true);
    try {
      const created = await declarationConfigApi.createDeclarationConfig(
        projectId,
        {
          label: rows.length === 0 ? "初始配置" : undefined,
          config: {
            profileBinding: {
              enabled: true,
              fields: [],
              table_layout: { columns: 12, rows: [] },
            },
            modules: [],
          },
        },
      );
      message.success("已新建草稿版本");
      await loadAll();
      setSelectedId(created.id);
      setLabelDraft(created.label ?? "");
      setEditing(true);
      setPanelKey((k) => k + 1);
    } catch {
      message.error("新建版本失败");
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = async () => {
    setTemplateLoading(true);
    try {
      const list = await listDeclarationConfigTemplates("enabled");
      setTemplateRows(list);
      setSelectedTemplateId((prev) => {
        if (prev != null && list.some((item) => item.id === prev)) return prev;
        return list[0]?.id ?? null;
      });
    } catch {
      message.error("加载配置模板失败");
    } finally {
      setTemplateLoading(false);
    }
  };

  const openFromTemplateModal = async () => {
    setFromTemplateOpen(true);
    await loadTemplates();
  };

  const createVersionFromTemplate = async () => {
    const template = templateRows.find((item) => item.id === selectedTemplateId);
    if (!template) {
      message.error("请选择模板");
      return;
    }
    setLoading(true);
    try {
      const config = JSON.parse(JSON.stringify(template.config ?? {})) as Record<
        string,
        unknown
      >;
      const created = await declarationConfigApi.createDeclarationConfig(
        projectId,
        {
          label: `来自模板：${template.name} v${template.version}`,
          config,
        },
      );
      message.success("已从模板新建草稿版本");
      setFromTemplateOpen(false);
      await loadAll();
      setSelectedId(created.id);
      setLabelDraft(created.label ?? "");
      setEditing(true);
      setPanelKey((k) => k + 1);
    } catch {
      message.error("从模板新建失败");
    } finally {
      setLoading(false);
    }
  };

  const openSaveTemplateModal = () => {
    if (!selectedRecord) return;
    setTemplateName(
      `${project?.name || "申报配置"} v${selectedRecord.version}`.slice(0, 200),
    );
    setTemplateCategory("年度申报类");
    setTemplateDescription(labelDraft || selectedRecord.label || "");
    setSaveTemplateOpen(true);
  };

  const saveCurrentAsTemplate = async () => {
    const name = templateName.trim();
    if (!name) {
      message.error("请输入模板名称");
      return;
    }
    setLoading(true);
    try {
      await createDeclarationConfigTemplate({
        name,
        category: templateCategory,
        description: templateDescription.trim() || undefined,
        config: currentConfig(),
      });
      message.success("已保存为配置模板");
      setSaveTemplateOpen(false);
    } catch {
      message.error("保存模板失败");
    } finally {
      setLoading(false);
    }
  };

  const openHistoryCopyModal = async () => {
    setHistoryCopyOpen(true);
    setHistoryProjectId(null);
    setHistoryCopyLabel("");
    try {
      const list = await projectService.getProjects();
      setHistoryProjects(list.filter((item) => item.id !== projectId));
    } catch {
      message.error("加载历史项目失败");
    }
  };

  const copyFromHistoryProject = async () => {
    if (!historyProjectId) {
      message.error("请选择历史项目");
      return;
    }
    setLoading(true);
    try {
      const created = await declarationConfigApi.copyDeclarationConfigFromProject(
        projectId,
        {
          source_project_id: historyProjectId,
          label: historyCopyLabel.trim() || undefined,
        },
      );
      message.success("已从历史项目复制配置");
      setHistoryCopyOpen(false);
      await loadAll();
      setSelectedId(created.id);
      setLabelDraft(created.label ?? "");
      setEditing(true);
      setPanelKey((k) => k + 1);
    } catch {
      message.error("复制历史项目配置失败");
    } finally {
      setLoading(false);
    }
  };

  const openCompareModal = () => {
    const currentIndex = selectedRecord
      ? rows.findIndex((item) => item.id === selectedRecord.id)
      : 0;
    const left = rows[currentIndex + 1] ?? rows[1] ?? rows[0] ?? null;
    const right = selectedRecord ?? rows[0] ?? null;
    setCompareLeftId(left?.id ?? null);
    setCompareRightId(right?.id ?? null);
    setCompareOpen(true);
  };

  const exportCurrentConfig = () => {
    if (!selectedRecord) return;
    const config = currentConfig();
    const payload = {
      type: "declaration_config_export",
      exported_at: new Date().toISOString(),
      project_id: projectId,
      source_version: selectedRecord.version,
      label: labelDraft || selectedRecord.label || null,
      config,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `declaration-config-v${selectedRecord.version}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const extractConfigFromImport = (raw: unknown): Record<string, unknown> => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("JSON 须为对象");
    }
    const obj = raw as Record<string, unknown>;
    const cfg =
      obj.config && typeof obj.config === "object" && !Array.isArray(obj.config)
        ? (obj.config as Record<string, unknown>)
        : obj;
    if (!Array.isArray(cfg.modules)) {
      throw new Error("配置须包含 modules 数组");
    }
    return cfg;
  };

  const confirmValidationWarnings = async (
    warnings: DeclarationConfigValidationIssue[],
  ) => {
    if (warnings.length === 0) return true;
    return new Promise<boolean>((resolve) => {
      Modal.confirm({
        title: "导入配置存在提示项，是否继续？",
        width: 720,
        content: <ValidationIssueList issues={warnings} />,
        okText: "继续导入",
        cancelText: "取消",
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
  };

  const importConfigFile = async (file: File) => {
    setLoading(true);
    try {
      const text = await file.text();
      const raw = JSON.parse(text) as unknown;
      const config = extractConfigFromImport(raw);
      const validation = await declarationConfigApi.validateDeclarationConfig(
        projectId,
        config,
      );
      if (validation.errors.length > 0) {
        Modal.error({
          title: "导入配置校验未通过",
          width: 720,
          content: <ValidationIssueList issues={validation.errors} />,
        });
        return;
      }
      const shouldContinue = await confirmValidationWarnings(
        validation.warnings,
      );
      if (!shouldContinue) return;
      const created = await declarationConfigApi.createDeclarationConfig(
        projectId,
        {
          label: `导入配置：${file.name.replace(/\.json$/i, "")}`,
          config,
        },
      );
      message.success("已导入为新草稿版本");
      await loadAll();
      setSelectedId(created.id);
      setEditing(true);
      setPanelKey((k) => k + 1);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "导入失败");
    } finally {
      setLoading(false);
      if (importInputRef.current) importInputRef.current.value = "";
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

  const moreActionItems = [
    {
      key: "copy",
      icon: <CopyOutlined />,
      label: "复制新建",
      disabled: editing || !canCopySelected,
    },
    { type: "divider" as const },
    {
      key: "import",
      icon: <UploadOutlined />,
      label: "导入 JSON 配置",
      disabled: loading,
    },
    {
      key: "export",
      icon: <DownloadOutlined />,
      label: "导出当前配置",
      disabled: !selectedRecord,
    },
    {
      key: "fromTemplate",
      icon: <FileAddOutlined />,
      label: "从模板新建",
    },
    {
      key: "fromHistory",
      icon: <HistoryOutlined />,
      label: "从历史项目复制",
    },
    {
      key: "saveTemplate",
      icon: <SaveOutlined />,
      label: "保存为模板",
      disabled: !selectedRecord,
    },
    {
      key: "compare",
      icon: <DiffOutlined />,
      label: "版本对比",
      disabled: rows.length < 2,
    },
    ...(editing
      ? [
          { type: "divider" as const },
          {
            key: "cancel",
            icon: <CloseOutlined />,
            label: "取消编辑",
          },
        ]
      : []),
  ];

  const handleMoreAction = ({ key }: { key: string }) => {
    switch (key) {
      case "copy":
        void quickCopyFromSelected();
        break;
      case "import":
        importInputRef.current?.click();
        break;
      case "export":
        exportCurrentConfig();
        break;
      case "fromTemplate":
        void openFromTemplateModal();
        break;
      case "fromHistory":
        void openHistoryCopyModal();
        break;
      case "saveTemplate":
        openSaveTemplateModal();
        break;
      case "compare":
        openCompareModal();
        break;
      case "cancel":
        cancelEdit();
        break;
      default:
        break;
    }
  };

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
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importConfigFile(file);
            }}
          />
          <Select
            value={selectedId != null ? String(selectedId) : undefined}
            className="projectDeclarationVersionSelect"
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
          <Button
            icon={<EyeOutlined />}
            onClick={() => setPreviewOpen(true)}
            disabled={!selectedRecord}
          >
            预览
          </Button>
          {!editing ? (
            <>
              <Button
                icon={<PlusOutlined />}
                onClick={createBlankVersion}
                loading={loading}
              >
                新建版本
              </Button>
              <Button
                type="primary"
                icon={<EditOutlined />}
                onClick={startEdit}
                disabled={!canEditSelected}
              >
                编辑
              </Button>
            </>
          ) : (
            <>
              <Button onClick={() => void onSave()} loading={loading}>
                保存
              </Button>
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={() => void onPublish()}
                loading={loading}
              >
                提交
              </Button>
            </>
          )}
          <Dropdown
            trigger={["hover"]}
            placement="bottomRight"
            menu={{ items: moreActionItems, onClick: handleMoreAction }}
          >
            <Button icon={<MoreOutlined />}>更多操作</Button>
          </Dropdown>
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
          <Space direction="vertical" size="middle">
            <Typography.Text type="secondary">
              暂无版本，请先新建一个版本。
            </Typography.Text>
            <Button
              type="primary"
              onClick={createBlankVersion}
              loading={loading}
            >
              新建初始版本
            </Button>
          </Space>
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
        title="从配置模板新建版本"
        open={fromTemplateOpen}
        onCancel={() => setFromTemplateOpen(false)}
        onOk={() => void createVersionFromTemplate()}
        confirmLoading={loading}
        okText="新建草稿"
        width={640}
      >
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Typography.Text type="secondary">
            选择一个已启用模板，系统会复制模板配置并生成新的草稿版本。
          </Typography.Text>
          <Select
            value={selectedTemplateId ?? undefined}
            loading={templateLoading}
            placeholder="选择配置模板"
            style={{ width: "100%" }}
            options={templateRows.map((item) => ({
              value: item.id,
              label: `${item.name} v${item.version}${item.category ? ` · ${item.category}` : ""}`,
            }))}
            onChange={(value) => setSelectedTemplateId(value)}
          />
          {selectedTemplateId ? (
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              {
                templateRows.find((item) => item.id === selectedTemplateId)
                  ?.description
              }
            </Typography.Paragraph>
          ) : null}
        </Space>
      </Modal>

      <Modal
        title="从历史项目复制申报配置"
        open={historyCopyOpen}
        onCancel={() => setHistoryCopyOpen(false)}
        onOk={() => void copyFromHistoryProject()}
        confirmLoading={loading}
        okText="复制为草稿"
        width={640}
      >
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Typography.Text type="secondary">
            系统会优先复制源项目已发布配置；如果没有已发布版本，则复制源项目最新配置。
          </Typography.Text>
          <Select
            value={historyProjectId ?? undefined}
            placeholder="选择历史项目"
            showSearch
            optionFilterProp="label"
            style={{ width: "100%" }}
            options={historyProjects.map((item) => ({
              value: item.id,
              label: `${item.name}${item.status === 1 ? "（已发布）" : ""}`,
            }))}
            onChange={setHistoryProjectId}
          />
          <Input
            value={historyCopyLabel}
            onChange={(event) => setHistoryCopyLabel(event.target.value)}
            placeholder="可选：新版本说明，例如“复制自 2025 年项目”"
            maxLength={200}
          />
        </Space>
      </Modal>

      <Modal
        title="保存当前配置为模板"
        open={saveTemplateOpen}
        onCancel={() => setSaveTemplateOpen(false)}
        onOk={() => void saveCurrentAsTemplate()}
        confirmLoading={loading}
        okText="保存模板"
        width={640}
      >
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <div className="projectDeclarationTemplateFormRow">
            <span>模板名称</span>
            <Input
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              maxLength={200}
              placeholder="例如：2026 人才申报标准模板"
            />
          </div>
          <div className="projectDeclarationTemplateFormRow">
            <span>分类</span>
            <Select
              value={templateCategory}
              options={templateCategoryOptions}
              onChange={setTemplateCategory}
              placeholder="选择分类"
              allowClear
            />
          </div>
          <div className="projectDeclarationTemplateFormRow projectDeclarationTemplateFormRowBlock">
            <span>说明</span>
            <Input.TextArea
              value={templateDescription}
              onChange={(event) => setTemplateDescription(event.target.value)}
              autoSize={{ minRows: 3, maxRows: 5 }}
              maxLength={500}
              placeholder="可选：适用年度、申报类型、注意事项"
            />
          </div>
        </Space>
      </Modal>

      <Modal
        title="配置版本对比"
        open={compareOpen}
        onCancel={() => setCompareOpen(false)}
        footer={null}
        width={980}
      >
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Space wrap>
            <Select
              value={compareLeftId ?? undefined}
              style={{ width: 260 }}
              placeholder="选择旧版本"
              options={rows.map((item) => ({
                value: item.id,
                label: `v${item.version}（${statusLabel[item.status]?.text ?? item.status}）${item.label ? `：${item.label}` : ""}`,
              }))}
              onChange={setCompareLeftId}
            />
            <Typography.Text type="secondary">对比</Typography.Text>
            <Select
              value={compareRightId ?? undefined}
              style={{ width: 260 }}
              placeholder="选择新版本"
              options={rows.map((item) => ({
                value: item.id,
                label: `v${item.version}（${statusLabel[item.status]?.text ?? item.status}）${item.label ? `：${item.label}` : ""}`,
              }))}
              onChange={setCompareRightId}
            />
          </Space>
          {compareRisks.length > 0 ? (
            <Alert
              type={compareRisks.some((item) => item.level === "error") ? "error" : "warning"}
              showIcon
              message="检测到高风险配置变更"
              description={
                <div className="projectDeclarationCompareRisks">
                  {compareRisks.slice(0, 6).map((item, index) => (
                    <div key={`${item.path}-${index}`}>
                      <Tag color={item.level === "error" ? "red" : "gold"}>
                        {item.level === "error" ? "高风险" : "提示"}
                      </Tag>
                      <span>{item.message}</span>
                      <Typography.Text type="secondary">（{item.path}）</Typography.Text>
                    </div>
                  ))}
                  {compareRisks.length > 6 ? (
                    <Typography.Text type="secondary">
                      还有 {compareRisks.length - 6} 项风险，请查看下方差异。
                    </Typography.Text>
                  ) : null}
                </div>
              }
            />
          ) : null}
          <Table<ConfigDiffRow>
            size="small"
            rowKey="key"
            dataSource={compareRows}
            pagination={{ pageSize: 10, showSizeChanger: false }}
            locale={{ emptyText: "两个版本暂无配置差异" }}
            columns={[
              {
                title: "类型",
                dataIndex: "change",
                width: 88,
                render: (value: ConfigDiffRow["change"]) => {
                  const label =
                    value === "added"
                      ? "新增"
                      : value === "removed"
                        ? "删除"
                        : "修改";
                  const color =
                    value === "added"
                      ? "green"
                      : value === "removed"
                        ? "red"
                        : "blue";
                  return <Tag color={color}>{label}</Tag>;
                },
              },
              { title: "路径", dataIndex: "path", width: 280 },
              {
                title: "旧值",
                dataIndex: "before",
                ellipsis: true,
              },
              {
                title: "新值",
                dataIndex: "after",
                ellipsis: true,
              },
            ]}
          />
        </Space>
      </Modal>

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

function formatDiffValue(value: unknown) {
  if (value === undefined) return "";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function flattenConfig(
  value: unknown,
  path: string,
  output: Record<string, unknown>,
) {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      output[path] = [];
      return;
    }
    value.forEach((item, index) => {
      flattenConfig(item, `${path}[${index}]`, output);
    });
    return;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      output[path] = {};
      return;
    }
    entries.forEach(([key, item]) => {
      flattenConfig(item, path ? `${path}.${key}` : key, output);
    });
    return;
  }
  output[path || "config"] = value;
}

function buildConfigDiffRows(
  beforeConfig: Record<string, unknown>,
  afterConfig: Record<string, unknown>,
) {
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  flattenConfig(beforeConfig, "", before);
  flattenConfig(afterConfig, "", after);
  const paths = Array.from(
    new Set([...Object.keys(before), ...Object.keys(after)]),
  ).sort();

  return paths.reduce<ConfigDiffRow[]>((acc, path) => {
    const beforeValue = before[path];
    const afterValue = after[path];
    const beforeText = formatDiffValue(beforeValue);
    const afterText = formatDiffValue(afterValue);
    if (beforeText === afterText) return acc;
    acc.push({
      key: path,
      path,
      change:
        beforeValue === undefined
          ? "added"
          : afterValue === undefined
            ? "removed"
            : "changed",
      before: beforeText,
      after: afterText,
    });
    return acc;
  }, []);
}

function buildConfigDiffRisks(rows: ConfigDiffRow[]): ConfigRisk[] {
  const risks: ConfigRisk[] = [];
  rows.forEach((row) => {
    if (
      row.change === "removed" &&
      /(\.fields\[\d+\]\.name|\.columns\[\d+\]\.name|\.sections\[\d+\]\.key|\.modules\[\d+\]\.key)/.test(row.path)
    ) {
      risks.push({
        level: "error",
        message: "删除了关键标识，可能导致历史材料字段无法继续匹配",
        path: row.path,
      });
      return;
    }
    if (row.change === "removed" && /(\.fields\[\d+\]|\.columns\[\d+\]|\.sections\[\d+\])/.test(row.path)) {
      risks.push({
        level: "warning",
        message: "删除了字段、列或内容块，请确认是否影响已填报材料",
        path: row.path,
      });
      return;
    }
    if (
      row.change === "changed" &&
      /(\.kind|\.type|\.widget|\.cellType|\.templateId|\.templateVersion)$/.test(row.path)
    ) {
      risks.push({
        level: "error",
        message: "修改了类型或引用关系，可能影响渲染、校验或已填数据",
        path: row.path,
      });
    }
  });
  return risks;
}

function ValidationIssueList({
  issues,
}: {
  issues: DeclarationConfigValidationIssue[];
}) {
  return (
    <div className="projectDeclarationValidationIssues">
      {issues.map((issue, index) => (
        <div className="projectDeclarationValidationIssue" key={index}>
          <Tag color={issue.level === "error" ? "red" : "gold"}>
            {issue.level === "error" ? "错误" : "提示"}
          </Tag>
          <span className="projectDeclarationValidationIssuePath">
            {issue.path || "配置"}
          </span>
          <span>{issue.message}</span>
        </div>
      ))}
    </div>
  );
}
