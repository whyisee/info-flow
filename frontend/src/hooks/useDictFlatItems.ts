import { useEffect, useState } from "react";
import { listDictItems, type DataDictItemDTO } from "../services/dataDict";

/**
 * 拉取某字典类型下全部字典项（含父子），用于前端组装级联选项。
 */
export function useDictFlatItems(typeCode: string) {
  const [items, setItems] = useState<DataDictItemDTO[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await listDictItems(typeCode, { include_disabled: false });
        if (!cancelled) setItems(rows);
      } catch {
        if (!cancelled) setItems([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [typeCode]);

  return items;
}
