import request from "./request";

export interface HelpDocSummary {
  slug: string;
  title: string;
  path?: string | null;
  screenshot?: string | null;
  updated_at?: string | null;
}

export interface HelpDocDetail extends HelpDocSummary {
  content: string;
}

export interface HelpDocSavePayload {
  slug: string;
  title: string;
  content: string;
  path?: string | null;
  screenshot?: string | null;
}

export function listHelpDocs(): Promise<HelpDocSummary[]> {
  return request.get("/help/docs");
}

export function getHelpDoc(slug: string): Promise<HelpDocDetail> {
  return request.get(`/help/docs/${encodeURIComponent(slug)}`);
}

export function saveHelpDoc(
  slug: string,
  payload: HelpDocSavePayload,
): Promise<HelpDocDetail> {
  return request.put(`/help/docs/${encodeURIComponent(slug)}`, payload);
}

export function deleteHelpDoc(slug: string): Promise<void> {
  return request.delete(`/help/docs/${encodeURIComponent(slug)}`);
}

export function resolveHelpAssetUrl(src: string): string {
  if (/^(https?:)?\/\//.test(src) || src.startsWith("data:") || src.startsWith("/")) {
    return src;
  }
  if (src.startsWith("screenshots/")) {
    const filename = src.slice("screenshots/".length);
    return `/api/help/assets/screenshots/${encodeURIComponent(filename)}`;
  }
  return src;
}
