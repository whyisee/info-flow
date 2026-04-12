import { useCallback, useEffect, useState } from "react";
import { Card, Form, Spin } from "antd";
import { listMyModuleConfigs } from "../../services/moduleConfig";
import BaseInfoSection from "../declaration/profile/sections/BaseInfoSection";
import TasksContactSection from "../declaration/profile/sections/TasksContactSection";
import SupervisorsSection from "../declaration/profile/sections/SupervisorsSection";
import {
  PROFILE_MODULE,
  mergeModulesIntoFormValues,
  normalizeLoadedProfile,
  stripFormStatusFromValues,
} from "../declaration/profile/profileModuleFields";
import "../declaration/profile/ProfileBasicConfig.css";
import "../../features/declaration-config-render/DeclarationConfigRenderer.css";
import "./MaterialBasicInfoFromProfile.css";

const PROFILE_LOAD_MODULES = [
  PROFILE_MODULE.BASIC,
  PROFILE_MODULE.TASK,
  PROFILE_MODULE.CONTACT,
  PROFILE_MODULE.SUPERVISOR,
] as const;

export default function MaterialBasicInfoFromProfile() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [hasConfig, setHasConfig] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listMyModuleConfigs();
      const basic = rows.find((r) => r.module === PROFILE_MODULE.BASIC);
      const basicCfg = basic?.config;
      if (!basicCfg || typeof basicCfg !== "object") {
        form.resetFields();
        setHasConfig(false);
        return;
      }
      const merged = mergeModulesIntoFormValues(
        PROFILE_LOAD_MODULES.map((module) => {
          const row = rows.find((r) => r.module === module);
          const c = row?.config;
          return {
            module,
            config:
              c && typeof c === "object" ? (c as Record<string, unknown>) : {},
          };
        }),
      );
      const { rest } = stripFormStatusFromValues(merged);
      const normalized = normalizeLoadedProfile(rest);
      if (Object.keys(normalized).length === 0) {
        form.resetFields();
        setHasConfig(false);
        return;
      }
      form.setFieldsValue(normalized);
      setHasConfig(true);
    } catch {
      form.resetFields();
      setHasConfig(false);
    } finally {
      setLoading(false);
    }
  }, [form]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="materialBasicInfoFromProfile">
      <Card size="small" className="declCfgRenderSubCard">
        <Spin spinning={loading}>
          {hasConfig ? (
            <div className="profileBasicConfigMain">
              <Form
                form={form}
                disabled
                layout="horizontal"
                labelAlign="right"
                colon={false}
                className="profileBasicForm"
                labelCol={{ flex: "0 0 160px" }}
                wrapperCol={{ flex: "1" }}
              >
                <BaseInfoSection editing={false} />
                <TasksContactSection editing={false} />
                <SupervisorsSection />
              </Form>
            </div>
          ) : null}
        </Spin>
      </Card>
    </div>
  );
}
