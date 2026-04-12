import { useEffect, useMemo, useState } from "react";
import { Alert, Descriptions, Steps, Timeline, Typography } from "antd";
import type { ApprovalFlowStepDisplay, ApprovalRecord } from "../../types";
import { APPROVAL_STATUS } from "../../utils/constants";
import { materialStatusLabel } from "../../utils/materialApproval";
import * as approvalService from "../../services/approvals";
import * as projectService from "../../services/projects";
import "./MaterialApprovalProgress.css";

const DEFAULT_MID_TITLES = ["院系审核", "校级审核", "专家评审"];

function buildStepTitles(flow?: ApprovalFlowStepDisplay[] | null): string[] {
  const mid =
    flow && flow.length > 0
      ? flow.map((s) => s.title)
      : DEFAULT_MID_TITLES;
  return ["填写提交", ...mid, "办结"];
}

function buildStepItems(materialStatus: number, stepTitles: string[], n: number) {
  const doneIdx = n + 1;
  if (materialStatus === 0) {
    return stepTitles.map((title, i) => ({
      title,
      status: (i === 0 ? "process" : "wait") as "wait" | "process" | "finish",
    }));
  }
  if (materialStatus >= 1 && materialStatus <= n) {
    return stepTitles.map((title, i) => {
      if (i < materialStatus) {
        return { title, status: "finish" as const };
      }
      if (i === materialStatus) {
        return { title, status: "process" as const };
      }
      return { title, status: "wait" as const };
    });
  }
  if (materialStatus === doneIdx) {
    return stepTitles.map((title) => ({ title, status: "finish" as const }));
  }
  return stepTitles.map((title, i) => ({
    title,
    status: (i === 0 ? "finish" : "wait") as "wait" | "process" | "finish",
  }));
}

type Props = {
  materialId: number;
  materialStatus: number;
  projectId?: number;
  /** 来自材料接口，与提交时快照一致（含会签人姓名） */
  snapshotDisplay?: ApprovalFlowStepDisplay[] | null;
};

export default function MaterialApprovalProgress({
  materialId,
  materialStatus,
  projectId,
  snapshotDisplay: snapshotDisplayProp,
}: Props) {
  const [records, setRecords] = useState<ApprovalRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [projectFlowDisplay, setProjectFlowDisplay] = useState<
    ApprovalFlowStepDisplay[] | null
  >(null);

  const planRows = useMemo(() => {
    if (snapshotDisplayProp && snapshotDisplayProp.length > 0) {
      return snapshotDisplayProp;
    }
    if (projectFlowDisplay && projectFlowDisplay.length > 0) {
      return projectFlowDisplay;
    }
    return null;
  }, [snapshotDisplayProp, projectFlowDisplay]);

  const n = planRows && planRows.length > 0 ? planRows.length : 3;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    approvalService
      .getApprovalRecords(materialId)
      .then((data) => {
        if (!cancelled) setRecords(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [materialId]);

  useEffect(() => {
    if (snapshotDisplayProp && snapshotDisplayProp.length > 0) {
      setProjectFlowDisplay(null);
      return;
    }
    if (projectId == null) {
      setProjectFlowDisplay(null);
      return;
    }
    let cancelled = false;
    projectService
      .getProject(projectId)
      .then((p) => {
        if (!cancelled) {
          setProjectFlowDisplay(p.approval_flow_display ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) setProjectFlowDisplay(null);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, snapshotDisplayProp]);

  const stepTitles = useMemo(
    () => buildStepTitles(planRows),
    [planRows],
  );

  const stepItems = useMemo(
    () => buildStepItems(materialStatus, stepTitles, n),
    [materialStatus, stepTitles, n],
  );

  const phaseLabel = materialStatusLabel(materialStatus, n);

  return (
    <div className="materialApprovalProgress">
      <Typography.Title level={5} className="materialApprovalProgressTitle">
        审批进度
      </Typography.Title>
      <Typography.Text type="secondary" className="materialApprovalProgressMeta">
        当前环节：{phaseLabel}
      </Typography.Text>

      {planRows && planRows.length > 0 ? (
        <>
          <Typography.Title level={5} className="materialApprovalProgressPlanTitle">
            {snapshotDisplayProp?.length ? "本申报审批安排（提交时锁定）" : "本项目现行审批安排（参考）"}
          </Typography.Title>
          <Descriptions
            size="small"
            column={1}
            bordered
            className="materialApprovalProgressPlan"
          >
            {planRows.map((s, i) => (
              <Descriptions.Item key={`${s.title}-${i}`} label={s.title}>
                {s.assignee_names}
                {snapshotDisplayProp?.length ? (
                  <Typography.Text type="secondary" className="materialApprovalProgressCosign">
                    （会签须全员通过）
                  </Typography.Text>
                ) : null}
              </Descriptions.Item>
            ))}
          </Descriptions>
        </>
      ) : projectId != null ? (
        <Typography.Paragraph type="secondary" className="materialApprovalProgressHint">
          本项目未配置固定审批人，由系统按角色（院系/校级/专家）分配待办。
        </Typography.Paragraph>
      ) : null}

      {materialStatus === 5 ? (
        <Alert
          type="error"
          showIcon
          message="申报已驳回"
          description="流程已结束。若需再次申报，请按学校规定联系管理员处理。"
          className="materialApprovalProgressAlert"
        />
      ) : (
        <Steps items={stepItems} className="materialApprovalProgressSteps" />
      )}

      {error ? (
        <Typography.Text type="danger">审批记录加载失败</Typography.Text>
      ) : (
        <Timeline
          pending={loading ? "加载中…" : undefined}
          className="materialApprovalProgressTimeline"
        >
          {records.map((r) => (
            <Timeline.Item key={r.id}>
              <div className="materialApprovalProgressRecordHead">
                <span className="materialApprovalProgressActor">
                  {r.approver_name ?? `审批人 #${r.approver_id}`}
                </span>
                <span className="materialApprovalProgressAction">
                  {APPROVAL_STATUS[r.status] ?? r.status}
                  {r.step_index != null && r.status === 1
                    ? ` · 环节 ${(r.step_index as number) + 1}`
                    : ""}
                </span>
              </div>
              {r.created_at ? (
                <div className="materialApprovalProgressTime">{r.created_at}</div>
              ) : null}
              {r.comment ? (
                <div className="materialApprovalProgressComment">{r.comment}</div>
              ) : null}
            </Timeline.Item>
          ))}
        </Timeline>
      )}
    </div>
  );
}
