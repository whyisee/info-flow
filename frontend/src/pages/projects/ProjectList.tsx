import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Table,
  Tag,
  Space,
  message,
  Popconfirm,
  Modal,
  Form,
  Input,
  DatePicker,
  Select,
  Tooltip,
} from 'antd'
import { DownOutlined, PlusOutlined, UpOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import zhCN from 'antd/es/locale/zh_CN'
import type { Dayjs } from 'dayjs'
import type { Project } from '../../types'
import { PROJECT_STATUS } from '../../utils/constants'
import * as projectService from '../../services/projects'
import '../users/UserList.css'
import './ProjectList.css'

const { RangePicker } = DatePicker

type ProjectFormValues = {
  name: string
  description?: string
  start_time: Dayjs
  end_time: Dayjs
  status?: number
}

const statusOptions = Object.entries(PROJECT_STATUS).map(([value, label]) => ({
  value: Number(value),
  label,
}))

const PROJECT_STATUS_FILTER: { value: 'all' | '0' | '1' | '2'; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: '0', label: PROJECT_STATUS[0] },
  { value: '1', label: PROJECT_STATUS[1] },
  { value: '2', label: PROJECT_STATUS[2] },
]

type ProjectAppliedFilter = {
  keyword: string
  project_status: 'all' | '0' | '1' | '2'
  startFrom: Dayjs | null
  startTo: Dayjs | null
}

function projectMatchesFilter(row: Project, f: ProjectAppliedFilter): boolean {
  if (f.project_status !== 'all' && row.status !== Number(f.project_status)) return false
  const kw = f.keyword.trim().toLowerCase()
  if (kw) {
    const hay = `${row.name} ${row.description ?? ''}`.toLowerCase()
    if (!hay.includes(kw)) return false
  }
  if (f.startFrom && f.startTo) {
    const st = dayjs(row.start_time).startOf('day')
    const from = f.startFrom.startOf('day')
    const to = f.startTo.startOf('day')
    if (st.isBefore(from) || st.isAfter(to)) return false
  }
  return true
}

export default function ProjectList() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm<ProjectFormValues>()
  const [filterForm] = Form.useForm()
  const [filterMoreOpen, setFilterMoreOpen] = useState(false)
  const [appliedFilter, setAppliedFilter] = useState<ProjectAppliedFilter>({
    keyword: '',
    project_status: 'all',
    startFrom: null,
    startTo: null,
  })

  const fetchProjects = useCallback(async () => {
    setLoading(true)
    try {
      const data = await projectService.getProjects()
      setProjects(data)
    } catch {
      message.error('获取项目列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  const filteredProjects = useMemo(
    () => projects.filter((p) => projectMatchesFilter(p, appliedFilter)),
    [projects, appliedFilter],
  )

  const onFilterSearch = () => {
    const v = filterForm.getFieldsValue() as {
      keyword?: string
      project_status?: 'all' | '0' | '1' | '2'
      start_range?: [Dayjs | null, Dayjs | null] | null
    }
    const range = v.start_range
    setAppliedFilter({
      keyword: (v.keyword ?? '').trim(),
      project_status: v.project_status ?? 'all',
      startFrom: range?.[0] ?? null,
      startTo: range?.[1] ?? null,
    })
  }

  const onFilterReset = () => {
    filterForm.resetFields()
    filterForm.setFieldsValue({ project_status: 'all' })
    setAppliedFilter({
      keyword: '',
      project_status: 'all',
      startFrom: null,
      startTo: null,
    })
  }

  const openCreate = () => {
    setEditingId(null)
    form.resetFields()
    setModalOpen(true)
  }

  const openEdit = (record: Project) => {
    setEditingId(record.id)
    form.setFieldsValue({
      name: record.name,
      description: record.description,
      start_time: dayjs(record.start_time),
      end_time: dayjs(record.end_time),
      status: record.status,
    })
    setModalOpen(true)
  }

  const onModalOk = async () => {
    try {
      const values = await form.validateFields()
      if (values.end_time.isBefore(values.start_time)) {
        message.error('结束时间不能早于开始时间')
        return
      }
      setSubmitting(true)
      const payload = {
        name: values.name.trim(),
        description: values.description?.trim() || undefined,
        start_time: values.start_time.toISOString(),
        end_time: values.end_time.toISOString(),
      }
      if (editingId === null) {
        await projectService.createProject(payload)
        message.success('创建成功')
      } else {
        await projectService.updateProject(editingId, {
          ...payload,
          status: values.status,
        })
        message.success('保存成功')
      }
      setModalOpen(false)
      fetchProjects()
    } catch (e) {
      if (e && typeof e === 'object' && 'errorFields' in e) return
      message.error(editingId === null ? '创建失败' : '保存失败')
    } finally {
      setSubmitting(false)
    }
  }

  const setProjectStatus = async (id: number, status: number, okText: string) => {
    try {
      await projectService.updateProject(id, { status })
      message.success(okText)
      fetchProjects()
    } catch {
      message.error('操作失败')
    }
  }

  const handleDelete = async (id: number) => {
    await projectService.deleteProject(id)
    message.success('删除成功')
    fetchProjects()
  }

  const statusTagColor = (s: number) => {
    if (s === 1) return 'green'
    if (s === 2) return 'default'
    return 'default'
  }

  const columns = [
    { title: '项目名称', dataIndex: 'name', key: 'name', ellipsis: true },
    {
      title: '开始时间',
      dataIndex: 'start_time',
      key: 'start_time',
      width: 168,
      render: (t: string) => dayjs(t).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '结束时间',
      dataIndex: 'end_time',
      key: 'end_time',
      width: 168,
      render: (t: string) => dayjs(t).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: number) => (
        <Tag color={statusTagColor(status)}>{PROJECT_STATUS[status] ?? status}</Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 440,
      fixed: 'right' as const,
      render: (_: unknown, record: Project) => (
        <Space wrap size="small">
          <Button
            type="link"
            size="small"
            onClick={() => navigate(`/declaration/projects/${record.id}/config`)}
          >
            申报配置
          </Button>
          <Button
            type="link"
            size="small"
            onClick={() => navigate(`/declaration/projects/${record.id}/approval-flow`)}
          >
            配置审批流程
          </Button>
          <Button type="link" size="small" onClick={() => openEdit(record)}>
            编辑
          </Button>
          {record.status === 0 && (
            <Button
              type="link"
              size="small"
              onClick={() => setProjectStatus(record.id, 1, '已发布')}
            >
              发布
            </Button>
          )}
          {record.status === 1 && (
            <Popconfirm
              title="关闭后教师将无法选择该项目申报，确定吗？"
              onConfirm={() => setProjectStatus(record.id, 2, '已关闭')}
            >
              <Button type="link" size="small">
                关闭
              </Button>
            </Popconfirm>
          )}
          {record.status === 2 && (
            <Button
              type="link"
              size="small"
              onClick={() => setProjectStatus(record.id, 1, '已重新发布')}
            >
              重新发布
            </Button>
          )}
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" danger size="small">
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const isEdit = editingId !== null

  return (
    <div className="userListPage">
      <div className="userListToolbar">
        <h3 className="userListTitle">项目管理</h3>
      </div>

      <Form
        form={filterForm}
        layout="inline"
        className="userListFilters"
        onFinish={onFilterSearch}
        initialValues={{ project_status: 'all' }}
      >
        <div className="userListFiltersMain">
          <Form.Item name="keyword" label="关键词">
            <Input allowClear placeholder="项目名称、说明" style={{ width: 220 }} />
          </Form.Item>
          <Form.Item name="project_status" label="状态">
            <Select options={PROJECT_STATUS_FILTER} style={{ width: 120 }} />
          </Form.Item>
          <Form.Item className="userListFilterActions">
            <Space wrap size="middle">
              <Tooltip title={filterMoreOpen ? '收起更多条件' : '更多筛选条件'}>
                <Button
                  type="text"
                  className="userListFilterMoreBtn"
                  icon={filterMoreOpen ? <UpOutlined /> : <DownOutlined />}
                  aria-expanded={filterMoreOpen}
                  onClick={() => setFilterMoreOpen((v) => !v)}
                />
              </Tooltip>
              <Button type="primary" htmlType="submit">
                查询
              </Button>
              <Button onClick={onFilterReset}>重置</Button>
              <Button type="primary" htmlType="button" icon={<PlusOutlined />} onClick={openCreate}>
                新建项目
              </Button>
            </Space>
          </Form.Item>
        </div>
        <div
          className="userListFiltersExtra"
          style={{ display: filterMoreOpen ? 'flex' : 'none' }}
          aria-hidden={!filterMoreOpen}
        >
          <Form.Item name="start_range" label="开始时间">
            <RangePicker
              locale={zhCN.DatePicker}
              style={{ width: 280 }}
              placeholder={['起', '止']}
            />
          </Form.Item>
        </div>
      </Form>

      <Table
        className="userListTable"
        columns={columns}
        dataSource={filteredProjects}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1100 }}
        pagination={{ pageSize: 12, showSizeChanger: true }}
      />

      <Modal
        title={isEdit ? '编辑项目' : '新建项目'}
        open={modalOpen}
        onOk={onModalOk}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
        destroyOnClose
        width={640}
      >
        <Form form={form} layout="vertical" className="projectListForm">
          <Form.Item name="name" label="项目名称" rules={[{ required: true, message: '请输入项目名称' }]}>
            <Input placeholder="项目名称" maxLength={200} showCount />
          </Form.Item>
          <Form.Item name="description" label="说明">
            <Input.TextArea rows={3} placeholder="可选" />
          </Form.Item>
          <Form.Item name="start_time" label="开始时间" rules={[{ required: true, message: '请选择开始时间' }]}>
            <DatePicker
              locale={zhCN.DatePicker}
              showTime
              className="projectListDatePicker"
              format="YYYY-MM-DD HH:mm"
            />
          </Form.Item>
          <Form.Item name="end_time" label="结束时间" rules={[{ required: true, message: '请选择结束时间' }]}>
            <DatePicker
              locale={zhCN.DatePicker}
              showTime
              className="projectListDatePicker"
              format="YYYY-MM-DD HH:mm"
            />
          </Form.Item>
          {isEdit && (
            <Form.Item name="status" label="状态" rules={[{ required: true, message: '请选择状态' }]}>
              <Select className="projectListStatusSelect" options={statusOptions} placeholder="状态" />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  )
}
