/** 最高学历层次（常见填报口径） */
export const HIGHEST_EDUCATION_LEVEL_OPTIONS = [
  { value: "doctoral", label: "博士研究生" },
  { value: "master", label: "硕士研究生" },
  { value: "bachelor", label: "本科" },
  { value: "associate", label: "专科（含高职）" },
] as const;

/** 最高学位层次 */
export const HIGHEST_DEGREE_LEVEL_OPTIONS = [
  { value: "doctor", label: "博士" },
  { value: "master", label: "硕士" },
  { value: "bachelor", label: "学士" },
  { value: "none", label: "无学位" },
] as const;
