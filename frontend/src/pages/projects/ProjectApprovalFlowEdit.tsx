import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, Card, Space, Spin, Typography, message } from 'antd'
import type { ApprovalFlowVersionRecord } from '../../services/approvalFlowConfig'
import * as approvalFlowConfigApi from '../../services/approvalFlowConfig'
import * as projectService from '../../services/projects'
import type { ApproverOption } from '../../types'
import {
  ApprovalFlowCanvasEditor,
  type ApprovalFlowCanvasHandle,
  type ApprovalStepDraft,
  defaultLinearStepDraft,
  normalizeApiStepsToDraft,
} from '../../features/approval-flow-canvas'
import { notifyApprovalFlowListRefresh } from './approvalFlowListEvents'
import './ProjectApprovalFlowEdit.css'
import './ProjectDeclarationConfig.css'

export default function ProjectApprovalFlowEdit() {
  const { projectId: pid, configId: cid } = useParams<{
    projectId: string
    configId: string
  }>()
  const navigate = useNavigate()
  const projectId = Number(pid)
  const configId = Number(cid)

  const canvasRef = useRef<ApprovalFlowCanvasHandle>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [record, setRecord] = useState<ApprovalFlowVersionRecord | null>(null)
  const [projectName, setProjectName] = useState<string>('')
  const [approverOptions, setApproverOptions] = useState<ApproverOption[]>([])
  const [canvasSteps, setCanvasSteps] = useState<ApprovalStepDraft[]>([defaultLinearStepDraft(1)])
  const [canvasMountKey, setCanvasMountKey] = useState(0)

  const listPath = `/declaration/projects/${projectId}/approval-flow`

  const load = useCallback(async () => {
    if (!Number.isFinite(projectId) || projectId < 1 || !Number.isFinite(configId) || configId < 1) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [p, r, candidates] = await Promise.all([
        projectService.getProject(projectId),
        approvalFlowConfigApi.getApprovalFlowVersion(projectId, configId),
        projectService.getApproverCandidates(),
      ])
      setProjectName(p.name)
      setApproverOptions(candidates)
      setRecord(r)
      const steps = normalizeApiStepsToDraft(r.flow?.steps as unknown[])
      setCanvasSteps(steps)
      setCanvasMountKey((k) => k + 1)
      if (r.status !== 'draft') {
        message.warning('仅草稿可编辑')
      }
    } catch {
      message.error('加载失败')
      setRecord(null)
    } finally {
      setLoading(false)
    }
  }, [projectId, configId])

  useEffect(() => {
    load()
  }, [load])

  const onSave = async () => {
    if (!record || record.status !== 'draft') return
    const steps = canvasRef.current?.getSteps()
    if (!steps?.length) {
      message.error('无法读取画布环节，请稍后重试')
      return
    }
    try {
      setSaving(true)
      await approvalFlowConfigApi.updateApprovalFlowVersion(projectId, record.id, {
        flow: { steps },
      })
      message.success('已保存')
      notifyApprovalFlowListRefresh(projectId)
      navigate(listPath)
    } catch {
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  if (!Number.isFinite(projectId) || projectId < 1 || !Number.isFinite(configId) || configId < 1) {
    return (
      <Card>
        <Typography.Text type="danger">无效的链接</Typography.Text>
      </Card>
    )
  }

  const readonly = !record || record.status !== 'draft'

  return (
    <div className="projectApprovalFlowEditPage projectApprovalFlowEditPage--canvasFill">
      <div className="projectDeclarationPageHeader projectApprovalFlowEditHeader">
        <div className="projectDeclarationPageHeaderTitleGroup">
          <h2 className="projectDeclarationPageTitle projectDeclarationPageTitlePrimary">
            编辑审批流
            {projectName ? ` — ${projectName}` : ''}
            {record ? ` · 版本 ${record.version}` : ''}
          </h2>
        </div>
        <Space wrap>
          <Link to={listPath}>
            <Button>返回配置列表</Button>
          </Link>
          {!readonly && (
            <>
              <Button onClick={() => navigate(listPath)}>取消</Button>
              <Button type="primary" onClick={onSave} loading={saving}>
                保存
              </Button>
            </>
          )}
        </Space>
      </div>

      <div className="projectApprovalFlowEditMain">
        {loading ? (
          <div className="projectApprovalFlowEditLoading">
            <Spin size="large" />
          </div>
        ) : readonly && record ? (
          <div className="projectApprovalFlowEditReadonly">
            <Typography.Paragraph type="warning">当前版本非草稿，请返回列表操作。</Typography.Paragraph>
          </div>
        ) : !readonly ? (
          <ApprovalFlowCanvasEditor
            key={`${configId}-${canvasMountKey}`}
            ref={canvasRef}
            defaultSteps={canvasSteps}
            approverOptions={approverOptions}
          />
        ) : null}
      </div>
    </div>
  )
}
