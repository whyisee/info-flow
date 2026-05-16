import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";

import { listDictTypes, type DataDictTypeDTO } from "../../services/dataDict";
import {
  createProfileFieldCatalog,
  listProfileFieldCatalogAdmin,
  updateProfileFieldCatalog,
  type ProfileFieldCatalogRow,
  type ProfileFieldCatalogCreatePayload,
} from "../../services/profileFieldCatalog";
import { PROFILE_MODULE } from "../declaration/profile/profileModuleFields";

import "./ProfileFieldCatalogPage.css";

const MODULE_OPTIONS = [
  { value: PROFILE_MODULE.BASIC, label: "基本信息 (declaration_basic)" },
  { value: PROFILE_MODULE.TASK, label: "任务与关键词 (declaration_task)" },
  { value: PROFILE_MODULE.CONTACT, label: "联系方式 (declaration_contact)" },
  {
    value: PROFILE_MODULE.SUPERVISOR,
    label: "导师与回避 (declaration_supervisor)",
  },
];

const ENABLED_FILTER_OPTIONS = [
  { value: "all", label: "启用：全部" },
  { value: "yes", label: "仅启用" },
  { value: "no", label: "仅停用" },
] as const;

const DATA_TYPES = [
  { value: "text", label: "单行文本" },
  { value: "textarea", label: "多行文本" },
  { value: "number", label: "数字" },
  { value: "date", label: "日期" },
  { value: "select", label: "下拉" },
  { value: "multi_select", label: "多选（预留）" },
  { value: "upload", label: "PDF 附件" },
  { value: "image", label: "图片" },
];

function catalogDataTypeUsesDict(dt: unknown): dt is "select" | "multi_select" {
  return dt === "select" || dt === "multi_select";
}

export default function ProfileFieldCatalogPage() {
  const [rows, setRows] = useState<ProfileFieldCatalogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [queryInput, setQueryInput] = useState("");
  const [moduleFilter, setModuleFilter] = useState<string | undefined>();
  const [enabledFilter, setEnabledFilter] = useState<"all" | "yes" | "no">(
    "all",
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProfileFieldCatalogRow | null>(null);
  const [form] = Form.useForm<
    ProfileFieldCatalogCreatePayload & { required_default?: boolean }
  >();
  const modalDataType = Form.useWatch("data_type", form);
  const showDictTypeField = catalogDataTypeUsesDict(modalDataType);
  const [dictTypes, setDictTypes] = useState<DataDictTypeDTO[]>([]);
  const [dictTypesLoading, setDictTypesLoading] = useState(false);

  const dictTypeSelectOptions = useMemo(() => {
    return [...dictTypes]
      .sort(
        (a, b) =>
          a.sort_order - b.sort_order || a.code.localeCompare(b.code, "zh-CN"),
      )
      .map((t) => ({
        value: t.code,
        label: `${t.name}（${t.code}）${t.is_enabled ? "" : " · 已停用"}`,
      }));
  }, [dictTypes]);

  useEffect(() => {
    if (!modalOpen) return;
    let cancelled = false;
    setDictTypesLoading(true);
    (async () => {
      try {
        const types = await listDictTypes({ include_disabled: true });
        if (!cancelled) setDictTypes(types);
      } catch {
        if (!cancelled) {
          setDictTypes([]);
          message.error("加载字典类型列表失败");
        }
      } finally {
        if (!cancelled) setDictTypesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modalOpen]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listProfileFieldCatalogAdmin({
        q: queryInput.trim() || undefined,
        module_code: moduleFilter,
        ...(enabledFilter === "yes"
          ? { enabled: true }
          : enabledFilter === "no"
            ? { enabled: false }
            : {}),
      });
      setRows(data);
    } catch {
      message.error("加载失败");
    } finally {
      setLoading(false);
    }
  }, [enabledFilter, moduleFilter, queryInput]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      data_type: "text",
      module_code: PROFILE_MODULE.BASIC,
      sort_order: 0,
      enabled: true,
      required_default: false,
    });
    setModalOpen(true);
  };

  const openEdit = (r: ProfileFieldCatalogRow) => {
    setEditing(r);
    const req = Boolean(
      (r.validation_json as { required_default?: boolean } | null)
        ?.required_default,
    );
    form.setFieldsValue({
      field_key: r.field_key,
      data_type: r.data_type,
      default_label: r.default_label,
      placeholder: r.placeholder ?? undefined,
      help_text: r.help_text ?? undefined,
      module_code: r.module_code,
      dict_type_code: r.dict_type_code ?? undefined,
      sort_order: r.sort_order,
      enabled: r.enabled,
      storage_hint: r.storage_hint ?? undefined,
      required_default: req,
    });
    setModalOpen(true);
  };

  const onSubmit = async () => {
    try {
      const v = await form.validateFields();
      const required_default = Boolean(v.required_default);
      const validation_json = { required_default };
      const dictPayload = catalogDataTypeUsesDict(v.data_type)
        ? v.dict_type_code || null
        : null;
      if (editing) {
        await updateProfileFieldCatalog(editing.id, {
          data_type: v.data_type,
          default_label: v.default_label,
          placeholder: v.placeholder,
          help_text: v.help_text,
          module_code: v.module_code,
          dict_type_code: dictPayload,
          sort_order: v.sort_order,
          enabled: v.enabled,
          storage_hint: v.storage_hint || null,
          validation_json,
        });
        message.success("已保存");
      } else {
        await createProfileFieldCatalog({
          field_key: v.field_key,
          data_type: v.data_type,
          default_label: v.default_label,
          placeholder: v.placeholder,
          help_text: v.help_text,
          module_code: v.module_code,
          dict_type_code: dictPayload,
          sort_order: v.sort_order ?? 0,
          enabled: v.enabled ?? true,
          storage_hint: v.storage_hint || null,
          validation_json,
        });
        message.success("已创建");
      }
      setModalOpen(false);
      await load();
    } catch (e) {
      if ((e as { errorFields?: unknown })?.errorFields) return;
      message.error("保存失败");
    }
  };

  const columns: ColumnsType<ProfileFieldCatalogRow> = useMemo(
    () => [
      { title: "ID", dataIndex: "id", width: 72 },
      {
        title: "field_key",
        dataIndex: "field_key",
        width: 180,
        ellipsis: true,
      },
      { title: "标签", dataIndex: "default_label", width: 160, ellipsis: true },
      {
        title: "模块",
        dataIndex: "module_code",
        width: 160,
        ellipsis: true,
      },
      { title: "类型", dataIndex: "data_type", width: 100 },
      { title: "排序", dataIndex: "sort_order", width: 72 },
      {
        title: "启用",
        dataIndex: "enabled",
        width: 72,
        render: (x: boolean) => (x ? "是" : "否"),
      },
      {
        title: "操作",
        key: "act",
        width: 88,
        fixed: "right",
        render: (_, r) => (
          <Button type="link" size="small" onClick={() => openEdit(r)}>
            编辑
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <div className="profileFieldCatalogPage">
      <div className="profileFieldCatalogToolbar">
        <h3>基本信息字段配置</h3>
        <Space wrap>
          <Input.Search
            allowClear
            placeholder="搜索 field_key / 标签"
            style={{ width: 220 }}
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            onSearch={() => void load()}
          />
          <Select
            allowClear
            placeholder="模块"
            style={{ width: 220 }}
            options={MODULE_OPTIONS}
            value={moduleFilter}
            onChange={(v) => setModuleFilter(v)}
          />
          <Select
            style={{ width: 140 }}
            options={[...ENABLED_FILTER_OPTIONS]}
            value={enabledFilter}
            onChange={(v) => setEnabledFilter(v)}
          />
          <Button onClick={() => void load()}>刷新</Button>
          <Button type="primary" onClick={openCreate}>
            新增字段
          </Button>
        </Space>
      </div>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        字段目录用于「我的资料」动态表单。语义键创建后不可改；停用后新项目可选用列表会隐藏（教师端仅展示启用项）。
      </Typography.Paragraph>
      <Table<ProfileFieldCatalogRow>
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={rows}
        scroll={{ x: 960 }}
        pagination={{ pageSize: 20, showSizeChanger: true }}
      />

      <Modal
        title={editing ? "编辑字段" : "新增字段"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => void onSubmit()}
        width={640}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item
            name="field_key"
            label="field_key"
            rules={[{ required: true, message: "必填" }]}
          >
            <Input
              placeholder="如 highest_edu_level"
              disabled={!!editing}
              autoComplete="off"
            />
          </Form.Item>
          <Form.Item
            name="data_type"
            label="数据类型"
            rules={[{ required: true }]}
          >
            <Select
              options={DATA_TYPES}
              onChange={(val) => {
                if (!catalogDataTypeUsesDict(val)) {
                  form.setFieldValue("dict_type_code", undefined);
                }
              }}
            />
          </Form.Item>
          <Form.Item
            name="default_label"
            label="默认标签"
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="placeholder" label="占位提示">
            <Input />
          </Form.Item>
          <Form.Item name="help_text" label="帮助说明">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item
            name="module_code"
            label="归属模块"
            rules={[{ required: true }]}
          >
            <Select options={MODULE_OPTIONS} />
          </Form.Item>
          {showDictTypeField ? (
            <Form.Item name="dict_type_code" label="字典类型">
              <Select
                allowClear
                placeholder="请选择字典类型（存 type code）"
                loading={dictTypesLoading}
                showSearch
                optionFilterProp="label"
                options={dictTypeSelectOptions}
                popupMatchSelectWidth={440}
              />
            </Form.Item>
          ) : null}
          <Form.Item name="sort_order" label="排序">
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            name="required_default"
            label="默认必填"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="storage_hint" label="存储提示（可选）">
            <Input placeholder="scalar / attachment_id 等" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
