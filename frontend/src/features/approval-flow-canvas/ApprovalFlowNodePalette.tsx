import {
  ApartmentOutlined,
  BellOutlined,
  ClockCircleOutlined,
  ClusterOutlined,
  FlagOutlined,
  ForkOutlined,
  MailOutlined,
  PlayCircleOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { CompressOutlined, LayoutOutlined } from "@ant-design/icons";
import { Button, Collapse, Space, Tooltip, Typography } from "antd";
import "./ApprovalFlowNodePalette.css";

export type ApprovalFlowNodePaletteProps = {
  onRelayout: () => void;
  onFitView: () => void;
};

export type PaletteDragPayload = {
  paletteKind: "approval" | "parallel_gateway";
};

const DT_KEY = "application/reactflow";

function setDragData(e: React.DragEvent, payload: PaletteDragPayload) {
  e.dataTransfer.setData(DT_KEY, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = "copy";
}

type DraggableCardProps = {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  payload: PaletteDragPayload;
};

function DraggablePaletteItem({
  icon,
  title,
  subtitle,
  payload,
}: DraggableCardProps) {
  const tip = subtitle ? `${title}：${subtitle}` : title;
  return (
    <Tooltip title={tip} placement="top">
      <div
        className="afcPaletteItem afcPaletteItemDraggable"
        draggable
        onDragStart={(e) => setDragData(e, payload)}
      >
        <span className="afcPaletteItemIcon">{icon}</span>
        <span className="afcPaletteItemText">
          <span className="afcPaletteItemTitle">{title}</span>
          {subtitle ? (
            <span className="afcPaletteItemSub">{subtitle}</span>
          ) : null}
        </span>
      </div>
    </Tooltip>
  );
}

/** 画布已固定、不可拖入的参考项（开始 / 结束） */
function StaticPaletteItem({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  const tip = subtitle ? `${title}：${subtitle}` : title;
  return (
    <Tooltip title={tip} placement="top">
      <div className="afcPaletteItem afcPaletteItemStatic">
        <span className="afcPaletteItemIcon">{icon}</span>
        <span className="afcPaletteItemText">
          <span className="afcPaletteItemTitle">{title}</span>
          {subtitle ? (
            <span className="afcPaletteItemSub">{subtitle}</span>
          ) : null}
        </span>
      </div>
    </Tooltip>
  );
}

function FuturePaletteItem({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <Tooltip title={hint} placement="top">
      <div className="afcPaletteItem afcPaletteItemDisabled" aria-disabled>
        <span className="afcPaletteItemIcon">{icon}</span>
        <span className="afcPaletteItemText">
          <span className="afcPaletteItemTitle">{title}</span>
          <span className="afcPaletteItemSub">规划中</span>
        </span>
      </div>
    </Tooltip>
  );
}

export function ApprovalFlowNodePalette({
  onRelayout,
  onFitView,
}: ApprovalFlowNodePaletteProps) {
  return (
    <aside className="afcPaletteWrap">
      <div className="afcPaletteHeader">
        <div className="afcPaletteHeaderRow">
          <Typography.Title level={5} className="afcPaletteTitle">
            节点库
          </Typography.Title>
          <Space size={4} className="afcPaletteToolbar">
            <Tooltip title="按从左到右顺序重新拉直排版">
              <Button
                type="text"
                size="small"
                icon={<LayoutOutlined />}
                className="afcPaletteToolBtn"
                onClick={onRelayout}
              />
            </Tooltip>
            <Tooltip title="适应画布视野">
              <Button
                type="text"
                size="small"
                icon={<CompressOutlined />}
                className="afcPaletteToolBtn"
                onClick={onFitView}
              />
            </Tooltip>
          </Space>
        </div>
      </div>

      <Collapse
        bordered={false}
        defaultActiveKey={["basic", "enhanced"]}
        className="afcPaletteCollapse"
        items={[
          {
            key: "basic",
            label: "基础节点",
            children: (
              <div className="afcPaletteSection">
                <StaticPaletteItem
                  icon={<PlayCircleOutlined />}
                  title="开始"
                  subtitle="流程入口；画布已固定，不可重复拖入"
                />
                <StaticPaletteItem
                  icon={<FlagOutlined />}
                  title="结束"
                  subtitle="流程终点；画布已固定，不可重复拖入"
                />
                <DraggablePaletteItem
                  icon={<UserOutlined />}
                  title="审批节点"
                  subtitle="User Task：指定人/角色/部门，会签或签等"
                  payload={{ paletteKind: "approval" }}
                />
                <FuturePaletteItem
                  icon={<ForkOutlined />}
                  title="条件网关"
                  hint="Exclusive Gateway：按条件分支（如金额阈值）；执行与保存能力规划中。"
                />
                <DraggablePaletteItem
                  icon={<ClusterOutlined />}
                  title="并行网关"
                  subtitle="单节点含分叉+汇合：上侧主入、右侧上分叉出、左侧下汇合入、下侧主出"
                  payload={{ paletteKind: "parallel_gateway" }}
                />
              </div>
            ),
          },
          {
            key: "enhanced",
            label: "增强节点",
            children: (
              <div className="afcPaletteSection">
                <FuturePaletteItem
                  icon={<MailOutlined />}
                  title="抄送"
                  hint="CC / Notification：知会、留痕，不参与审批决策；规划中。"
                />
                <FuturePaletteItem
                  icon={<ApartmentOutlined />}
                  title="子流程"
                  hint="Sub-process：封装可复用子流程；规划中。"
                />
                <FuturePaletteItem
                  icon={<ThunderboltOutlined />}
                  title="自动节点"
                  hint="Service Task：系统自动执行（发消息、调接口等）；规划中。"
                />
                <FuturePaletteItem
                  icon={<ClockCircleOutlined />}
                  title="定时节点"
                  hint="Timer：催办、超时自动通过/驳回等；规划中。"
                />
                <FuturePaletteItem
                  icon={<BellOutlined />}
                  title="条件触发"
                  hint="Event：等待某事件发生后再继续（如等付款完成）；规划中。"
                />
              </div>
            ),
          },
        ]}
      />
    </aside>
  );
}
