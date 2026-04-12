from pydantic import BaseModel


class ProfileFileUploadOut(BaseModel):
    """相对当前站点 /api 的路径，前端 axios baseURL 为 /api 时可直接 get。"""

    url: str
