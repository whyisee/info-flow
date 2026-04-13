import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Table,
  Tag,
  message,
  Modal,
  Select,
  Form,
  Input,
  Space,
  Typography,
} from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import type { Material, Project } from "../../types";
import {
  isMaterialDone,
  isMaterialInReview,
  materialStatusLabel,
  materialStepCount,
} from "../../utils/materialApproval";
import * as materialService from "../../services/materials";
import * as projectService from "../../services/projects";
import "./MaterialList.css";

const MATERIAL_STATUS_FILTER_OPTIONS = [
  { value: "all" as const, label: "全部状态" },
  { value: 0 as const, label: "草稿" },
  { value: "in" as const, label: "审批中" },
  { value: "done" as const, label: "已通过" },
  { value: 5 as const, label: "已驳回" },
];

function formatDateTime(iso: string | undefined | null): string {
  if (iso == null || iso === "") return "—";
  const d = dayjs(iso);
  return d.isValid() ? d.format("YYYY-MM-DD HH:mm") : "—";
}

type MaterialListAppliedFilter = {
  keyword: string;
  project_id: number | "all" | undefined;
  status: number | "all" | "in" | "done";
};

function buildAppliedFilter(values: {
  keyword?: string;
  project_id?: number | "all" | null;
  status?: number | "all" | "in" | "done" | null;
}): MaterialListAppliedFilter {
  const keyword = values.keyword?.trim() ?? "";
  const projectRaw = values.project_id;
  const project_id =
    projectRaw === undefined || projectRaw === null || projectRaw === "all"
      ? "all"
      : projectRaw;
  const raw = values.status;
  const status =
    raw === undefined || raw === null ? "all" : raw;
  return { keyword, project_id, status };
}

export default function MaterialList() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [pickProjectId, setPickProjectId] = useState<number | undefined>();
  const [appliedFilter, setAppliedFilter] = useState<MaterialListAppliedFilter>({
    keyword: "",
    project_id: "all",
    status: "all",
  });
  const [filterForm] = Form.useForm();
  const navigate = useNavigate();

  const loadMaterials = useCallback(() => {
    setLoading(true);
    materialService
      .getMaterials()
      .then(setMaterials)
      .catch(() => message.error("获取申报列表失败"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadMaterials();
  }, [loadMaterials]);

  useEffect(() => {
    projectService.getProjects().then(setProjects).catch(() => {});
  }, []);

  const projectById = useMemo(() => {
    const m = new Map<number, Project>();
    for (const p of projects) m.set(p.id, p);
    return m;
  }, [projects]);

  const filteredMaterials = useMemo(() => {
    const kw = appliedFilter.keyword.toLowerCase();
    return materials.filter((row) => {
      if (appliedFilter.project_id !== "all" && row.project_id !== appliedFilter.project_id) {
        return false;
      }
      if (appliedFilter.status !== "all") {
        if (appliedFilter.status === "in") {
          if (!isMaterialInReview(row)) return false;
        } else if (appliedFilter.status === "done") {
          if (!isMaterialDone(row)) return false;
        } else if (row.status !== appliedFilter.status) {
          return false;
        }
      }
      if (!kw) return true;
      const p = projectById.get(row.project_id);
      const blob = [
        String(row.id),
        p?.name,
        p?.description ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return blob.includes(kw);
    });
  }, [materials, appliedFilter, projectById]);

  const onFilterSearch = () => {
    const values = filterForm.getFieldsValue();
    setAppliedFilter(buildAppliedFilter(values));
  };

  const onFilterReset = () => {
    filterForm.resetFields();
    filterForm.setFieldsValue({ project_id: "all", status: "all" });
    setAppliedFilter({ keyword: "", project_id: "all", status: "all" });
  };

  const columns = [
    { title: "ID", dataIndex: "id", key: "id", width: 72 },
    {
      title: "项目名称",
      key: "project_name",
      ellipsis: true,
      render: (_: unknown, r: Material) => {
        const p = projectById.get(r.project_id);
        return p?.name ?? `项目 #${r.project_id}`;
      },
    },
    {
      title: "项目说明",
      key: "project_desc",
      className: "materialListDescCell",
      ellipsis: true,
      render: (_: unknown, r: Material) => {
        const d = projectById.get(r.project_id)?.description?.trim();
        return d ? (
          <Typography.Text ellipsis={{ tooltip: d }}>{d}</Typography.Text>
        ) : (
          <span className="ant-typography-secondary">—</span>
        );
      },
    },
    {
      title: "项目创建时间",
      key: "project_created",
      width: 168,
      render: (_: unknown, r: Material) =>
        formatDateTime(projectById.get(r.project_id)?.created_at),
    },
    {
      title: "申报状态",
      dataIndex: "status",
      key: "status",
      width: 140,
      render: (_: number, r: Material) => {
        const n = materialStepCount(r);
        const label = materialStatusLabel(r.status, n);
        const color =
          r.status === 0
            ? "default"
            : r.status === 5
              ? "red"
              : isMaterialDone(r)
                ? "green"
                : "processing";
        return <Tag color={color}>{label}</Tag>;
      },
    },
    {
      title: "申报创建时间",
      dataIndex: "created_at",
      key: "created_at",
      width: 168,
      render: (v: string | undefined) => formatDateTime(v),
    },
    {
      title: "提交时间",
      dataIndex: "submitted_at",
      key: "submitted_at",
      width: 168,
      render: (v: string | undefined) => formatDateTime(v),
    },
    {
      title: "操作",
      key: "action",
      width: 88,
      fixed: "right" as const,
      render: (_: unknown, record: Material) => (
        <Button type="link" size="small" onClick={() => navigate(`/declaration/materials/${record.id}`)}>
          {record.status === 0 ? "编辑" : "查看"}
        </Button>
      ),
    },
  ];

  const openPick = () => {
    setPickProjectId(undefined);
    setPickOpen(true);
  };

  const confirmPick = () => {
    if (pickProjectId == null) return;
    navigate(`/declaration/materials/new?project_id=${pickProjectId}`);
    setPickOpen(false);
  };

  const projectFilterOptions = useMemo(
    () => [
      { value: "all" as const, label: "全部项目" },
      ...projects.map((p) => ({ value: p.id, label: p.name })),
    ],
    [projects],
  );

  return (
    <div className="materialListPage">
      <div className="materialListToolbar">
        <h3 className="materialListTitle">我的申报</h3>
      </div>

      <Form
        form={filterForm}
        layout="inline"
        className="materialListFilters"
        onFinish={onFilterSearch}
        initialValues={{ project_id: "all", status: "all" }}
      >
        <div className="materialListFiltersMain">
          <Form.Item name="keyword" label="关键词">
            <Input allowClear placeholder="申报 ID、项目名称、项目说明" style={{ width: 220 }} />
          </Form.Item>
          <Form.Item name="project_id" label="项目">
            <Select
              placeholder="全部项目"
              options={projectFilterOptions}
              showSearch
              optionFilterProp="label"
              style={{ width: 200 }}
            />
          </Form.Item>
          <Form.Item name="status" label="申报状态">
            <Select options={MATERIAL_STATUS_FILTER_OPTIONS} style={{ width: 160 }} />
          </Form.Item>
          <Form.Item className="materialListFilterActions">
            <Space wrap size="middle">
              <Button type="primary" htmlType="submit">
                查询
              </Button>
              <Button onClick={onFilterReset}>重置</Button>
              <Button type="primary" htmlType="button" icon={<PlusOutlined />} onClick={openPick}>
                新建申报
              </Button>
            </Space>
          </Form.Item>
        </div>
      </Form>

      <Table
        className="materialListTable"
        columns={columns}
        dataSource={filteredMaterials}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1180 }}
      />

      <Modal
        title="选择申报项目"
        open={pickOpen}
        onOk={confirmPick}
        onCancel={() => setPickOpen(false)}
        okButtonProps={{ disabled: pickProjectId == null }}
        destroyOnClose
      >
        <Select
          style={{ width: "100%" }}
          placeholder="请选择项目"
          value={pickProjectId}
          onChange={(v) => setPickProjectId(v)}
          options={projects.map((p) => ({
            value: p.id,
            label: p.name,
            title: p.description?.trim() ? `${p.name} — ${p.description}` : p.name,
          }))}
          showSearch
          optionFilterProp="label"
        />
      </Modal>
    </div>
  );
}
