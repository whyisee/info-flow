"""用户模块配置：与前端 profile 分块一致。"""

# 基本信息（含学历、任职、证件上传等）
DECLARATION_BASIC = "declaration_basic"
# 任务（岗位）及关键词
DECLARATION_TASK = "declaration_task"
# 联系方式
DECLARATION_CONTACT = "declaration_contact"
# 导师与回避
DECLARATION_SUPERVISOR = "declaration_supervisor"

ALLOWED_MODULES: frozenset[str] = frozenset(
    {
        DECLARATION_BASIC,
        DECLARATION_TASK,
        DECLARATION_CONTACT,
        DECLARATION_SUPERVISOR,
    },
)
