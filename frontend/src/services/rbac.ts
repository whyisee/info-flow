import request from './request'

export interface PermissionItem {
  code: string
  name: string
  module: string
}

export interface RoleWithPermissions {
  code: string
  name: string
  permissions: string[]
}

export interface RbacCatalog {
  permissions: PermissionItem[]
  roles: RoleWithPermissions[]
}

export const getRbacCatalog = () =>
  request.get<unknown, RbacCatalog>('/rbac/catalog')

export const updateRolePermissions = (roleCode: string, permissionCodes: string[]) =>
  request.put<unknown, RoleWithPermissions>(`/rbac/roles/${encodeURIComponent(roleCode)}/permissions`, {
    permission_codes: permissionCodes,
  })
