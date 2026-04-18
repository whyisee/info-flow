import { Button, Card, Result, Spin, Typography } from "antd";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getPublicVersion, submitSurveyResponse, type PublicVersion } from "../../services/surveyResponses";
import { SurveyPreview } from "./SurveyPreview";

export default function SurveyFill() {
  const { templateId, version } = useParams<{ templateId: string; version: string }>();
  const [data, setData] = useState<PublicVersion | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tid = Number(templateId);
  const ver = Number(version);

  useEffect(() => {
    if (!tid || !ver || isNaN(tid) || isNaN(ver)) {
      setError("链接参数无效");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    Promise.all([getPublicVersion(tid, ver)])
      .then(([pub]) => {
        // 优先用 published version 的 fields（包含完整 fieldType 定义）
        const extraFields = pub.version_fields as Record<string, unknown>;
        const mergedFields = { ...pub.fields, ...extraFields };
        setData({ ...pub, fields: mergedFields });
      })
      .catch(() => setError("问卷不存在或链接已失效"))
      .finally(() => setLoading(false));
  }, [templateId, version]);

  const handleSubmit = async (answers: Record<string, unknown>) => {
    if (!data) return;
    setSubmitting(true);
    try {
      await submitSurveyResponse(tid, data.version_id, ver, answers);
      setSubmitted(true);
    } catch {
      setError("提交失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh" }}>
        <Spin tip="加载问卷中…" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh" }}>
        <Result status="error" title="加载失败" subTitle={error ?? "问卷不存在或链接已失效"} />
      </div>
    );
  }

  if (submitted) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh" }}>
        <Result
          status="success"
          title="提交成功"
          subTitle="感谢您的填写，祝您生活愉快！"
        />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px" }}>
      <Card>
        <SurveyPreview
          schemaJson={JSON.stringify(data.schema)}
          fieldsJson={JSON.stringify(data.fields)}
          title={data.name}
          description={data.description ?? undefined}
          onSubmit={handleSubmit}
          submitting={submitting}
          templateId={tid}
          version={ver}
        />
      </Card>
    </div>
  );
}
