import { useEffect, useMemo, useState } from "react";
import type { UploadFile } from "antd/es/upload/interface";

import { getProfileFileUrlFromUploadFile } from "../services/profileFile";
import request from "../services/request";

/**
 * 证件照预览地址：本地未上传文件优先；否则已保存的相对路径用带 token 的请求拉 blob；
 * http(s)/data/blob 直链直接用。
 */
export function useProfileImageSrc(file: UploadFile | undefined): string | undefined {
  const [fetched, setFetched] = useState<string>();

  const fromLocal = useMemo(() => {
    if (!file || file.status === "removed") return undefined;
    const o = file.originFileObj;
    if (o instanceof Blob) return URL.createObjectURL(o);
    return undefined;
  }, [file]);

  const staticUrl =
    file?.thumbUrl || getProfileFileUrlFromUploadFile(file);

  useEffect(() => {
    return () => {
      if (fromLocal?.startsWith("blob:")) URL.revokeObjectURL(fromLocal);
    };
  }, [fromLocal]);

  useEffect(() => {
    if (fromLocal) {
      setFetched(undefined);
      return;
    }
    if (!staticUrl) {
      setFetched(undefined);
      return;
    }
    if (
      staticUrl.startsWith("http") ||
      staticUrl.startsWith("data:") ||
      staticUrl.startsWith("blob:")
    ) {
      setFetched(staticUrl);
      return;
    }
    const path = staticUrl.startsWith("/") ? staticUrl.slice(1) : staticUrl;
    let created: string | undefined;
    let cancelled = false;
    request
      .get(path, { responseType: "blob" })
      .then((data: unknown) => {
        if (cancelled || !(data instanceof Blob)) return;
        created = URL.createObjectURL(data);
        setFetched(created);
      })
      .catch(() => setFetched(undefined));
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [fromLocal, staticUrl]);

  if (fromLocal) return fromLocal;
  if (
    staticUrl?.startsWith("http") ||
    staticUrl?.startsWith("data:") ||
    staticUrl?.startsWith("blob:")
  ) {
    return staticUrl;
  }
  return fetched;
}
