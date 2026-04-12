import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useNavigate } from "react-router-dom";
import {
  createDictType,
  deleteDictType,
  listDictTypes,
  updateDictType,
  type DataDictTypeDTO,
} from "../../services/dataDict";
import "./DictMaintenance.css";

function dictItemsPath(typeCode: string) {
  return `/system/dict/${encodeURIComponent(typeCode)}/items`;
}

const TYPE_STATUS_OPTIONS: { value: "all" | "enabled" | "disabled"; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "enabled", label: "仅启用" },
  { value: "disabled", label: "仅停用" },
];

type DictTypeAppliedFilter = {
  keyword: string;
  type_status: "all" | "enabled" | "disabled";
};

function rowMatchesDictTypeFilter(row: DataDictTypeDTO, q: DictTypeAppliedFilter): boolean {
  if (q.type_status === "enabled" && !row.is_enabled) return false;
  if (q.type_status === "disabled" && row.is_enabled) return false;
  const kw = q.keyword.trim().toLowerCase();
  if (!kw) return true;
  const hay = [row.code, row.name, row.description ?? ""].join(" ").toLowerCase();
  return hay.includes(kw);
}

export default function DictMaintenance() {
  const navigate = useNavigate();
  const [types, setTypes] = useState<DataDictTypeDTO[]>([]);
  const [typesLoading, setTypesLoading] = useState(false);

  const [filterForm] = Form.useForm();
  const [appliedFilter, setAppliedFilter] = useState<DictTypeAppliedFilter>({
    keyword: "",
    type_status: "all",
  });

  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [editingType, setEditingType] = useState<DataDictTypeDTO | null>(null);
  const [typeForm] = Form.useForm();

  const loadTypes = useCallback(async () => {
    setTypesLoading(true);
    try {
      const rows = await listDictTypes({ include_disabled: true });
      setTypes(rows);
    } catch {
      message.error("加载字典类型失败");
    } finally {
      setTypesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTypes();
  }, [loadTypes]);

  const filteredTypes = useMemo(
    () => types.filter((row) => rowMatchesDictTypeFilter(row, appliedFilter)),
    [types, appliedFilter],
  );

  const onFilterSearch = () => {
    const v = filterForm.getFieldsValue() as {
      keyword?: string;
      type_status?: "all" | "enabled" | "disabled";
    };
    setAppliedFilter({
      keyword: (v.keyword ?? "").trim(),
      type_status: v.type_status ?? "all",
    });
  };

  const onFilterReset = () => {
    filterForm.resetFields();
    filterForm.setFieldsValue({ type_status: "all" });
    setAppliedFilter({ keyword: "", type_status: "all" });
  };

  const openCreateType = () => {
    setEditingType(null);
    typeForm.resetFields();
    typeForm.setFieldsValue({
      sort_order: 0,
      is_enabled: true,
    });
    setTypeModalOpen(true);
  };

  const openEditType = (row: DataDictTypeDTO) => {
    setEditingType(row);
    typeForm.setFieldsValue({
      code: row.code,
      name: row.name,
      description: row.description ?? "",
      sort_order: row.sort_order,
      is_enabled: row.is_enabled,
    });
    setTypeModalOpen(true);
  };

  const submitType = async () => {
    try {
      const v = await typeForm.validateFields();
      if (editingType) {
        await updateDictType(editingType.code, {
          name: v.name,
          description: v.description || null,
          sort_order: v.sort_order,
          is_enabled: v.is_enabled,
        });
        message.success("已保存");
      } else {
        await createDictType({
          code: v.code,
          name: v.name,
          description: v.description || null,
          sort_order: v.sort_order ?? 0,
          is_enabled: v.is_enabled ?? true,
        });
        message.success("已创建");
      }
      setTypeModalOpen(false);
      await loadTypes();
    } catch (e) {
      if ((e as { errorFields?: unknown })?.errorFields) return;
      message.error("保存失败");
    }
  };

  const typeColumns: ColumnsType<DataDictTypeDTO> = [
    { title: "编码", dataIndex: "code", width: 180 },
    { title: "名称", dataIndex: "name" },
    {
      title: "排序",
      dataIndex: "sort_order",
      width: 88,
    },
    {
      title: "状态",
      dataIndex: "is_enabled",
      width: 88,
      render: (v: boolean) =>
        v ? <Tag color="success">启用</Tag> : <Tag>停用</Tag>,
    },
    {
      title: "操作",
      key: "actions",
      width: 220,
      render: (_, row) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            onClick={() =>
              navigate(dictItemsPath(row.code), {
                state: { dictTypeName: row.name },
              })
            }
          >
            维护
          </Button>
          <Button type="link" size="small" onClick={() => openEditType(row)}>
            编辑
          </Button>
          <Popconfirm
            title="删除该字典类型将同时删除其下全部字典项，确定？"
            onConfirm={async () => {
              try {
                await deleteDictType(row.code);
                message.success("已删除");
                await loadTypes();
              } catch {
                message.error("删除失败");
              }
            }}
          >
            <Button type="link" size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="dictMaintenance">
      <div className="dictMaintenanceToolbar">
        <h3 className="dictMaintenanceTitle">字典维护</h3>
      </div>

      <Form
        form={filterForm}
        layout="inline"
        className="dictMaintenanceFilters"
        onFinish={onFilterSearch}
        initialValues={{ type_status: "all" }}
      >
        <div className="dictMaintenanceFiltersMain">
          <Form.Item name="keyword" label="关键词">
            <Input allowClear placeholder="编码、名称、说明" style={{ width: 220 }} />
          </Form.Item>
          <Form.Item name="type_status" label="状态">
            <Select options={TYPE_STATUS_OPTIONS} style={{ width: 120 }} />
          </Form.Item>
          <Form.Item className="dictMaintenanceFilterActions">
            <Space wrap size="middle">
              <Button type="primary" htmlType="submit">
                查询
              </Button>
              <Button onClick={onFilterReset}>重置</Button>
              <Button type="primary" htmlType="button" onClick={openCreateType}>
                新建类型
              </Button>
            </Space>
          </Form.Item>
        </div>
      </Form>

      <Table<DataDictTypeDTO>
        className="dictMaintenanceTable"
        rowKey="id"
        loading={typesLoading}
        columns={typeColumns}
        dataSource={filteredTypes}
        pagination={{ pageSize: 12, showSizeChanger: true }}
        size="small"
      />

      <Modal
        title={editingType ? "编辑字典类型" : "新建字典类型"}
        open={typeModalOpen}
        onOk={submitType}
        onCancel={() => setTypeModalOpen(false)}
        destroyOnClose
        width={520}
      >
        <Form form={typeForm} layout="vertical">
          <Form.Item
            name="code"
            label="编码"
            rules={[
              { required: true, message: "请输入编码" },
              {
                pattern: /^[a-z][a-z0-9_]*$/,
                message: "以小写字母开头，仅小写、数字、下划线",
              },
            ]}
          >
            <Input
              placeholder="如 work_region"
              disabled={!!editingType}
              autoComplete="off"
            />
          </Form.Item>
          <Form.Item
            name="name"
            label="名称"
            rules={[{ required: true, message: "请输入名称" }]}
          >
            <Input placeholder="显示名称" />
          </Form.Item>
          <Form.Item name="description" label="说明">
            <Input.TextArea rows={2} placeholder="选填" />
          </Form.Item>
          <Form.Item name="sort_order" label="排序">
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="is_enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
