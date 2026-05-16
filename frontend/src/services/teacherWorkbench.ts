import type { NotificationMessage } from "./notifications";
import request from "./request";

export type TeacherWorkbenchProject = {
  projectId: number;
  projectName: string;
  description?: string | null;
  deadline?: string | null;
  daysLeft?: number | null;
  projectStatus: number;
  materialId?: number | null;
  materialStatus: number | "not_started" | "returned";
  completion: number;
  errorCount: number;
  warningCount: number;
  lastSavedAt?: string | null;
  submittedAt?: string | null;
};

export type TeacherWorkbenchTodo = {
  type: string;
  title: string;
  content: string;
  targetUrl: string;
};

export type TeacherWorkbench = {
  summary: {
    availableProjects: number;
    draftMaterials: number;
    returnedMaterials: number;
    deadlineSoon: number;
  };
  projects: TeacherWorkbenchProject[];
  todos: TeacherWorkbenchTodo[];
  notifications: NotificationMessage[];
};

export const getTeacherWorkbench = () =>
  request.get<unknown, TeacherWorkbench>("/teacher/workbench");
