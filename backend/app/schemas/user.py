from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.models.user_status import USER_STATUS_VALUES, USER_STATUS_ACTIVE


class BulkUserFailure(BaseModel):
    username: str
    detail: str


class UserBulkResult(BaseModel):
    created: int
    failed: list[BulkUserFailure]


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


class UserCreate(BaseModel):
    username: str
    password: str
    name: str
    role: str = "teacher"
    """主展示角色，与 roles 未传时写入的第一项一致"""
    roles: Optional[list[str]] = None
    """若传则绑定多角色；否则仅 role 单角色"""
    dept_id: Optional[int] = None
    is_superuser: bool = False
    phone: Optional[str] = Field(default=None, max_length=20)
    email: Optional[str] = Field(default=None, max_length=120)
    """active=正常 deleted=逻辑删除；新建一般无需传"""
    status: str = USER_STATUS_ACTIVE

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in USER_STATUS_VALUES:
            raise ValueError("status 须为 active 或 deleted")
        return v


class UserBulkCreate(BaseModel):
    items: list[UserCreate] = Field(..., min_length=1, max_length=200)


class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    roles: Optional[list[str]] = None
    dept_id: Optional[int] = None
    password: Optional[str] = Field(
        default=None,
        description="传入则重置密码，不传或空则不修改",
    )
    is_superuser: Optional[bool] = None
    phone: Optional[str] = Field(default=None, max_length=20)
    email: Optional[str] = Field(default=None, max_length=120)
    status: Optional[str] = Field(default=None, description="active=正常 deleted=逻辑删除")

    @field_validator("status")
    @classmethod
    def validate_status_optional(cls, v: str | None) -> str | None:
        if v is None:
            return None
        if v not in USER_STATUS_VALUES:
            raise ValueError("status 须为 active 或 deleted")
        return v


class UserOut(BaseModel):
    id: int
    username: str
    name: str
    role: str
    phone: Optional[str] = None
    email: Optional[str] = None
    status: str = USER_STATUS_ACTIVE
    dept_id: Optional[int] = None
    permissions: list[str] = Field(default_factory=list)
    """已绑定的预置角色（多身份）"""
    roles: list[str] = Field(default_factory=list)
    is_superuser: bool = False
    active_role: Optional[str] = Field(
        default=None,
        description="当前请求选择的身份编码，与 X-Active-Role 一致且合法时回显",
    )

    class Config:
        from_attributes = True
