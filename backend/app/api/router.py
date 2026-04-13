from fastapi import APIRouter

from app.api import (
    approval_flow_config,
    approvals,
    attachments,
    auth,
    data_dict,
    declaration_config,
    materials,
    module_config,
    profile_files,
    projects,
    rbac,
    templates,
    users,
)

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["Auth"])
api_router.include_router(users.router, prefix="/users", tags=["Users"])
api_router.include_router(module_config.router, prefix="/users", tags=["User module config"])
api_router.include_router(profile_files.router, tags=["Profile files"])
api_router.include_router(rbac.router, prefix="/rbac", tags=["RBAC"])
api_router.include_router(data_dict.router, prefix="/system", tags=["Data dict"])
api_router.include_router(projects.router, prefix="/projects", tags=["Projects"])
api_router.include_router(
    declaration_config.router, prefix="/projects", tags=["Project declaration config"]
)
api_router.include_router(
    approval_flow_config.router, prefix="/projects", tags=["Project approval flow config"]
)
api_router.include_router(materials.router, prefix="/materials", tags=["Materials"])
api_router.include_router(attachments.router, prefix="/attachments", tags=["Attachments"])
api_router.include_router(approvals.router, prefix="/approvals", tags=["Approvals"])
api_router.include_router(templates.router, prefix="/templates", tags=["Templates"])
