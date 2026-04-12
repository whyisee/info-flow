"""RBAC 目录与角色权限更新。"""

from pydantic import BaseModel, Field, field_validator


class PermissionItemOut(BaseModel):
    code: str
    name: str
    module: str


class RoleWithPermissionsOut(BaseModel):
    code: str
    name: str
    permissions: list[str]


class RbacCatalogOut(BaseModel):
    permissions: list[PermissionItemOut]
    roles: list[RoleWithPermissionsOut]


class RolePermissionsUpdate(BaseModel):
    """替换某角色下的全部功能权限绑定。"""

    permission_codes: list[str] = Field(default_factory=list)

    @field_validator("permission_codes", mode="after")
    @classmethod
    def dedupe_preserve_order(cls, v: list[str]) -> list[str]:
        return list(dict.fromkeys(v))
