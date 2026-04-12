import { useEffect, useState } from 'react'
import { Table, Button, Upload, message, Popconfirm } from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import * as templateService from '../../services/templates'

export default function TemplateList() {
  const [templates, setTemplates] = useState<{ name: string; size: number }[]>([])
  const [loading, setLoading] = useState(false)

  const fetchTemplates = async () => {
    setLoading(true)
    try {
      const data = await templateService.getTemplates()
      setTemplates(data)
    } catch {
      message.error('获取模板列表失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchTemplates() }, [])

  const handleDelete = async (name: string) => {
    await templateService.deleteTemplate(name)
    message.success('删除成功')
    fetchTemplates()
  }

  const columns = [
    { title: '文件名', dataIndex: 'name', key: 'name' },
    {
      title: '大小', dataIndex: 'size', key: 'size',
      render: (size: number) => `${(size / 1024).toFixed(1)} KB`,
    },
    {
      title: '操作', key: 'action',
      render: (_: unknown, record: { name: string }) => (
        <Popconfirm title="确认删除？" onConfirm={() => handleDelete(record.name)}>
          <Button type="link" danger>删除</Button>
        </Popconfirm>
      ),
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h3>模板管理</h3>
        <Upload
          showUploadList={false}
          customRequest={async ({ file, onSuccess, onError }) => {
            try {
              await templateService.uploadTemplate(file as File)
              message.success('上传成功')
              fetchTemplates()
              onSuccess?.(null)
            } catch {
              onError?.(new Error('上传失败'))
            }
          }}
        >
          <Button icon={<UploadOutlined />}>上传模板</Button>
        </Upload>
      </div>
      <Table columns={columns} dataSource={templates} rowKey="name" loading={loading} />
    </div>
  )
}
