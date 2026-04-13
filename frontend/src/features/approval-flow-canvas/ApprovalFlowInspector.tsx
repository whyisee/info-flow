import { useEffect, useMemo, useState } from 'react'
import { Card, Collapse, Form, Input, InputNumber, Select, Typography } from 'antd'
import type { Node } from '@xyflow/react'
import type { ApproverOption } from '../../types'
import type { ApprovalLaneDraft, AssigneeSource } from './types'
import { ASSIGNEE_SOURCE_OPTIONS, VOTE_MODE_OPTIONS } from './assigneeSourceLabels'
import type { FlowApprovalData } from './nodes/FlowApprovalNode'
import type { FlowParallelData } from './nodes/FlowParallelNode'

type Props = {
  node: Node | null
  approverOptions: ApproverOption[]
  onUpdateApproval: (nodeId: string, data: FlowApprovalData) => void
  onUpdateParallel: (nodeId: string, data: FlowParallelData) => void
  onUpdateFork: (nodeId: string, data: { title?: string }) => void
}

function LaneFormFields({
  lane,
  laneIndex,
  approverOptions,
  onChange,
}: {
  lane: ApprovalLaneDraft
  laneIndex: number
  approverOptions: ApproverOption[]
  onChange: (patch: Partial<ApprovalLaneDraft>) => void
}) {
  const options = useMemo(
    () =>
      approverOptions.map((u) => ({
        value: u.id,
        label: `${u.name}（${u.username} · ${u.role}）`,
      })),
    [approverOptions],
  )

  return (
    <>
      <Form.Item label="子轨名称" required>
        <Input
          value={lane.title}
          maxLength={120}
          placeholder={`子轨 ${laneIndex + 1}`}
          onChange={(e) => onChange({ title: e.target.value })}
        />
      </Form.Item>
      <Form.Item label="通过规则">
        <Select
          options={VOTE_MODE_OPTIONS}
          value={lane.vote_mode}
          onChange={(v) => onChange({ vote_mode: v })}
        />
      </Form.Item>
      <Form.Item label="审批人来源">
        <Select
          options={ASSIGNEE_SOURCE_OPTIONS}
          value={lane.assignee_source}
          onChange={(v) => {
            const src = v as AssigneeSource
            onChange({
              assignee_source: src,
              assignee_user_ids: src === 'explicit_users' ? lane.assignee_user_ids : [],
              dept_id: src === 'dept_admins' ? lane.dept_id : null,
            })
          }}
        />
      </Form.Item>
      {lane.assignee_source === 'dept_admins' ? (
        <Form.Item label="部门 ID" required>
          <InputNumber
            min={1}
            className="afcDeptIdInput"
            value={lane.dept_id ?? undefined}
            placeholder="部门主键"
            onChange={(v) => onChange({ dept_id: v == null ? null : Number(v) })}
          />
        </Form.Item>
      ) : null}
      {lane.assignee_source === 'explicit_users' ? (
        <Form.Item label="指定审批人">
          <Select
            mode="multiple"
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="不选则发布后走角色"
            options={options}
            value={lane.assignee_user_ids}
            onChange={(v) => onChange({ assignee_user_ids: v })}
          />
        </Form.Item>
      ) : null}
    </>
  )
}

export function ApprovalFlowInspector({
  node,
  approverOptions,
  onUpdateApproval,
  onUpdateParallel,
  onUpdateFork,
}: Props) {
  const [approval, setApproval] = useState<FlowApprovalData | null>(null)
  const [parallel, setParallel] = useState<FlowParallelData | null>(null)
  const [forkTitle, setForkTitle] = useState<string>('')

  useEffect(() => {
    if (!node) {
      setApproval(null)
      setParallel(null)
      setForkTitle('')
      return
    }
    if (node.type === 'flowApproval') {
      const d = node.data as FlowApprovalData
      setApproval({
        title: d.title ?? '',
        vote_mode: d.vote_mode ?? 'cosign',
        assignee_source: d.assignee_source ?? 'explicit_users',
        assignee_user_ids: Array.isArray(d.assignee_user_ids) ? [...d.assignee_user_ids] : [],
        dept_id: d.dept_id ?? null,
      })
      setParallel(null)
      setForkTitle('')
      return
    }
    if (node.type === 'flowParallel') {
      const d = node.data as FlowParallelData
      setParallel({
        title: d.title ?? '',
        lanes: Array.isArray(d.lanes) ? d.lanes.map((ln) => ({ ...ln, assignee_user_ids: [...ln.assignee_user_ids] })) : [],
      })
      setApproval(null)
      setForkTitle('')
      return
    }
    if (node.type === 'flowParallelFork' || node.type === 'flowParallelGateway') {
      const d = node.data as { title?: string }
      setForkTitle(String(d.title ?? ''))
      setApproval(null)
      setParallel(null)
      return
    }
    if (node.type === 'flowParallelJoin') {
      setApproval(null)
      setParallel(null)
      setForkTitle('')
      return
    }
    setApproval(null)
    setParallel(null)
    setForkTitle('')
  }, [node?.id, node?.type])

  if (!node) {
    return (
      <Card size="small" className="afcInspectorCard" title="属性">
        <Typography.Paragraph type="secondary" className="afcInspectorEmpty">
          点击节点编辑属性；拖拽节点调整位置。并行网关为单节点四端连线：主链入 → 分叉到各审批 → 回到汇合端 → 主链出。
        </Typography.Paragraph>
      </Card>
    )
  }

  if (node.type === 'flowStart') {
    return (
      <Card size="small" className="afcInspectorCard" title="开始">
        <Typography.Paragraph type="secondary">流程入口，材料提交后从第一个环节进入。</Typography.Paragraph>
      </Card>
    )
  }

  if (node.type === 'flowEnd') {
    return (
      <Card size="small" className="afcInspectorCard" title="结束">
        <Typography.Paragraph type="secondary">全部审批通过后到达此节点。</Typography.Paragraph>
      </Card>
    )
  }

  if (node.type === 'flowApproval' && node.id && approval) {
    const flush = () => {
      onUpdateApproval(node.id, {
        title: approval.title.trim(),
        vote_mode: approval.vote_mode,
        assignee_source: approval.assignee_source,
        assignee_user_ids: approval.assignee_user_ids,
        dept_id: approval.dept_id,
      })
    }

    const patch = (p: Partial<FlowApprovalData>) => {
      setApproval((prev) => (prev ? { ...prev, ...p } : prev))
      const next = { ...approval, ...p }
      onUpdateApproval(node.id, {
        title: next.title.trim(),
        vote_mode: next.vote_mode,
        assignee_source: next.assignee_source,
        assignee_user_ids: next.assignee_user_ids,
        dept_id: next.dept_id,
      })
    }

    return (
      <Card size="small" className="afcInspectorCard" title="审批环节">
        <Form layout="vertical" className="afcInspectorForm">
          <Form.Item label="环节名称" required>
            <Input
              value={approval.title}
              maxLength={120}
              showCount
              placeholder="如：院系初审"
              onChange={(e) => patch({ title: e.target.value })}
              onBlur={flush}
              onPressEnter={flush}
            />
          </Form.Item>
          <Form.Item label="通过规则">
            <Select
              options={VOTE_MODE_OPTIONS}
              value={approval.vote_mode}
              onChange={(v) => patch({ vote_mode: v })}
            />
          </Form.Item>
          <Form.Item label="审批人来源">
            <Select
              options={ASSIGNEE_SOURCE_OPTIONS}
              value={approval.assignee_source}
              onChange={(v) => {
                const src = v as AssigneeSource
                patch({
                  assignee_source: src,
                  assignee_user_ids: src === 'explicit_users' ? approval.assignee_user_ids : [],
                  dept_id: src === 'dept_admins' ? approval.dept_id : null,
                })
              }}
            />
          </Form.Item>
          {approval.assignee_source === 'dept_admins' ? (
            <Form.Item label="部门 ID" required>
              <InputNumber
                min={1}
                className="afcDeptIdInput"
                value={approval.dept_id ?? undefined}
                placeholder="部门主键"
                onChange={(v) => patch({ dept_id: v == null ? null : Number(v) })}
              />
            </Form.Item>
          ) : null}
          {approval.assignee_source === 'explicit_users' ? (
            <Form.Item label="指定审批人">
              <Select
                mode="multiple"
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="不选则发布后走角色"
                options={approverOptions.map((u) => ({
                  value: u.id,
                  label: `${u.name}（${u.username} · ${u.role}）`,
                }))}
                value={approval.assignee_user_ids}
                onChange={(v) => patch({ assignee_user_ids: v })}
              />
            </Form.Item>
          ) : null}
        </Form>
      </Card>
    )
  }

  if ((node.type === 'flowParallelFork' || node.type === 'flowParallelGateway') && node.id) {
    const flush = () => {
      onUpdateFork(node.id, { title: forkTitle.trim() })
    }
    const patch = (title: string) => {
      setForkTitle(title)
      onUpdateFork(node.id, { title: title.trim() })
    }
    const cardTitle = node.type === 'flowParallelGateway' ? '并行网关' : '并行分叉（旧）'
    return (
      <Card size="small" className="afcInspectorCard" title={cardTitle}>
        <Form layout="vertical" className="afcInspectorForm">
          <Form.Item label="网关标题" required>
            <Input
              value={forkTitle}
              maxLength={120}
              showCount
              placeholder="如：并行网关"
              onChange={(e) => patch(e.target.value)}
              onBlur={flush}
              onPressEnter={flush}
            />
          </Form.Item>
          <Typography.Paragraph type="secondary" className="afcInspectorEmpty">
            {node.type === 'flowParallelGateway'
              ? '主链从左侧上端接入；右侧上端拉线到各分支审批；各分支回到左侧下端；主链从右侧下端接出。保存时满足「两路及以上分支且均回到该节点」会合并为一条并行步骤。'
              : '旧版画布节点：从本节点连到各审批，再连到「并行汇合」。建议重新排版后改为单节点并行网关。'}
          </Typography.Paragraph>
        </Form>
      </Card>
    )
  }

  if (node.type === 'flowParallelJoin') {
    return (
      <Card size="small" className="afcInspectorCard" title="并行汇合">
        <Typography.Paragraph type="secondary">
          结构节点：接收各并行分支，出线连到下一环节。无单独配置项。
        </Typography.Paragraph>
      </Card>
    )
  }

  if (node.type === 'flowParallel' && node.id && parallel) {
    const patchLane = (li: number, p: Partial<ApprovalLaneDraft>) => {
      const lanes = parallel.lanes.map((ln, i) => (i === li ? { ...ln, ...p } : ln))
      const next = { ...parallel, lanes }
      setParallel(next)
      onUpdateParallel(node.id, next)
    }

    const patchTitle = (title: string) => {
      const next = { ...parallel, title }
      setParallel(next)
      onUpdateParallel(node.id, next)
    }

    return (
      <Card size="small" className="afcInspectorCard" title="并行网关">
        <Form layout="vertical" className="afcInspectorForm">
          <Form.Item label="块标题" required>
            <Input value={parallel.title} maxLength={120} onChange={(e) => patchTitle(e.target.value)} />
          </Form.Item>
          <Typography.Text type="secondary" className="afcInspectorLaneHint">
            各子轨同时进行；每条子轨须单独配置来源与或签/会签。
          </Typography.Text>
          <Collapse
            size="small"
            className="afcParallelCollapse"
            items={parallel.lanes.map((lane, li) => ({
              key: String(li),
              label: lane.title?.trim() || `子轨 ${li + 1}`,
              children: (
                <LaneFormFields
                  lane={lane}
                  laneIndex={li}
                  approverOptions={approverOptions}
                  onChange={(p) => patchLane(li, p)}
                />
              ),
            }))}
          />
        </Form>
      </Card>
    )
  }

  return null
}
