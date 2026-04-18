import request from "./request";

export type ProfileVersionPublishResult = {
  id: number;
  version: number;
  status: string;
};

export type ProfileVersionOut = {
  id: number;
  user_id: number;
  version: number;
  status: string;
  label?: string | null;
  profile: Record<string, unknown>;
  created_by?: number | null;
  created_at: string;
  updated_at?: string | null;
};

export function publishMyProfileVersion(versionId: number): Promise<ProfileVersionPublishResult> {
  return request.post(`/users/me/profile-versions/${versionId}/submit`);
}

export function listMyProfileVersions(): Promise<ProfileVersionOut[]> {
  return request.get("/users/me/profile-versions");
}

export function getMyProfileVersion(versionId: number): Promise<ProfileVersionOut> {
  return request.get(`/users/me/profile-versions/${versionId}`);
}

export function updateMyDraftProfileVersion(
  versionId: number,
  profile: Record<string, unknown>,
): Promise<ProfileVersionOut> {
  return request.put(`/users/me/profile-versions/${versionId}`, { profile });
}

export function copyMyProfileVersionToDraft(versionId: number): Promise<ProfileVersionOut> {
  return request.post(`/users/me/profile-versions/${versionId}/copy`);
}

export function getUserProfileVersionForApprover(
  userId: number,
  versionId: number,
): Promise<ProfileVersionOut> {
  return request.get(`/users/${userId}/profile-versions/${versionId}`);
}

