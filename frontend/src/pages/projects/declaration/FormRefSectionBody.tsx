import { Button, Form, Select, Space, Typography } from "antd";
import type { FormInstance } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  listSurveyTemplateVersions,
  listSurveyTemplates,
  type SurveyTemplate,
  type SurveyTemplateVersion,
} from "../../../services/surveyTemplates";
import type { DeclarationFormValues } from "../declarationConfigTransforms";

export function FormRefSectionBody({
  form,
  modName,
  subName,
  secName,
}: {
  form: FormInstance<DeclarationFormValues>;
  modName: number;
  subName: number;
  secName: number;
}) {
  const nav = useNavigate();
  const [templates, setTemplates] = useState<SurveyTemplate[]>([]);
  const [versions, setVersions] = useState<SurveyTemplateVersion[]>([]);

  const templateId = Form.useWatch(
    ["modules", modName, "subModules", subName, "sections", secName, "templateId"],
    form,
  ) as number | null | undefined;
  const templateVersion = Form.useWatch(
    ["modules", modName, "subModules", subName, "sections", secName, "templateVersion"],
    form,
  ) as number | null | undefined;

  useEffect(() => {
    void (async () => {
      const rows = await listSurveyTemplates();
      setTemplates(rows);
    })();
  }, []);

  useEffect(() => {
    if (!templateId) {
      setVersions([]);
      return;
    }
    void (async () => {
      const rows = await listSurveyTemplateVersions(templateId);
      setVersions(rows);
    })();
  }, [templateId]);

  const templateOptions = useMemo(
    () => templates.map((t) => ({ value: t.id, label: `${t.name} (#${t.id})` })),
    [templates],
  );
  const versionOptions = useMemo(
    () => versions.map((v) => ({ value: v.version, label: `v${v.version}` })),
    [versions],
  );

  return (
    <Space direction="vertical" size={8} style={{ width: "100%" }}>
      <Typography.Text type="secondary">
        这里选择已设计好的问卷/模块模板；发布申报配置时会固化模板版本；填报端将使用后端展开后的最终 schema 渲染。
      </Typography.Text>

      <Form.Item label="选择模板" name={[secName, "templateId"]} required>
        <Select
          showSearch
          placeholder="请选择模板"
          options={templateOptions}
          optionFilterProp="label"
        />
      </Form.Item>

      <Form.Item label="模板版本（可选）" name={[secName, "templateVersion"]}>
        <Select
          allowClear
          placeholder="默认：发布时固化为模板当前已发布版本"
          options={versionOptions}
          disabled={!templateId}
        />
      </Form.Item>

      <Space size={8}>
        <Button
          size="small"
          disabled={!templateId}
          onClick={() => nav(`/survey/design/${templateId}`)}
        >
          打开模板设计
        </Button>
        {templateId ? (
          <Typography.Text type="secondary">
            当前引用：#{templateId}
            {templateVersion ? ` v${templateVersion}` : ""}
          </Typography.Text>
        ) : null}
      </Space>
    </Space>
  );
}

