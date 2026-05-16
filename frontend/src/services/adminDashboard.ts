import request from "./request";

export type AdminDashboardProjectRow = {
  projectId: number;
  projectName: string;
  projectStatus: number;
  deadline?: string | null;
  daysLeft?: number | null;
  totalMaterials: number;
  submittedMaterials: number;
  approvedMaterials: number;
  returnedMaterials: number;
  draftMaterials: number;
  reviewingMaterials: number;
  submitRate: number;
  approvedRate: number;
};

export type AdminDashboardData = {
  summary: {
    projects: number;
    openProjects: number;
    materials: number;
    draftMaterials: number;
    reviewingMaterials: number;
    approvedMaterials: number;
    returnedMaterials: number;
    deadlineSoon: number;
  };
  statusCounts: Record<"draft" | "reviewing" | "approved" | "returned", number>;
  projects: AdminDashboardProjectRow[];
  deadlineSoon: AdminDashboardProjectRow[];
  highReturnProjects: AdminDashboardProjectRow[];
};

export const getAdminDashboard = () =>
  request.get<unknown, AdminDashboardData>("/admin/dashboard");

export const exportProjectArchive = (projectId: number) =>
  request.get<unknown, Blob>(`/admin/projects/${projectId}/export-archive`, {
    responseType: "blob",
  });
