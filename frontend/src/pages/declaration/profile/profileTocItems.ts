import type { ProfileFieldCatalogRow } from "../../../services/profileFieldCatalog";
import { PROFILE_MODULE, type ProfileModuleCode } from "./profileModuleFields";

export type ProfileTocItem = { id: string; label: string };

export const PROFILE_MODULE_SECTIONS: {
  module_code: ProfileModuleCode;
  anchorId: string;
  title: string;
}[] = [
  {
    module_code: PROFILE_MODULE.BASIC,
    anchorId: "profile-section-basic",
    title: "基本信息",
  },
  {
    module_code: PROFILE_MODULE.TASK,
    anchorId: "profile-section-tasks",
    title: "任务与关键词",
  },
  {
    module_code: PROFILE_MODULE.CONTACT,
    anchorId: "profile-section-contact",
    title: "联系方式",
  },
  {
    module_code: PROFILE_MODULE.SUPERVISOR,
    anchorId: "profile-section-supervisors",
    title: "导师与回避",
  },
];

export function buildProfileTocItems(catalog: ProfileFieldCatalogRow[]): ProfileTocItem[] {
  const moduleCodesWithFields = new Set(catalog.map((row) => row.module_code));
  return PROFILE_MODULE_SECTIONS.filter((sec) =>
    moduleCodesWithFields.has(sec.module_code),
  ).map((sec) => ({
    id: sec.anchorId,
    label: sec.title,
  }));
}
