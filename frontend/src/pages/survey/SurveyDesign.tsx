import { Button, Card, Input, message, Modal, Select, Space, Spin, Tag, Typography } from "antd";
import type { InputRef } from "antd";
import { EditOutlined } from "@ant-design/icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  getSurveyTemplate,
  listSurveyTemplateVersions,
  publishSurveyTemplate,
  updateSurveyTemplate,
  type SurveyTemplate,
  type SurveyTemplateVersion,
} from "../../services/surveyTemplates";
import { FormDesignerEditor } from "../projects/form-designer/FormDesignerEditor";
import { SurveyPreview } from "./SurveyPreview";
import "./SurveyDesign.css";

export default function SurveyDesign() {
  const { templateId } = useParams();
  const id = Number(templateId || 0);

  const [loading, setLoading] = useState(true);
  const [template, setTemplate] = useState<SurveyTemplate | null>(null);
  const [versions, setVersions] = useState<SurveyTemplateVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null); // null = draft
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const [value, setValue] = useState<{ schemaJson?: string; fieldsJson?: string }>({});

  // 问卷标题/说明编辑
  const [titleDraft, setTitleDraft] = useState("");
  const [descDraft, setDescDraft] = useState("");
  const [titleEditing, setTitleEditing] = useState(false);
  const [descEditing, setDescEditing] = useState(false);
  const titleInputRef = useRef<InputRef>(null);
  const descInputRef = useRef<InputRef>(null);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      try {
        const [tpl, vers] = await Promise.all([
          getSurveyTemplate(id),
          listSurveyTemplateVersions(id),
        ]);
        setTemplate(tpl);
        setVersions(vers);
        setTitleDraft(tpl.name);
        setDescDraft(tpl.description ?? "");
        setValue({
          schemaJson: JSON.stringify(tpl.draft_schema || {}, null, 2),
          fieldsJson: JSON.stringify(tpl.draft_fields || {}, null, 2),
        });
      } catch {
        message.error("加载失败");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const isViewingVersion = selectedVersionId !== null;
  const canEdit = editing && !isViewingVersion;

  const handleVersionChange = async (versionId: number | null) => {
    setSelectedVersionId(versionId);
    if (versionId === null) {
      try {
        const tpl = await getSurveyTemplate(id);
        setTemplate(tpl);
        setTitleDraft(tpl.name);
        setDescDraft(tpl.description ?? "");
        setValue({
          schemaJson: JSON.stringify(tpl.draft_schema || {}, null, 2),
          fieldsJson: JSON.stringify(tpl.draft_fields || {}, null, 2),
        });
      } catch {
        message.error("加载草稿失败");
      }
    } else {
      const ver = versions.find((v) => v.id === versionId);
      if (ver) {
        setValue({
          schemaJson: JSON.stringify(ver.schema || {}, null, 2),
          fieldsJson: JSON.stringify(ver.fields || {}, null, 2),
        });
      }
    }
    setEditing(false);
    setTitleEditing(false);
    setDescEditing(false);
  };

  const handleSave = async () => {
    if (!template) return;
    setSaving(true);
    try {
      await updateSurveyTemplate(id, {
        name: titleDraft.trim() || template.name,
        description: descDraft.trim() || undefined,
        draft_schema: JSON.parse(value.schemaJson || "{}"),
        draft_fields: JSON.parse(value.fieldsJson || "{}"),
      });
      setTemplate((prev) => prev ? { ...prev, name: titleDraft, description: descDraft } : prev);
      message.success("已保存");
    } catch {
      message.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!template) return;
    setPublishing(true);
    try {
      await handleSave();
      const ver = await publishSurveyTemplate(id);
      setVersions((prev) => [ver, ...prev]);
      message.success(`已发布 v${ver.version}`);
    } catch {
      message.error("发布失败");
    } finally {
      setPublishing(false);
    }
  };

  const handlePreview = () => setPreviewOpen(true);

  const handleCopyNew = async () => {
    if (!template) return;
    try {
      await updateSurveyTemplate(id, {
        draft_schema: JSON.parse(value.schemaJson || "{}"),
        draft_fields: JSON.parse(value.fieldsJson || "{}"),
      });
      const ver = await publishSurveyTemplate(id);
      setVersions((prev) => [ver, ...prev]);
      setSelectedVersionId(null);
      message.success(`已复制新建 v${ver.version}`);
    } catch {
      message.error("复制新建失败");
    }
  };

  const startTitleEdit = () => {
    if (!canEdit) return;
    setTitleEditing(true);
    setTimeout(() => titleInputRef.current?.focus(), 0);
  };

  const startDescEdit = () => {
    if (!canEdit) return;
    setDescEditing(true);
    setTimeout(() => descInputRef.current?.focus(), 0);
  };

  const title = useMemo(
    () => (template ? `问卷设计 — ${template.name}` : "问卷设计"),
    [template],
  );

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh" }}>
        <Spin />
      </div>
    );
  }

  if (!id || !template) {
    return (
      <Card>
        <Typography.Text type="secondary">请选择一个模板进入设计。</Typography.Text>
      </Card>
    );
  }

  return (
    <div className="surveyDesignPage">
      <div className="surveyDesignPageHeader">
        <div className="surveyDesignPageHeaderTitleGroup">
          {/* 问卷标题 */}
          {!titleEditing ? (
            <h2 className="surveyDesignPageTitle" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {titleDraft || template?.name || "未命名问卷"}
              {canEdit && (
                <Button type="text" size="small" icon={<EditOutlined />} onClick={startTitleEdit} aria-label="编辑问卷标题" />
              )}
            </h2>
          ) : (
            <Input
              ref={titleInputRef}
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => setTitleEditing(false)}
              onPressEnter={() => setTitleEditing(false)}
              placeholder="请输入问卷标题"
              style={{ width: 320, fontSize: 17, fontWeight: 600 }}
            />
          )}

          {template.published_version > 0 && (
            <Tag color="green">v{template.published_version}</Tag>
          )}

          {/* 问卷说明 */}
          {!descEditing ? (
            <Typography.Text type="secondary" style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6, maxWidth: 480 }}>
              {descDraft || "点击编辑问卷说明"}
              {canEdit && (
                <Button type="text" size="small" icon={<EditOutlined />} onClick={startDescEdit} aria-label="编辑问卷说明" />
              )}
            </Typography.Text>
          ) : (
            <Input
              ref={descInputRef}
              value={descDraft}
              onChange={(e) => setDescDraft(e.target.value)}
              onBlur={() => setDescEditing(false)}
              onPressEnter={() => setDescEditing(false)}
              placeholder="请输入问卷说明（选填）"
              style={{ width: 400, fontSize: 13 }}
            />
          )}
        </div>

        <Space className="surveyDesignPageActions" size={12} wrap>
          <Select
            value={selectedVersionId}
            style={{ width: 200 }}
            placeholder="选择版本"
            allowClear
            onClear={() => handleVersionChange(null)}
            onChange={(v) => handleVersionChange(v ?? null)}
            options={[
              { value: null as any, label: `草稿（v${template.published_version || 0}）` },
              ...versions.map((v) => ({
                value: v.id,
                label: `v${v.version}（${new Date(v.created_at).toLocaleDateString()}）`,
              })),
            ]}
          />

          <Button onClick={handlePreview}>预览</Button>

          <Button onClick={handleCopyNew} disabled={editing}>
            复制新建
          </Button>

          {!editing ? (
            <Button type="primary" onClick={() => setEditing(true)} disabled={isViewingVersion}>
              编辑
            </Button>
          ) : (
            <>
              <Button onClick={() => {
                setEditing(false);
                setTitleEditing(false);
                setDescEditing(false);
                setTitleDraft(template?.name ?? "");
                setDescDraft(template?.description ?? "");
                setValue({
                  schemaJson: JSON.stringify(template?.draft_schema || {}, null, 2),
                  fieldsJson: JSON.stringify(template?.draft_fields || {}, null, 2),
                });
              }}>取消</Button>
              <Button onClick={() => void handleSave()} loading={saving}>保存</Button>
              <Button type="primary" onClick={() => void handlePublish()} loading={publishing}>发布</Button>
            </>
          )}
        </Space>
      </div>

      <FormDesignerEditor
        value={value}
        readOnly={isViewingVersion || !editing}
        onChange={async (next) => {
          setValue(next);
          if (!isViewingVersion) {
            try {
              await updateSurveyTemplate(id, {
                draft_schema: JSON.parse(next.schemaJson || "{}"),
                draft_fields: JSON.parse(next.fieldsJson || "{}"),
              });
            } catch {
              // silent auto-save
            }
          }
        }}
      />

      <Modal
        title="问卷预览"
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        footer={null}
        width={860}
        destroyOnClose
        centered
      >
        <SurveyPreview
          schemaJson={value.schemaJson}
          fieldsJson={value.fieldsJson}
          title={titleDraft}
          description={descDraft || undefined}
          templateId={id}
          version={template?.published_version ?? 0}
          readOnly={true}
        />
      </Modal>
    </div>
  );
}
