import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Form,
  Input,
  Modal,
  Segmented,
  Space,
  Spin,
  Typography,
  message,
} from "antd";
import type { DeclarationConfigRecord } from "../../services/declarationConfig";
import * as declarationConfigApi from "../../services/declarationConfig";
import {
  DeclarationConfigRenderer,
  normalizeDeclarationConfig,
} from "../../features/declaration-config-render";
import {
  configToFormValues,
  formValuesToConfig,
  type DeclarationFormValues,
} from "./declarationConfigTransforms";
import { DeclarationConfigVisualEditor } from "./DeclarationConfigVisualEditor";
import "./DeclarationConfigEditModal.css";

export { normalizeDeclarationConfig } from "../../features/declaration-config-render";

type Props = {
  projectId: number;
  open: boolean;
  hydrateKey: number;
  record: DeclarationConfigRecord | null;
  onClose: () => void;
  onSaved: () => void;
};

/** 与 initialValues 引用解耦，供 effect 依赖 */
function formValuesKey(v: DeclarationFormValues): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(Date.now());
  }
}

/**
 * 单次编辑会话：独立 useForm + initialValues。
 * 可视化区用 Segmented 切换且「只挂载当前面板」，避免 Tabs 下 Form.List 与多次渲染不同步；
 * Modal 打开后再分帧多次 setFieldsValue，并用 Spin 遮住未就绪的空白期。
 */
function DeclarationConfigEditModalSession({
  record,
  projectId,
  onClose,
  onSaved,
}: {
  record: DeclarationConfigRecord;
  projectId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form] = Form.useForm<DeclarationFormValues>();
  const configSnapshot = useMemo(
    () => normalizeDeclarationConfig(record.config),
    [record],
  );
  const initialValues = useMemo(
    () => configToFormValues(configSnapshot),
    [configSnapshot],
  );
  const initialValuesKey = useMemo(
    () => formValuesKey(initialValues),
    [initialValues],
  );

  const [labelDraft, setLabelDraft] = useState(() => record.label ?? "");
  const [editorTab, setEditorTab] = useState<"visual" | "json" | "preview">(
    "visual",
  );
  const [jsonText, setJsonText] = useState(() =>
    JSON.stringify(configSnapshot, null, 2),
  );
  const [saving, setSaving] = useState(false);
  /** 嵌套 Form.List 需多帧 setFieldsValue，结束前展示加载态 */
  const [visualHydrating, setVisualHydrating] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setVisualHydrating(true);

    const apply = () => {
      if (cancelled) return;
      form.setFieldsValue(initialValues);
    };

    const timers: ReturnType<typeof setTimeout>[] = [];
    apply();
    timers.push(setTimeout(apply, 0));
    timers.push(setTimeout(apply, 24));
    timers.push(setTimeout(apply, 72));
    timers.push(
      setTimeout(() => {
        if (cancelled) return;
        apply();
        setVisualHydrating(false);
      }, 120),
    );

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [form, initialValuesKey, initialValues]);

  /** 须 `preserve: true`：可视化卸载后仍用 getFieldsValue(true)，否则 modules 为空导致预览空白 */
  const modulesWatch = Form.useWatch("modules", { form, preserve: true });
  const previewConfig = useMemo(() => {
    try {
      return formValuesToConfig({
        modules: (modulesWatch ?? []) as DeclarationFormValues["modules"],
      });
    } catch {
      return { modules: [] };
    }
  }, [modulesWatch]);

  const save = async () => {
    setSaving(true);
    try {
      let config: Record<string, unknown>;
      if (editorTab === "json") {
        try {
          config = JSON.parse(jsonText) as Record<string, unknown>;
        } catch {
          message.error("JSON 格式不正确");
          setSaving(false);
          return;
        }
        if (!Array.isArray(config.modules)) {
          message.error("须包含 modules 数组");
          setSaving(false);
          return;
        }
      } else {
        await form.validateFields();
        const vals = form.getFieldsValue(true) as DeclarationFormValues;
        config = formValuesToConfig(vals);
      }
      await declarationConfigApi.updateDeclarationConfig(projectId, record.id, {
        label: labelDraft.trim() || undefined,
        config,
      });
      message.success("已保存");
      onSaved();
      onClose();
    } catch (e) {
      if (e && typeof e === "object" && "errorFields" in e) {
        message.error("请检查表单必填项");
      } else if (editorTab === "visual" || editorTab === "preview") {
        const detail =
          e &&
          typeof e === "object" &&
          "response" in e &&
          (e as { response?: { data?: { detail?: unknown } } }).response?.data
            ?.detail;
        message.error(
          typeof detail === "string" ? `保存失败：${detail}` : "保存失败",
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const onTabChange = (next: "visual" | "json" | "preview") => {
    if (next === "json") {
      try {
        const vals = form.getFieldsValue(true) as DeclarationFormValues;
        const cfg = formValuesToConfig(vals);
        const empty =
          !Array.isArray(cfg.modules) || cfg.modules.length === 0;
        setJsonText(
          JSON.stringify(empty ? configSnapshot : cfg, null, 2),
        );
      } catch {
        setJsonText(JSON.stringify(configSnapshot, null, 2));
      }
    }
    if (
      (next === "visual" || next === "preview") &&
      editorTab === "json" &&
      jsonText.trim()
    ) {
      try {
        const parsed = JSON.parse(jsonText) as Record<string, unknown>;
        if (Array.isArray(parsed.modules)) {
          form.setFieldsValue(configToFormValues(parsed));
        }
      } catch {
        message.warning("JSON 未解析，表单仍为上次内容");
      }
    }
    setEditorTab(next);
  };

  const saveDisabled = saving || (editorTab === "visual" && visualHydrating);

  return (
    <Modal
      title={`编辑申报配置 — 草稿 v${record.version}`}
      open
      onCancel={onClose}
      width={960}
      destroyOnClose
      centered
      wrapClassName="projectDeclarationConfigModalWrap"
      className="projectDeclarationConfigModal"
      footer={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button
            type="primary"
            loading={saving}
            disabled={saveDisabled}
            onClick={() => void save()}
          >
            保存
          </Button>
        </Space>
      }
    >
      {/* 切换预览时可视化 Form.List 会卸载，须 preserve 否则 modules 被清空 */}
      <Form
        form={form}
        layout="vertical"
        preserve
        style={{ width: "100%" }}
        className="projectDeclarationConfigForm"
        initialValues={initialValues}
      >
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Segmented
            className="projectDeclarationConfigSegmented"
            block
            options={[
              { label: "可视化配置", value: "visual" },
              { label: "预览", value: "preview" },
              { label: "JSON（高级）", value: "json" },
            ]}
            value={editorTab}
            onChange={(v) =>
              onTabChange(v as "visual" | "json" | "preview")
            }
          />
          {editorTab === "visual" ? (
            <Spin
              spinning={visualHydrating}
              tip="正在加载配置到表单…"
              className="projectDeclarationConfigVisualSpin"
            >
              <DeclarationConfigVisualEditor form={form} />
            </Spin>
          ) : editorTab === "preview" ? (
            <>
              <Typography.Paragraph type="secondary" className="projectDeclarationConfigPreviewHint">
                以下为与填报一致的<strong>试填界面</strong>（含未保存的结构修改）；输入仅在当前窗口有效，关闭或切换页签即丢弃，不会写入配置或申报。
              </Typography.Paragraph>
              <DeclarationConfigRenderer
                variant="fill"
                config={previewConfig}
                moduleLayout="tabs"
              />
            </>
          ) : (
            <>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
                与「可视化」同一套数据；在此修改后保存将以 JSON
                为准。不熟悉请勿使用。
              </Typography.Paragraph>
              <Input.TextArea
                className="projectDeclarationConfigJson"
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                rows={20}
                spellCheck={false}
              />
            </>
          )}
          <div className="projectDeclarationConfigLabelRow">
            <Typography.Text>版本说明</Typography.Text>
            <Input
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              placeholder="可选，如 2026 春季"
            />
          </div>
        </Space>
      </Form>
    </Modal>
  );
}

export function DeclarationConfigEditModal({
  projectId,
  open,
  hydrateKey,
  record,
  onClose,
  onSaved,
}: Props) {
  if (!open || !record) {
    return null;
  }

  return (
    <DeclarationConfigEditModalSession
      key={`${record.id}-${hydrateKey}`}
      record={record}
      projectId={projectId}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}
