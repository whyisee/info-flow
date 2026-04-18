import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { Card, Form, Space, Spin, message } from "antd";
import type { DeclarationConfigRecord } from "../../services/declarationConfig";
import * as declarationConfigApi from "../../services/declarationConfig";
import { normalizeDeclarationConfig } from "../../features/declaration-config-render";
import {
  configToFormValues,
  formValuesToConfig,
  type DeclarationFormValues,
} from "./declarationConfigTransforms";
import { DeclarationConfigVisualEditor } from "./DeclarationConfigVisualEditor";
import "./DeclarationConfigEditModal.css";

/** 与 initialValues 引用解耦，供 effect 依赖 */
function formValuesKey(v: DeclarationFormValues): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(Date.now());
  }
}

type Props = {
  projectId: number;
  record: DeclarationConfigRecord;
  editing: boolean;
  label: string;
  onSaved: () => void;
  onPublished: () => void;
};

export type DeclarationConfigEditorPanelRef = {
  save: (label: string) => Promise<void>;
  publish: () => Promise<void>;
  getPreviewConfig: () => Record<string, unknown>;
};

export const DeclarationConfigEditorPanel: React.ForwardRefExoticComponent<
  React.PropsWithoutRef<Props> &
    React.RefAttributes<DeclarationConfigEditorPanelRef>
> = forwardRef(function DeclarationConfigEditorPanel(
  { projectId, record, editing, label, onSaved, onPublished }: Props,
  ref,
) {
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

  /** 嵌套 Form.List 需多帧 setFieldsValue，结束前展示加载态 */
  const [visualHydrating, setVisualHydrating] = useState(true);

  const readonly = !editing || record.status !== "draft";

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

  const getPreviewConfig = useMemo(() => {
    return () => {
      try {
        const vals = form.getFieldsValue(true) as DeclarationFormValues;
        return formValuesToConfig(vals) as Record<string, unknown>;
      } catch {
        return { modules: [] };
      }
    };
  }, [form]);

  const getPreviewConfigSnapshot = () => {
    try {
      return getPreviewConfig();
    } catch {
      return { modules: [] };
    }
  };

  const save = async (labelOverride: string) => {
    if (readonly) return;
    try {
      let config: Record<string, unknown>;
      await form.validateFields();
      const vals = form.getFieldsValue(true) as DeclarationFormValues;
      config = formValuesToConfig(vals);
      await declarationConfigApi.updateDeclarationConfig(projectId, record.id, {
        label: labelOverride.trim() || undefined,
        config,
      });
      message.success("已保存");
      onSaved();
    } catch (e) {
      if (e && typeof e === "object" && "errorFields" in e) {
        message.error("请检查表单必填项");
      } else {
        message.error("保存失败");
      }
    }
  };

  const publish = async () => {
    if (readonly) return;
    try {
      await declarationConfigApi.publishDeclarationConfig(projectId, record.id);
      message.success("已提交");
      onPublished();
    } catch {
      message.error("提交失败");
    }
  };

  useImperativeHandle(
    ref,
    () => ({
      save,
      publish,
      getPreviewConfig: () => getPreviewConfigSnapshot(),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, record.id, readonly, label, getPreviewConfig],
  );

  return (
    <Card
      className="projectDeclarationConfigEditor"
      bodyStyle={{ padding: 16 }}
    >
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Form
          form={form}
          layout="vertical"
          preserve
          disabled={readonly}
          style={{ width: "100%" }}
          className="projectDeclarationConfigForm"
          initialValues={initialValues}
        >
          <Spin
            spinning={visualHydrating}
            tip="正在加载配置到表单…"
            className="projectDeclarationConfigVisualSpin"
          >
            <DeclarationConfigVisualEditor form={form} />
          </Spin>
        </Form>
      </Space>
    </Card>
  );
});
