import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Drawer,
  Input,
  Modal,
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
import { useAuth } from "../../store/AuthContext";
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
  const [records, setRecords] = useState<ApprovalRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchPending = async () => {
    setLoading(true);
    try {
      const data = await approvalService.getPendingApprovals();
      setRecords(data);
    } catch {
      message.error("获取待审批列表失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPending();
  }, []);

  const handleAction = async (
    materialId: number,
    action: "approve" | "return" | "reject",
    record?: ApprovalRecord,
  ) => {
    let comment = "";
    const pendingLanes = record?.pending_parallel_lane_indexes;
    const needParallelPick =
      (action === "approve" || action === "return") &&
      pendingLanes &&
      pendingLanes.length > 1;
    let laneIndex: number | null | undefined =
      pendingLanes?.length === 1 ? pendingLanes[0] : undefined;

    Modal.confirm({
      title:
        action === "approve"
          ? "审批通过"
          : action === "return"
            ? "退回修改"
            : "驳回",
      content: (
        <div className="approvalCenterActionModal">
          {needParallelPick ? (
            <Select
              placeholder="请选择并行子轨"
              style={{ width: "100%", marginBottom: 12 }}
              options={pendingLanes.map((i) => ({
                value: i,
                label: `子轨 ${i + 1}`,
              }))}
              onChange={(v) => {
                laneIndex = v;
              }}
            />
          ) : null}
          <Input.TextArea
            placeholder="请输入意见"
            onChange={(e) => {
              comment = e.target.value;
            }}
          />
        </div>
      ),
      onOk: async () => {
        if (needParallelPick && (laneIndex === undefined || laneIndex === null)) {
          message.error("请选择并行子轨");
          return Promise.reject(new Error("no lane"));
        }
        const fn =
          action === "approve"
            ? approvalService.approve
            : action === "return"
              ? approvalService.returnMaterial
              : approvalService.reject;
        const laneArg =
          action === "reject"
            ? undefined
            : pendingLanes && pendingLanes.length === 1
              ? pendingLanes[0]
              : laneIndex;
        await fn(
          materialId,
          comment,
          laneArg === undefined ? undefined : laneArg,
        );
        message.success("操作成功");
        fetchPending();
      },
    });
  };

  return (
    <div className="approvalCenterPanel">
      <Space style={{ marginBottom: 12 }}>
        <Button icon={<ReloadOutlined />} onClick={fetchPending} loading={loading}>
          刷新
        </Button>
      </Space>
      <Table
        columns={[
          { title: "材料ID", dataIndex: "material_id", key: "material_id" },
          {
            title: "当前环节",
            dataIndex: "status",
            key: "status",
            render: (s: number, record: ApprovalRecord) => {
              const n = record.approval_step_count ?? 3;
              const label = materialStatusLabel(s, n);
              const color =
                s === 0
                  ? "default"
                  : s === 5
                    ? "red"
                    : s === n + 1
                      ? "green"
                      : STATUS_COLORS[s] ?? "processing";
              return <Tag color={color}>{label}</Tag>;
            },
          },
          {
            title: "操作",
            key: "action",
            render: (_: unknown, record: ApprovalRecord) => (
              <Space>
                <Button
                  type="primary"
                  size="small"
                  onClick={() => handleAction(record.material_id, "approve", record)}
                >
                  通过
                </Button>
                <Button
                  size="small"
                  onClick={() => handleAction(record.material_id, "return", record)}
                >
                  退回
                </Button>
                <Button
                  danger
                  size="small"
                  onClick={() => handleAction(record.material_id, "reject", record)}
                >
                  驳回
                </Button>
              </Space>
            ),
          },
        ]}
        dataSource={records}
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
