import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Form, Select, Space, Tag, message } from "antd";
import { putMyModuleConfig } from "../../../services/moduleConfig";
import {
  copyMyProfileVersionToDraft,
  getMyProfileVersion,
  listMyProfileVersions,
  publishMyProfileVersion,
  updateMyDraftProfileVersion,
  type ProfileVersionOut,
} from "../../../services/profileVersions";
import { listEnabledProfileFieldCatalog } from "../../../services/profileFieldCatalog";
import type { ProfileFieldCatalogRow } from "../../../services/profileFieldCatalog";
import ProfileToc from "./ProfileToc";
import DynamicProfileSections from "./DynamicProfileSections";
import { buildProfileTocItems } from "./profileTocItems";
import { applyCatalogNormalize, applyCatalogSerialize } from "./profileCatalogSerialize";
import {
  FORM_STATUS_KEY,
  PROFILE_MODULE,
  buildCatalogModuleMap,
  flattenProfilePayloadForForm,
  normalizeLoadedProfile,
  serializeProfileForApi,
  splitProfileByModuleWithCatalog,
  stripFormStatusFromValues,
} from "./profileModuleFields";
import "./ProfileBasicConfig.css";
import { debugProfileForm } from "./profileFormDebug";

export default function ProfileBasicConfig() {
  const [form] = Form.useForm();
  const [editing, setEditing] = useState(false);
  const baselineRef = useRef<Record<string, unknown> | null>(null);
  const [versions, setVersions] = useState<ProfileVersionOut[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
  const [catalog, setCatalog] = useState<ProfileFieldCatalogRow[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const catalogMap = useMemo(() => buildCatalogModuleMap(catalog), [catalog]);
  const tocItems = useMemo(() => buildProfileTocItems(catalog), [catalog]);
  const catalogRef = useRef<ProfileFieldCatalogRow[]>([]);
  catalogRef.current = catalog;

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
      const flatBeforeNorm = flattenProfilePayloadForForm(row.profile);
      debugProfileForm("loadVersion:raw.profile", row.profile);
      debugProfileForm("loadVersion:after.flattenProfilePayloadForForm", flatBeforeNorm);

      let next = normalizeLoadedProfile(flatBeforeNorm);
      debugProfileForm("loadVersion:after.normalizeLoadedProfile", next);

      const cat = catalogRef.current;
      if (cat.length) {
        next = applyCatalogNormalize(next, cat);
        debugProfileForm("loadVersion:after.applyCatalogNormalize", next);
      } else {
        debugProfileForm("loadVersion:catalog.empty — 未执行 applyCatalogNormalize，字典字段可能未规范为 string");
      }

      const dictKeys = cat
        .filter((r) => r.dict_type_code && (r.data_type === "select" || r.data_type === "multi_select"))
        .map((r) => ({
          field_key: r.field_key,
          dict_type_code: r.dict_type_code,
          valueInPayload: flatBeforeNorm[r.field_key],
          valueAfterSet: next[r.field_key],
        }));
      debugProfileForm("loadVersion:dictFields.snapshot", dictKeys);

      form.setFieldsValue(next);
      queueMicrotask(() => {
        const all = form.getFieldsValue(true) as Record<string, unknown>;
        const picked: Record<string, unknown> = {};
        for (const d of dictKeys) {
          if (Object.prototype.hasOwnProperty.call(all, d.field_key)) {
            picked[d.field_key] = all[d.field_key];
          }
        }
        debugProfileForm("loadVersion:after.setFieldsValue+microtask(picked dict fields)", picked);
      });
    },
    [form],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCatalogLoading(true);
      try {
        const [vs, cat] = await Promise.all([
          listMyProfileVersions().catch(() => []),
          listEnabledProfileFieldCatalog().catch(() => {
            message.error("加载字段配置失败，将使用内置字段分块规则");
            return [] as ProfileFieldCatalogRow[];
          }),
        ]);
        if (cancelled) return;
        setVersions(vs);
        setCatalog(cat);
        catalogRef.current = cat;

        const latest = vs.length ? vs[0] : null;
        if (latest) {
          setSelectedVersionId(latest.id);
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** 字段目录挂载完成后再灌数，避免 Ant Form 控件未挂载时 setFieldsValue 不生效 */
  useEffect(() => {
    if (catalogLoading || selectedVersionId == null) return;
    void loadVersion(selectedVersionId);
  }, [catalogLoading, selectedVersionId, loadVersion]);

  const versionOptions = useMemo(() => {
    return versions.map((v) => {
      const statusText =
        v.status === "published" ? "已发布" : v.status === "draft" ? "草稿" : "已归档";
      /** 与接口路径一致：GET /users/me/profile-versions/{主键id}，勿与业务 version 号混淆 */
      return {
        value: String(v.id),
        label: `版本 v${v.version}（${statusText}）`,
      };
    });
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
      const byModule = splitProfileByModuleWithCatalog(serialized, catalogMap);
      await Promise.all(
        [
          PROFILE_MODULE.BASIC,
          PROFILE_MODULE.TASK,
          PROFILE_MODULE.CONTACT,
          PROFILE_MODULE.SUPERVISOR,
        ].map((m) => putMyModuleConfig(m, { config: byModule[m] })),
      );
    },
    [catalogMap],
  );

  const serializeForSave = useCallback(
    (values: Record<string, unknown>) => {
      let serialized = serializeProfileForApi({ ...values });
      if (catalog.length) {
        serialized = applyCatalogSerialize(serialized, catalog);
      }
      return serialized;
    },
    [catalog],
  );

  /** 保存草稿：不校验必填 */
  const onSaveDraft = useCallback(async () => {
    try {
      if (!selectedVersionId || !canEditSelected) return;
      const values = form.getFieldsValue(true) as Record<string, unknown>;
      const serialized = serializeForSave(values);
      serialized[FORM_STATUS_KEY] = "draft";
      await persistModules(serialized);
      const { rest } = stripFormStatusFromValues(serialized);
      const byModule = splitProfileByModuleWithCatalog(serialized, catalogMap);
      await updateMyDraftProfileVersion(selectedVersionId, {
        modules: byModule,
        merged: rest,
      });
      message.success("已保存草稿");
      baselineRef.current = form.getFieldsValue(true);
    } catch {
      message.error("保存失败，请稍后重试");
    }
  }, [canEditSelected, catalogMap, form, persistModules, selectedVersionId, serializeForSave]);

  /** 提交：校验全部必填项 */
  const onSubmit = useCallback(async () => {
    try {
      if (!selectedVersionId || !canEditSelected) return;
      const values = await form.validateFields();
      const serialized = serializeForSave(values as Record<string, unknown>);
      serialized[FORM_STATUS_KEY] = "submitted";
      await persistModules(serialized);
      const { rest } = stripFormStatusFromValues(serialized);
      const byModule = splitProfileByModuleWithCatalog(serialized, catalogMap);
      await updateMyDraftProfileVersion(selectedVersionId, {
        modules: byModule,
        merged: rest,
      });
      await publishMyProfileVersion(selectedVersionId);
      const vs = await listMyProfileVersions().catch(() => []);
      setVersions(vs);
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
  }, [
    canEditSelected,
    catalogMap,
    form,
    loadVersion,
    persistModules,
    selectedVersionId,
    serializeForSave,
  ]);

  const onCopyFromPublished = useCallback(async () => {
    try {
      if (!selectedVersionId || !canCopySelected) return;
      const newDraft = await copyMyProfileVersionToDraft(selectedVersionId);
      const vs = await listMyProfileVersions().catch(() => []);
      setVersions(vs);
      setSelectedVersionId(newDraft.id);
      baselineRef.current = form.getFieldsValue(true);
      setEditing(true);
      message.success("已基于当前版本创建草稿");
    } catch {
      message.error("创建草稿失败，请稍后重试");
    }
  }, [canCopySelected, form, selectedVersionId]);

  return (
    <div className="profileBasicConfig">
      <div className="profilePageHeader profileFirstSectionHeader">
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
            onChange={(v) => {
              setEditing(false);
              baselineRef.current = null;
              const id = Number(v);
              if (!Number.isFinite(id) || id <= 0) return;
              setSelectedVersionId(id);
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
          >
            <DynamicProfileSections
              catalog={catalog}
              editing={editing && !!canEditSelected}
              loading={catalogLoading}
            />
          </Form>
        </div>
        <ProfileToc items={tocItems} />
      </div>
    </div>
  );
}
