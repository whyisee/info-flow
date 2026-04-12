import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Card, Spin, Tag, message, Empty, Checkbox, Button, Collapse } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import * as rbacApi from '../../services/rbac'
import { MODULE_LABEL, MODULE_ORDER, mergeModuleSelection } from './permissionShared'
import './permissionPageCommon.css'
import './RolePermissionEdit.css'

export default function RolePermissionEdit() {
  const { roleCode: roleCodeParam } = useParams<{ roleCode: string }>()
  const navigate = useNavigate()
  const roleCode = roleCodeParam ? decodeURIComponent(roleCodeParam) : ''

  const [loading, setLoading] = useState(true)
  const [catalog, setCatalog] = useState<rbacApi.RbacCatalog | null>(null)
  const [draft, setDraft] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    rbacApi
      .getRbacCatalog()
      .then(setCatalog)
      .catch(() => message.error('加载权限数据失败'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const role = catalog?.roles.find((r) => r.code === roleCode)
  const permissions = catalog?.permissions ?? []

  useEffect(() => {
    if (!role) return
    setDraft([...role.permissions])
  }, [roleCode, role?.permissions.join()])

  const save = async () => {
    if (!roleCode) return
    setSaving(true)
    try {
      const updated = await rbacApi.updateRolePermissions(roleCode, draft)
      setCatalog((prev) =>
        prev
          ? {
              ...prev,
              roles: prev.roles.map((r) =>
                r.code === roleCode ? { ...r, permissions: updated.permissions } : r,
              ),
            }
          : prev,
      )
      setDraft([...updated.permissions])
      message.success('已保存')
    } catch {
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const onModuleChange = (
    moduleKey: (typeof MODULE_ORDER)[number],
    checked: string[],
  ) => {
    setDraft((prev) => mergeModuleSelection(prev, moduleKey, permissions, checked))
  }

  if (loading && !catalog) {
    return (
      <div className="appCenter">
        <Spin />
      </div>
    )
  }

  if (!role) {
    return (
      <div className="permPageBlock rolePermEdit">
        <Empty
          description={roleCode ? `未找到角色：${roleCode}` : '缺少角色参数'}
        >
          <Button type="primary" onClick={() => navigate('/system/permissions/roles')}>
            返回角色列表
          </Button>
        </Empty>
      </div>
    )
  }

  return (
    <div className="permPageBlock rolePermEdit">
      <div className="rolePermEditBar">
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/system/permissions/roles')}
        >
          返回列表
        </Button>
      </div>
      <h3>配置授权 · {role.name}</h3>
      <p className="permPageIntro">
        角色编码 <Tag>{role.code}</Tag>
        。勾选权限后点击保存，对持有该角色的用户下次请求即按新权限校验。
      </p>

      <Card
        className="rolePermEditCard"
        size="small"
        title="权限勾选"
        extra={
          <Button type="primary" size="small" loading={saving} onClick={save}>
            保存
          </Button>
        }
      >
        <Collapse
          ghost
          size="small"
          defaultActiveKey={MODULE_ORDER.slice()}
          items={MODULE_ORDER.map((mod) => {
            const itemsInMod = permissions.filter((p) => p.module === mod)
            const codeSet = new Set(itemsInMod.map((p) => p.code))
            const value = draft.filter((c) => codeSet.has(c))
            return {
              key: mod,
              label: MODULE_LABEL[mod] ?? mod,
              children: (
                <Checkbox.Group
                  className="rolePermCheckboxGroup"
                  value={value}
                  onChange={(list) => onModuleChange(mod, list as string[])}
                  options={itemsInMod.map((p) => ({
                    value: p.code,
                    label: (
                      <span>
                        <span className="rolePermName">{p.name}</span>
                        <Tag className="rolePermCodeTag">{p.code}</Tag>
                      </span>
                    ),
                  }))}
                />
              ),
            }
          })}
        />
      </Card>
    </div>
  )
}
