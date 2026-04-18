import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Drawer,
  Input,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import type { ApprovalRecord, Material, Project } from "../../types";
import {
  materialStatusLabel,
  materialStepCount,
} from "../../utils/materialApproval";
import * as approvalService from "../../services/approvals";
import * as materialService from "../../services/materials";
import * as projectService from "../../services/projects";
import * as userService from "../../services/users";
import { useAuth } from "../../store/AuthContext";
import { useNavigate } from "react-router-dom";
import MaterialApprovalProgress from "../materials/MaterialApprovalProgress";
import "./ApprovalCenterPage.css";

const STATUS_COLORS: Record<number, string> = {
  0: "default",
  1: "processing",
  2: "blue",
  3: "cyan",
  4: "green",
  5: "red",
};

const PERM_FILL = "declaration:material:fill";
const PERM_PROCESS = "declaration:approval:process";

function MyProgressPanel() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeMaterial, setActiveMaterial] = useState<Material | null>(null);

  const projectNameById = useMemo(() => {
    const m = new Map<number, string>();
    projects.forEach((p) => m.set(p.id, p.name));
    return m;
  }, [projects]);

  const load = () => {
    setLoading(true);
    Promise.all([materialService.getMaterials(), projectService.getProjects()])
      .then(([matRows, projRows]) => {
        setMaterials(matRows);
        setProjects(projRows);
      })
      .catch(() => message.error("加载失败"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="approvalCenterPanel">
      <div className="approvalCenterPanelHeader">
        <Typography.Text type="secondary">
          查看本人各条申报的环节与审批记录；编辑内容请在「我的申报」中操作。
        </Typography.Text>
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
          刷新
        </Button>
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={materials}
        pagination={false}
        columns={[
          {
            title: "申报项目",
            key: "project",
            render: (_: unknown, row: Material) =>
              projectNameById.get(row.project_id) ?? `项目 #${row.project_id}`,
          },
          {
            title: "当前环节",
            dataIndex: "status",
            key: "status",
            width: 140,
            render: (_: number, row: Material) => {
              const n = materialStepCount(row);
              const label = materialStatusLabel(row.status, n);
              const color =
                row.status === 0
                  ? "default"
                  : row.status === 5
                    ? "red"
                    : row.status === n + 1
                      ? "green"
                      : STATUS_COLORS[row.status] ?? "processing";
              return <Tag color={color}>{label}</Tag>;
            },
          },
          {
            title: "提交时间",
            dataIndex: "submitted_at",
            key: "submitted_at",
            width: 200,
            render: (t: string | undefined) => t ?? "—",
          },
          {
            title: "操作",
            key: "action",
            width: 120,
            render: (_: unknown, row: Material) => (
              <Button
                type="link"
                onClick={() => {
                  setActiveMaterial(row);
                  setDrawerOpen(true);
                }}
              >
                查看进度
              </Button>
            ),
          },
        ]}
      />
      <Drawer
        title={
          activeMaterial ? `审批详情 · 申报 #${activeMaterial.id}` : "审批详情"
        }
        width={520}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setActiveMaterial(null);
        }}
        destroyOnHidden
      >
        {activeMaterial ? (
          <MaterialApprovalProgress
            materialId={activeMaterial.id}
            materialStatus={activeMaterial.status}
            projectId={activeMaterial.project_id}
            snapshotDisplay={activeMaterial.approval_snapshot_display ?? null}
          />
        ) : null}
      </Drawer>
    </div>
  );
}

function PendingApprovalsPanel() {
  const navigate = useNavigate();
  const [records, setRecords] = useState<ApprovalRecord[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<{ id: number; name: string; username: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const [qMaterialId, setQMaterialId] = useState("");
  const [qProjectId, setQProjectId] = useState<number | null>(null);
  const [qStatus, setQStatus] = useState<number | null>(null);

  const projectNameById = useMemo(() => {
    const m = new Map<number, string>();
    projects.forEach((p) => m.set(p.id, p.name));
    return m;
  }, [projects]);

  const materialById = useMemo(() => {
    const m = new Map<number, Material>();
    materials.forEach((row) => m.set(row.id, row));
    return m;
  }, [materials]);

  const userLabelById = useMemo(() => {
    const m = new Map<number, string>();
    users.forEach((u) => {
      const label = u.name?.trim() ? `${u.name}（${u.username}）` : u.username;
      m.set(u.id, label);
    });
    return m;
  }, [users]);

  const fetchPending = useCallback(async () => {
    setLoading(true);
    try {
      const [data, mats, projs, us] = await Promise.all([
        approvalService.getMyApprovalQueue(),
        materialService.getMaterials(),
        projectService.getProjects(),
        userService.listUsers({ user_status: "active" }).catch(() => []),
      ]);
      setRecords(data);
      setMaterials(mats);
      setProjects(projs);
      setUsers(us.map((u) => ({ id: u.id, name: u.name, username: u.username })));
    } catch {
      message.error("获取待审批列表失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  const projectOptions = useMemo(() => {
    return projects.map((p) => ({ value: p.id, label: p.name }));
  }, [projects]);

  const filtered = useMemo(() => {
    const mid = qMaterialId.trim();
    const midNum = mid && /^\d+$/.test(mid) ? Number(mid) : null;
    return records.filter((r) => {
      if (midNum != null && r.material_id !== midNum) return false;
      if (qStatus != null && (r.my_action_status ?? 0) !== qStatus) return false;
      if (qProjectId != null) {
        const m = materialById.get(r.material_id);
        if (!m || m.project_id !== qProjectId) return false;
      }
      return true;
    });
  }, [materialById, qMaterialId, qProjectId, qStatus, records]);

  return (
    <div className="approvalCenterPanel">
      <div className="approvalCenterPanelHeader">
        <Space wrap className="approvalCenterFilters">
          <Input
            allowClear
            value={qMaterialId}
            placeholder="材料ID"
            className="approvalCenterFilterInput"
            onChange={(e) => setQMaterialId(e.target.value)}
            onPressEnter={fetchPending}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="项目"
            className="approvalCenterFilterSelect"
            options={projectOptions}
            value={qProjectId ?? undefined}
            onChange={(v) => setQProjectId(v == null ? null : Number(v))}
          />
          <Select
            allowClear
            placeholder="我的处理状态"
            className="approvalCenterFilterSelect"
            value={qStatus ?? undefined}
            onChange={(v) => setQStatus(v == null ? null : Number(v))}
            options={[
              { value: 0, label: "未处理" },
              { value: 1, label: "通过" },
              { value: 2, label: "驳回" },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={fetchPending} loading={loading}>
            刷新
          </Button>
          <Button
            onClick={() => {
              setQMaterialId("");
              setQProjectId(null);
              setQStatus(null);
            }}
          >
            重置
          </Button>
        </Space>
        <Typography.Text type="secondary">
          共 {filtered.length} 条
        </Typography.Text>
      </div>
      <Table
        columns={[
          {
            title: "材料",
            dataIndex: "material_id",
            key: "material_id",
            width: 120,
            render: (id: number) => `#${id}`,
          },
          {
            title: "项目",
            key: "project",
            render: (_: unknown, record: ApprovalRecord) => {
              const m = materialById.get(record.material_id);
              if (!m) return "—";
              return projectNameById.get(m.project_id) ?? `项目 #${m.project_id}`;
            },
          },
          {
            title: "提交人",
            key: "submitter",
            width: 180,
            render: (_: unknown, record: ApprovalRecord) => {
              const m = materialById.get(record.material_id);
              if (!m) return "—";
              return userLabelById.get(m.user_id) ?? `用户 #${m.user_id}`;
            },
          },
          {
            title: "我的处理状态",
            key: "my_action_status",
            width: 140,
            render: (_: unknown, record: ApprovalRecord) => {
              const s = record.my_action_status ?? 0;
              const label = s === 1 ? "通过" : s === 2 ? "驳回" : "未处理";
              const color = s === 1 ? "green" : s === 2 ? "red" : "default";
              return <Tag color={color}>{label}</Tag>;
            },
          },
          {
            title: "提交时间",
            key: "submitted_at",
            width: 200,
            render: (_: unknown, record: ApprovalRecord) => {
              const m = materialById.get(record.material_id);
              return m?.submitted_at ?? "—";
            },
          },
          {
            title: "并行待办",
            key: "parallel",
            width: 140,
            render: (_: unknown, record: ApprovalRecord) => {
              const lanes = record.pending_parallel_lane_indexes;
              if (!lanes || lanes.length === 0) return "—";
              if (lanes.length === 1) return `子轨 ${lanes[0] + 1}`;
              return `${lanes.length} 条子轨待办`;
            },
          },
          {
            title: "操作",
            key: "action",
            width: 120,
            render: (_: unknown, record: ApprovalRecord) => (
              <Button
                type="primary"
                onClick={() => {
                  navigate(`/declaration/approvals/process/${record.material_id}`, {
                    state: { from: "pending" },
                  });
                }}
              >
                处理
              </Button>
            ),
          },
        ]}
        dataSource={filtered}
        rowKey="material_id"
        loading={loading}
      />
    </div>
  );
}

export default function ApprovalCenterPage() {
  const { user } = useAuth();
  const perms = user?.permissions ?? [];
  const canFill = perms.includes(PERM_FILL);
  const canProcess = perms.includes(PERM_PROCESS);

  if (!canFill && !canProcess) {
    return (
      <Typography.Text type="secondary">
        您暂无申报审批相关权限。
      </Typography.Text>
    );
  }

  if (canFill && canProcess) {
    return (
      <div className="approvalCenter">
        <Typography.Title level={4} className="approvalCenterTitle">
          审批中心
        </Typography.Title>
        <Tabs
          destroyOnHidden
          items={[
            {
              key: "my",
              label: "我的进度",
              children: <MyProgressPanel />,
            },
            {
              key: "pending",
              label: "待我审批",
              children: <PendingApprovalsPanel />,
            },
          ]}
        />
      </div>
    );
  }

  if (canFill) {
    return (
      <div className="approvalCenter">
        <Typography.Title level={4} className="approvalCenterTitle">
          审批中心
        </Typography.Title>
        <MyProgressPanel />
      </div>
    );
  }

  return (
    <div className="approvalCenter">
      <Typography.Title level={4} className="approvalCenterTitle">
        审批中心
      </Typography.Title>
      <PendingApprovalsPanel />
    </div>
  );
}
