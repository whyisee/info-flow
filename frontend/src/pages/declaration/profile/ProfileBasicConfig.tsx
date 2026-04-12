import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Form, Space, Tag, message } from "antd";
import {
  putMyModuleConfig,
  listMyModuleConfigs,
} from "../../../services/moduleConfig";
import BaseInfoSection from "./sections/BaseInfoSection";
import TasksContactSection from "./sections/TasksContactSection";
import SupervisorsSection from "./sections/SupervisorsSection";
import ProfileToc from "./ProfileToc";
import {
  FORM_STATUS_KEY,
  PROFILE_MODULE,
  mergeModulesIntoFormValues,
  normalizeLoadedProfile,
  serializeProfileForApi,
  splitProfileByModule,
  stripFormStatusFromValues,
  type ProfileFormStatus,
} from "./profileModuleFields";
import "./ProfileBasicConfig.css";

export default function ProfileBasicConfig() {
  const [form] = Form.useForm();
  const [editing, setEditing] = useState(false);
  const [formStatus, setFormStatus] = useState<ProfileFormStatus>("draft");
  const baselineRef = useRef<Record<string, unknown> | null>(null);

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await listMyModuleConfigs();
        if (cancelled || !rows.length) return;
        const merged = mergeModulesIntoFormValues(
          rows.map((r) => ({ module: r.module, config: r.config })),
        );
        const { rest, status } = stripFormStatusFromValues(merged);
        setFormStatus(status);
        form.setFieldsValue(normalizeLoadedProfile(rest));
      } catch {
        /* 无记录或网络错误时保留表单 initialValues */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form]);

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
      const values = form.getFieldsValue(true) as Record<string, unknown>;
      const serialized = serializeProfileForApi({ ...values });
      serialized[FORM_STATUS_KEY] = "draft";
      await persistModules(serialized);
      setFormStatus("draft");
      message.success("已保存草稿");
      baselineRef.current = form.getFieldsValue(true);
    } catch {
      message.error("保存失败，请稍后重试");
    }
  }, [form, persistModules]);

  /** 提交：校验全部必填项 */
  const onSubmit = useCallback(async () => {
    try {
      const values = await form.validateFields();
      const serialized = serializeProfileForApi(
        values as Record<string, unknown>,
      );
      serialized[FORM_STATUS_KEY] = "submitted";
      await persistModules(serialized);
      setFormStatus("submitted");
      message.success("已提交");
      baselineRef.current = form.getFieldsValue(true);
      setEditing(false);
    } catch (e) {
      if ((e as { errorFields?: unknown })?.errorFields) {
        message.error("请完善必填项后再提交");
      } else {
        message.error("提交失败，请稍后重试");
      }
    }
  }, [form, persistModules]);

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
          <Tag
            className="profileFormStatusTag"
            color={formStatus === "submitted" ? "success" : "default"}
          >
            {formStatus === "submitted" ? "已提交" : "草稿"}
          </Tag>
        </div>
        <Space className="profileFirstSectionActions" size="middle">
          {!editing ? (
            <Button type="primary" onClick={startEdit}>
              编辑
            </Button>
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
            disabled={!editing}
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
