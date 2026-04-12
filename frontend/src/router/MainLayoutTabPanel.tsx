import { memo, useMemo } from "react";
import {
  useRoutes,
  UNSAFE_LocationContext,
  NavigationType,
} from "react-router";
import type { Location } from "react-router";
import type { RouteObject } from "react-router-dom";
import { mainLayoutChildRoutes } from "./mainLayoutChildRoutes";

const rootRouteTree: RouteObject[] = [
  { path: "/", children: mainLayoutChildRoutes },
];

/**
 * 必须为独立子组件：useRoutes 内部会调用 useLocation()；若仅用第二个参数 stub，
 * 仍会订阅「全局」LocationContext，导致切换任一 Tab 时所有已挂载面板的 useRoutes 一起重跑，
 * 进而触发其它 Tab 内页面的重复请求/重挂载。
 * 用 UNSAFE_LocationContext 为每个面板提供「固定为本 Tab pathname」的 location，
 * 使该面板子树内的 useLocation 与全局 URL 解耦。
 */
function TabPanelRoutes({ stub }: { stub: Location }) {
  return useRoutes(rootRouteTree, stub);
}

function MainLayoutTabPanelInner({ pathname }: { pathname: string }) {
  const stub = useMemo((): Location => {
    return {
      pathname,
      search: "",
      hash: "",
      state: null,
      key: pathname,
      unstable_mask: undefined,
    };
  }, [pathname]);

  const locationContextValue = useMemo(
    () => ({
      location: stub,
      navigationType: NavigationType.Pop,
    }),
    [stub],
  );

  return (
    <UNSAFE_LocationContext.Provider value={locationContextValue}>
      <TabPanelRoutes stub={stub} />
    </UNSAFE_LocationContext.Provider>
  );
}

export const MainLayoutTabPanel = memo(MainLayoutTabPanelInner);
