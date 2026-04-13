import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Button,
  Card,
  Space,
  Table,
  Tag,
  message,
  Popconfirm,
  Typography,
} from 'antd'
import type { ApprovalFlowVersionRecord } from '../../services/approvalFlowConfig'
import * as approvalFlowConfigApi from '../../services/approvalFlowConfig'
import * as projectService from '../../services/projects'
import type { Project } from '../../types'
import { APPROVAL_FLOW_LIST_REFRESH } from './approvalFlowListEvents'
import './ProjectDeclarationConfig.css'

const statusLabel: Record<string, { color: string; text: string }> = {
  draft: { color: 'default', text: '草稿' },
  published: { color: 'green', text: '已发布' },
  archived: { color: 'default', text: '已归档' },
}

export default function ProjectApprovalFlowConfig() {
  const navigate = useNavigate()
  const { projectId: projectIdParam } = useParams<{ projectId: string }>()
  const projectId = Number(projectIdParam)

  const [project, setProject] = useState<Project | null>(null)
  const [rows, setRows] = useState<ApprovalFlowVersionRecord[]>([])
  const [loading, setLoading] = useState(false)

  const loadAll = useCallback(async () => {
    if (!Number.isFinite(projectId) || projectId < 1) return
    setLoading(true)
    try {
      const [p, list] = await Promise.all([
        projectService.getProject(projectId),
        approvalFlowConfigApi.listApprovalFlowVersions(projectId),
      ])
      setProject(p)
      setRows(list)
    } catch {
      message.error('加载失败')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  useEffect(() => {
    const onRefresh = (ev: Event) => {
      const pid = (ev as CustomEvent<{ projectId?: number }>).detail?.projectId
      if (pid === projectId) loadAll()
    }
    window.addEventListener(APPROVAL_FLOW_LIST_REFRESH, onRefresh)
    return () => window.removeEventListener(APPROVAL_FLOW_LIST_REFRESH, onRefresh)
  }, [projectId, loadAll])

  const openEditInLayoutTab = (record: ApprovalFlowVersionRecord) => {
    if (record.status !== 'draft') {
      message.warning('仅草稿可编辑')
      return
    }
    navigate(`/declaration/projects/${projectId}/approval-flow/${record.id}/edit`)
  }

  const createVersion = async () => {
    setLoading(true)
    try {
      await approvalFlowConfigApi.createApprovalFlowVersion(projectId, {})
      message.success('已新建草稿版本')
      loadAll()
    } catch {
      message.error('新建失败')
    } finally {
      setLoading(false)
    }
  }

  const publish = async (record: ApprovalFlowVersionRecord) => {
    try {
      await approvalFlowConfigApi.publishApprovalFlowVersion(projectId, record.id)
      message.success('已发布')
      loadAll()
    } catch {
      message.error('发布失败')
    }
  }

  if (!Number.isFinite(projectId) || projectId < 1) {
    return (
      <Card>
        <Typography.Text type="danger">无效的项目 ID</Typography.Text>
      </Card>
    )
  }

  return (
    <div className="projectDeclarationConfig">
      <div className="projectDeclarationPageHeader">
        <div className="projectDeclarationPageHeaderTitleGroup">
          <h2 className="projectDeclarationPageTitle projectDeclarationPageTitlePrimary">
            审批流程配置
            {project ? ` — ${project.name}` : ''}
          </h2>
        </div>
        <Space className="projectDeclarationPageActions" size="middle" wrap>
          <Button type="primary" onClick={() => createVersion()} loading={loading}>
            新建草稿版本
          </Button>
        </Space>
      </div>

      <Table<ApprovalFlowVersionRecord>
        loading={loading}
        rowKey="id"
        dataSource={rows}
        pagination={false}
        columns={[
          { title: '版本', dataIndex: 'version', width: 80 },
          { title: '说明', dataIndex: 'label', ellipsis: true },
          {
            title: '状态',
            dataIndex: 'status',
            width: 100,
            render: (s: string) => {
              const m = statusLabel[s] ?? { color: 'default', text: s }
              return <Tag color={m.color}>{m.text}</Tag>
            },
          },
          {
            title: '更新时间',
            dataIndex: 'updated_at',
            width: 200,
            render: (v: string | null | undefined, r) => v ?? r.created_at,
          },
          {
            title: '操作',
            key: 'action',
            width: 240,
            render: (_: unknown, record) => (
              <Space wrap size="small">
                <Button type="link" size="small" onClick={() => openEditInLayoutTab(record)}>
                  编辑流程
                </Button>
                {record.status === 'draft' && (
                  <Popconfirm
                    title="发布后新提交的申报将按此流程会签；原已发布版本将归档。确定？"
                    onConfirm={() => publish(record)}
                  >
                    <Button type="link" size="small">
                      发布
                    </Button>
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />
    </div>
  )
}
