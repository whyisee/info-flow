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
  Card,
  Row,
  Col,
  Badge,
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
import { getActiveDeclarationConfig } from "../../services/declarationConfig";
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
  const [projectDeclVersions, setProjectDeclVersions] = useState<Record<number, number>>({});
  const [pickExistingMaterials, setPickExistingMaterials] = useState<Material[]>([]);
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

  useEffect(() => {
    if (!pickOpen || projects.length === 0) return;
    Promise.all(
      projects.map((p) =>
        getActiveDeclarationConfig(p.id)
          .then((row) => ({ id: p.id, version: row?.version ?? null }))
          .catch(() => ({ id: p.id, version: null })),
      ),
    ).then((results) => {
      const map: Record<number, number> = {};
      for (const r of results) {
        if (r.version != null) map[r.id] = r.version;
      }
      setProjectDeclVersions(map);
    });
  }, [pickOpen, projects]);

  useEffect(() => {
    if (pickProjectId == null) {
      setPickExistingMaterials([]);
    } else {
      setPickExistingMaterials(materials.filter((m) => m.project_id === pickProjectId));
    }
  }, [pickProjectId, materials]);

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
    navigate(`/declaration/materials/new?project_id=${pickProjectId}`, {
      state: { project_id: pickProjectId },
    });
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
        onCancel={() => setPickOpen(false)}
        footer={
          <Space>
            <Button onClick={() => setPickOpen(false)}>取消</Button>
            {pickExistingMaterials.length > 0 ? (
              <Button
                type="primary"
                onClick={confirmPick}
              >
                继续新建
              </Button>
            ) : (
              <Button
                type="primary"
                disabled={pickProjectId == null}
                onClick={confirmPick}
              >
                确定
              </Button>
            )}
          </Space>
        }
        width={720}
        destroyOnClose
      >
        <Row gutter={[16, 16]}>
          {projects.map((p) => {
            const selected = pickProjectId === p.id;
            const start = p.start_time ? dayjs(p.start_time).format("YYYY-MM-DD") : null;
            const end = p.end_time ? dayjs(p.end_time).format("YYYY-MM-DD") : null;
            const period = start && end ? `${start} 至 ${end}` : start ?? (end ?? null);
            return (
              <Col key={p.id} xs={24} sm={12}>
                <Card
                  hoverable
                  className="materialProjectPickCard"
                  style={{
                    borderColor: selected ? "#1677ff" : undefined,
                    backgroundColor: selected ? "#e6f4ff" : undefined,
                  }}
                  onClick={() => setPickProjectId(p.id)}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <Typography.Text strong style={{ fontSize: 15 }}>
                          {p.name}
                        </Typography.Text>
                        {projectDeclVersions[p.id] != null && (
                          <Tag color="blue">V{projectDeclVersions[p.id]}</Tag>
                        )}
                      </div>
                      {selected && (
                        <Badge status="success" text="已选择" />
                      )}
                    </div>
                    <div>
                      <Typography.Text style={{ fontSize: 13 }}>
                        {p.description || "暂无项目说明"}
                      </Typography.Text>
                    </div>
                    <div className="materialProjectPickCardMeta">
                      {period && (
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {period}
                        </Typography.Text>
                      )}
                      {p.created_at && (
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          创建于 {dayjs(p.created_at).format("YYYY-MM-DD")}
                        </Typography.Text>
                      )}
                    </div>
                  </div>
                </Card>
              </Col>
            );
          })}
        </Row>
        {pickExistingMaterials.length > 0 && (
          <div className="materialProjectPickWarning">
            <Typography.Text type="warning" strong>
              该项目已有 {pickExistingMaterials.length} 条申报记录：
            </Typography.Text>
            <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
              {pickExistingMaterials.map((m) => (
                <li key={m.id}>
                  <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                    申报 #{m.id} · 创建于 {formatDateTime(m.created_at)} ·{" "}
                    {materialStatusLabel(m.status, materialStepCount(m))}
                  </Typography.Text>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Modal>
    </div>
  );
}
