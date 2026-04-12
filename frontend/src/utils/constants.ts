export const ROLE_LABELS: Record<string, string> = {
  teacher: '教师',
  dept_admin: '部门管理员',
  school_admin: '学校管理员',
  expert: '专家评审',
}

export const PROJECT_STATUS: Record<number, string> = {
  0: '草稿',
  1: '已发布',
  2: '已关闭',
}

/** @deprecated 环节数可变，请用 materialStatusLabel(status, materialStepCount(m)) */
export const MATERIAL_STATUS: Record<number, string> = {
  0: '草稿',
  1: '审批中(1)',
  2: '审批中(2)',
  3: '审批中(3)',
  4: '已通过',
  5: '已驳回',
}

export const APPROVAL_STATUS: Record<number, string> = {
  1: '通过',
  2: '退回',
  3: '驳回',
}
