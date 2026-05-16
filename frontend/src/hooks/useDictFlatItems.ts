import { useEffect, useState } from "react";

import { debugProfileForm } from "../pages/declaration/profile/profileFormDebug";
import { listDictItems, type DataDictItemDTO } from "../services/dataDict";

export type UseDictFlatItemsOpts = {
  /** 若为 true（如资料回填），含已停用字典项，否则已存取值可能不在下拉 options 内导致空白 */
  includeDisabled?: boolean;
};

/**
 * 拉取某字典类型下全部字典项（含父子），用于前端组装级联选项。
 */
export function useDictFlatItems(typeCode: string, opts?: UseDictFlatItemsOpts) {
  const [items, setItems] = useState<DataDictItemDTO[]>([]);
  const includeDisabled = opts?.includeDisabled ?? false;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await listDictItems(typeCode, {
          include_disabled: includeDisabled,
        });
        if (!cancelled) {
          setItems(rows);
          if (includeDisabled) {
            debugProfileForm(`dict.items OK typeCode=${typeCode}`, {
              count: rows.length,
              sample: rows.slice(0, 5).map((x) => ({ value: x.value, label: x.label })),
            });
          }
        }
      } catch (e) {
        if (!cancelled) {
          setItems([]);
          if (includeDisabled) {
            debugProfileForm(`dict.items FAIL typeCode=${typeCode}`, e);
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [typeCode, includeDisabled]);

  return items;
}
