from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field

from app.schemas.project import ApprovalFlowStepDisplay


class MaterialCreate(BaseModel):
    project_id: int
    content: dict[str, Any] = Field(default_factory=dict)


class MaterialUpdate(BaseModel):
    content: Optional[dict[str, Any]] = None


class MaterialDraftSaveRequest(BaseModel):
    data: dict[str, Any] = Field(default_factory=dict)
    clientRevision: Optional[int | str] = None
    saveType: str = "autosave"


class MaterialDraftSaveResult(BaseModel):
    materialId: int
    serverRevision: int
    savedAt: datetime


class MaterialValidationIssueOut(BaseModel):
    moduleKey: Optional[str] = None
    sectionKey: Optional[str] = None
    fieldKey: Optional[str] = None
    rowKey: Optional[str] = None
    attachmentKey: Optional[str] = None
    level: str
    issueType: str
    message: str
    resolved: bool = False


class MaterialValidationRequest(BaseModel):
    data: Optional[dict[str, Any]] = None
    scope: str = "all"


class MaterialValidationResult(BaseModel):
    valid: bool
    completion: int
    errors: list[MaterialValidationIssueOut] = Field(default_factory=list)
    warnings: list[MaterialValidationIssueOut] = Field(default_factory=list)


class MaterialEditContext(BaseModel):
    material: "MaterialOut"
    project: dict[str, Any]
    config: Optional[dict[str, Any]] = None
    configVersion: Optional[int] = None
    draft: dict[str, Any] = Field(default_factory=dict)
    validation: MaterialValidationResult
    lastSavedAt: Optional[datetime] = None


class MaterialReturnCommentOut(BaseModel):
    id: int
    approveRecordId: int
    materialId: int
    approverId: int
    approverName: Optional[str] = None
    action: str
    comment: Optional[str] = None
    moduleKey: Optional[str] = None
    sectionKey: Optional[str] = None
    fieldKey: Optional[str] = None
    rowKey: Optional[str] = None
    attachmentKey: Optional[str] = None
    resolved: bool = False
    createdAt: Optional[datetime] = None


class MaterialReturnCommentResolveRequest(BaseModel):
    resolved: bool = True


class MaterialOut(BaseModel):
    id: int
    user_id: int
    creator_name: Optional[str] = None
    project_id: int
    content: dict[str, Any]
    status: int
    workflow_status: Optional[str] = None
    current_step_index: Optional[int] = None
    profile_version_id: Optional[int] = None
    submitted_at: Optional[datetime] = None
    created_at: datetime
    approval_snapshot: Optional[dict[str, Any]] = None
    approval_snapshot_display: Optional[list[ApprovalFlowStepDisplay]] = None

    class Config:
        from_attributes = True


MaterialEditContext.model_rebuild()
