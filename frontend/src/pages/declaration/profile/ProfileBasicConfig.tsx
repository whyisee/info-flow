import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Form, Select, Space, Tag, message } from "antd";
import {
  putMyModuleConfig,
} from "../../../services/moduleConfig";
import {
  copyMyProfileVersionToDraft,
  getMyProfileVersion,
  listMyProfileVersions,
  publishMyProfileVersion,
  updateMyDraftProfileVersion,
  type ProfileVersionOut,
} from "../../../services/profileVersions";
import BaseInfoSection from "./sections/BaseInfoSection";
import TasksContactSection from "./sections/TasksContactSection";
import SupervisorsSection from "./sections/SupervisorsSection";
import ProfileToc from "./ProfileToc";
import {
  FORM_STATUS_KEY,
  PROFILE_MODULE,
  normalizeLoadedProfile,
  serializeProfileForApi,
  splitProfileByModule,
  stripFormStatusFromValues,
} from "./profileModuleFields";
import "./ProfileBasicConfig.css";

export default function ProfileBasicConfig() {
  const [form] = Form.useForm();
  const [editing, setEditing] = useState(false);
  const baselineRef = useRef<Record<string, unknown> | null>(null);
  const [versions, setVersions] = useState<ProfileVersionOut[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);

  const startEdit = useCallback(() => {
    baselineRef.current = form.getFieldsValue(true);
    setEditing(true);
  }, [form]);

  const cancelEdit = useCallback(() => {
    if (baselineRef.current != null) {
      form.setFieldsValue(baselineRef.current);
    }
    setEditing(false);
  }, [form]);

  const loadVersion = useCallback(
    async (versionId: number) => {
      const row = await getMyProfileVersion(versionId);
      const merged = (row.profile as any)?.merged;
      const obj = merged && typeof merged === "object" ? (merged as Record<string, unknown>) : {};
      // 版本是只读快照，不带 form_status
      form.setFieldsValue(normalizeLoadedProfile(obj));
    },
    [form],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const vs = await listMyProfileVersions().catch(() => []);
        if (cancelled) return;
        setVersions(vs);

        const latest = vs.length ? vs[0] : null;
        if (latest) {
          setSelectedVersionId(latest.id);
          await loadVersion(latest.id);
        }
      } catch {
        /* 网络错误时保留表单 initialValues */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadVersion]);

  const versionOptions = useMemo(() => {
    return [
      ...versions.map((v) => ({
        value: String(v.id),
        label: `v${v.version}（${v.status === "published" ? "已发布" : v.status === "draft" ? "草稿" : "已归档"}）`,
      })),
    ];
  }, [versions]);

  const selectedVersion = useMemo(() => {
    return versions.find((x) => x.id === selectedVersionId) || null;
  }, [selectedVersionId, versions]);

  const canEditSelected = selectedVersion?.status === "draft";
  const canCopySelected = selectedVersion?.status === "published";

  const versionStatusTag = useMemo(() => {
    const v = versions.find((x) => x.id === selectedVersionId);
    if (!v) return { color: "default" as const, text: "资料版本" };
    if (v.status === "published") return { color: "success" as const, text: `v${v.version}（已发布）` };
    if (v.status === "draft") return { color: "default" as const, text: `v${v.version}（草稿）` };
    return { color: "default" as const, text: `v${v.version}（已归档）` };
  }, [selectedVersionId, versions]);

  const persistModules = useCallback(
    async (serialized: Record<string, unknown>) => {
      const byModule = splitProfileByModule(serialized);
      await Promise.all(
        [
          PROFILE_MODULE.BASIC,
          PROFILE_MODULE.TASK,
          PROFILE_MODULE.CONTACT,
          PROFILE_MODULE.SUPERVISOR,
        ].map((m) => putMyModuleConfig(m, { config: byModule[m] })),
      );
    },
    [],
  );

  /** 保存草稿：不校验必填 */
  const onSaveDraft = useCallback(async () => {
    try {
      if (!selectedVersionId || !canEditSelected) return;
      const values = form.getFieldsValue(true) as Record<string, unknown>;
      const serialized = serializeProfileForApi({ ...values });
      serialized[FORM_STATUS_KEY] = "draft";
      await persistModules(serialized);
      const { rest } = stripFormStatusFromValues(serialized);
      const byModule = splitProfileByModule(serialized);
      await updateMyDraftProfileVersion(selectedVersionId, {
        modules: byModule,
        merged: rest,
      });
      message.success("已保存草稿");
      baselineRef.current = form.getFieldsValue(true);
    } catch {
      message.error("保存失败，请稍后重试");
    }
  }, [canEditSelected, form, persistModules, selectedVersionId]);

  /** 提交：校验全部必填项 */
  const onSubmit = useCallback(async () => {
    try {
      if (!selectedVersionId || !canEditSelected) return;
      const values = await form.validateFields();
      const serialized = serializeProfileForApi(
        values as Record<string, unknown>,
      );
      serialized[FORM_STATUS_KEY] = "submitted";
      await persistModules(serialized);
      const { rest } = stripFormStatusFromValues(serialized);
      const byModule = splitProfileByModule(serialized);
      await updateMyDraftProfileVersion(selectedVersionId, {
        modules: byModule,
        merged: rest,
      });
      await publishMyProfileVersion(selectedVersionId);
      // 重新拉取版本列表，保持下拉最新
      const vs = await listMyProfileVersions().catch(() => []);
      setVersions(vs);
      // 提交后默认切回最新版本（通常就是刚刚提交的那条）
      if (vs.length) {
        setSelectedVersionId(vs[0].id);
        await loadVersion(vs[0].id).catch(() => undefined);
      }
      message.success("已提交（已发布）");
      baselineRef.current = form.getFieldsValue(true);
      setEditing(false);
    } catch (e) {
      if ((e as { errorFields?: unknown })?.errorFields) {
        message.error("请完善必填项后再提交");
      } else {
        message.error("提交失败，请稍后重试");
      }
    }
  }, [canEditSelected, form, loadVersion, persistModules, selectedVersionId]);

  const onCopyFromPublished = useCallback(async () => {
    try {
      if (!selectedVersionId || !canCopySelected) return;
      const newDraft = await copyMyProfileVersionToDraft(selectedVersionId);
      const vs = await listMyProfileVersions().catch(() => []);
      setVersions(vs);
      setSelectedVersionId(newDraft.id);
      await loadVersion(newDraft.id).catch(() => undefined);
      baselineRef.current = form.getFieldsValue(true);
      setEditing(true);
      message.success("已基于当前版本创建草稿");
    } catch {
      message.error("创建草稿失败，请稍后重试");
    }
  }, [canCopySelected, form, loadVersion, selectedVersionId]);

  return (
    <div className="profileBasicConfig">
      {/* 全宽吸顶：与下方「主列+TOC」同宽，按钮贴卡片最右侧（含 TOC 列上方区域） */}
      <div
        className="profilePageHeader profileFirstSectionHeader profileAnchor"
        id="profile-section-basic"
      >
        <div className="profilePageHeaderTitleGroup">
          <h2 className="profileSectionTitle profileSectionTitlePrimary">
            基本信息
          </h2>
          <Tag className="profileFormStatusTag" color={versionStatusTag.color}>
            {versionStatusTag.text}
          </Tag>
        </div>
        <Space className="profileFirstSectionActions" size="middle">
          <Select
            size="middle"
            value={selectedVersionId != null ? String(selectedVersionId) : undefined}
            options={versionOptions}
            style={{ width: 220 }}
            onChange={async (v) => {
              // 切换版本时强制退出编辑态
              setEditing(false);
              baselineRef.current = null;
              const id = Number(v);
              if (!Number.isFinite(id) || id <= 0) return;
              setSelectedVersionId(id);
              await loadVersion(id).catch(() => undefined);
            }}
          />
          {!editing ? (
            <>
              {canCopySelected ? (
                <Button onClick={onCopyFromPublished}>创建复制版本</Button>
              ) : null}
              <Button type="primary" onClick={startEdit} disabled={!canEditSelected}>
                编辑
              </Button>
            </>
          ) : (
            <>
              <Button onClick={cancelEdit}>取消</Button>
              <Button onClick={onSaveDraft}>保存</Button>
              <Button type="primary" onClick={onSubmit}>
                提交
              </Button>
            </>
          )}
        </Space>
      </div>

      <div className="profileBasicConfigLayout">
        <div className="profileBasicConfigMain">
          <Form
            form={form}
            disabled={!editing || !canEditSelected}
            layout="horizontal"
            labelAlign="right"
            colon={false}
            className="profileBasicForm"
            labelCol={{ flex: "0 0 160px" }}
            wrapperCol={{ flex: "1" }}
            initialValues={{
              recommend_school: "东北石油大学",
              full_name: "xx",
              project_name: "特聘教授",
              gender: "male",
              nationality: undefined,
              id_type_display: "id_card",
              id_number: "",
              unit_attr_display: "本校",
              office_level: "none",
            }}
          >
            <BaseInfoSection editing={editing} />
            <TasksContactSection editing={editing} />
            <SupervisorsSection />
          </Form>
        </div>
        <ProfileToc />
      </div>
    </div>
  );
}
