import {
  useState,
  useLayoutEffect,
  useMemo,
  useEffect,
  useCallback,
} from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { Layout, Menu, Dropdown, Button, Spin, Tag, Divider } from "antd";
import {
  UserOutlined,
  LogoutOutlined,
  CaretLeftOutlined,
} from "@ant-design/icons";
import { useAuth } from "../store/AuthContext";
import { ROLE_LABELS } from "../utils/constants";
import {
  filterSideMenuEntries,
  getDefaultPathForTop,
  getSideMenuForTop,
  getTopFromPath,
  getVisibleTopMenus,
  toAntdSideMenuItems,
  type SideMenuGroup,
  type TopMenuKey,
} from "../config/navigation";
import { getTabLabel, getMenuSelectedKey, resolveTabLabel } from "../utils/routeLabels";
import { MainLayoutTabPanel } from "../router/MainLayoutTabPanel";
import MainLayoutTabStrip from "./MainLayoutTabStrip";
import { ACTIVE_ROLE_STORAGE_KEY } from "../services/request";
import {
  emptyTabBuckets,
  withActiveTab,
  type TabItem,
} from "./mainTabDragUtils";
import "./MainLayout.css";

const ALL_LEGACY_ROLE_OPTIONS = (
  ["teacher", "dept_admin", "school_admin", "expert"] as const
).map((code) => ({ value: code, label: ROLE_LABELS[code] ?? code }));

const { Header, Sider, Content } = Layout;

export default function MainLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const { user, logout, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  /** 当前可见标签对应路径；与地址栏解耦，仅在侧栏/前进后退等导致 location 变化时同步 */
  const [activeTabPath, setActiveTabPath] = useState(() => location.pathname);

  useEffect(() => {
    setActiveTabPath(location.pathname);
  }, [location.pathname]);

  const activeTop = getTopFromPath(activeTabPath);

  const [openTabsByTop, setOpenTabsByTop] = useState<
    Record<TopMenuKey, TabItem[]>
  >(() => {
    const top = getTopFromPath(location.pathname);
    const buckets = emptyTabBuckets();
    buckets[top] = [
      {
        path: location.pathname,
        label: resolveTabLabel(location.pathname, location.state),
      },
    ];
    return buckets;
  });

  useLayoutEffect(() => {
    const path = location.pathname;
    const top = getTopFromPath(path);
    const label = resolveTabLabel(path, location.state);
    setOpenTabsByTop((prev) => {
      const list = prev[top];
      const idx = list.findIndex((t) => t.path === path);
      if (idx >= 0) {
        if (list[idx].label === label) return prev;
        const next = [...list];
        next[idx] = { path, label };
        return { ...prev, [top]: next };
      }
      return { ...prev, [top]: [...list, { path, label }] };
    });
  }, [location.pathname, location.state]);

  const panelTabList = useMemo(() => {
    const list = openTabsByTop[activeTop] ?? [];
    return withActiveTab(list, activeTabPath, location.state);
  }, [openTabsByTop, activeTabPath, activeTop, location.state]);

  const filteredSideEntries = useMemo(() => {
    if (!user) return [];
    return filterSideMenuEntries(
      getSideMenuForTop(activeTop),
      user.permissions ?? [],
    );
  }, [activeTop, user]);

  const sideMenuItems = useMemo(
    () => toAntdSideMenuItems(filteredSideEntries),
    [filteredSideEntries],
  );

  const sideSubmenuKeys = useMemo(
    () =>
      filteredSideEntries
        .filter((e): e is SideMenuGroup => "children" in e)
        .map((g) => g.key),
    [filteredSideEntries],
  );

  const [sideOpenKeys, setSideOpenKeys] = useState<string[]>([]);

  const sideSubmenuKeysStr = sideSubmenuKeys.join("|");

  useEffect(() => {
    setSideOpenKeys(sideSubmenuKeys);
  }, [activeTop, sideSubmenuKeysStr]);

  const [activeRoleKey, setActiveRoleKey] = useState<string | undefined>(() =>
    typeof localStorage !== "undefined"
      ? (localStorage.getItem(ACTIVE_ROLE_STORAGE_KEY) ?? undefined)
      : undefined,
  );

  useEffect(() => {
    setActiveRoleKey(
      localStorage.getItem(ACTIVE_ROLE_STORAGE_KEY) ?? undefined,
    );
  }, [user?.id, user?.roles, user?.is_superuser]);

  const showRoleSwitcher = Boolean(
    user &&
      (user.is_superuser || (user.roles && user.roles.length > 1)),
  );

  const switchableRoleOptions = useMemo(() => {
    if (!user) return [];
    if (user.is_superuser) return ALL_LEGACY_ROLE_OPTIONS;
    return (user.roles ?? []).map((code) => ({
      value: code,
      label: ROLE_LABELS[code] ?? code,
    }));
  }, [user]);

  const switchActiveRoleAndReload = (code: string | null) => {
    if (code) {
      localStorage.setItem(ACTIVE_ROLE_STORAGE_KEY, code);
    } else {
      localStorage.removeItem(ACTIVE_ROLE_STORAGE_KEY);
    }
    window.location.reload();
  };

  const visibleTopMenus = useMemo(
    () => getVisibleTopMenus(user?.permissions ?? []),
    [user?.permissions],
  );
  const visibleTopKeySet = useMemo(
    () => new Set(visibleTopMenus.map((m) => m.key)),
    [visibleTopMenus],
  );

  const removeTab = useCallback(
    (targetPath: string) => {
      const top = getTopFromPath(targetPath);
      setOpenTabsByTop((prev) => {
        const list = prev[top];
        const idx = list.findIndex((t) => t.path === targetPath);
        if (idx === -1) return prev;
        const next = list.filter((t) => t.path !== targetPath);

        if (next.length === 0 && user) {
          const fallback = getDefaultPathForTop(top, user.permissions ?? []);
          const fallbackTop = getTopFromPath(fallback);
          queueMicrotask(() => navigate(fallback));
          if (fallbackTop === top) {
            return {
              ...prev,
              [top]: [{ path: fallback, label: getTabLabel(fallback) }],
            };
          }
          return { ...prev, [top]: [] };
        }

        if (activeTabPath === targetPath) {
          const neighbor = next[idx - 1] ?? next[idx] ?? next[0];
          queueMicrotask(() => navigate(neighbor.path));
        }
        return { ...prev, [top]: next };
      });
    },
    [activeTabPath, navigate, user],
  );

  const onTabEdit = useCallback(
    (targetKey: string | React.MouseEvent | React.KeyboardEvent, action: "add" | "remove") => {
      if (action === "remove") {
        removeTab(String(targetKey));
      }
    },
    [removeTab],
  );

  if (loading) {
    return (
      <div className="appCenter">
        <Spin />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (location.pathname === "/" || location.pathname === "") {
    return <Navigate to="/declaration/dashboard" replace />;
  }
  if (location.pathname === "/system/permissions") {
    return <Navigate to="/system/permissions/catalog" replace />;
  }

  if (
    visibleTopMenus.length > 0 &&
    !visibleTopKeySet.has(getTopFromPath(location.pathname))
  ) {
    return (
      <Navigate
        to={getDefaultPathForTop(
          visibleTopMenus[0].key,
          user.permissions ?? [],
        )}
        replace
      />
    );
  }

  const onTopMenuClick = ({ key }: { key: string }) => {
    const path = getDefaultPathForTop(
      key as TopMenuKey,
      user.permissions ?? [],
    );
    navigate(path);
  };

  return (
    <Layout className="appShell">
      <Header className="mainHeader mainHeaderWithTopNav">
        <div className="mainHeaderBrand">
          <span className="mainBrandText">InfoFlow</span>
        </div>
        <div className="mainHeaderRight">
          {visibleTopMenus.length > 0 ? (
            <Menu
              mode="horizontal"
              selectedKeys={[getTopFromPath(activeTabPath)]}
              items={visibleTopMenus.map((t) => ({
                key: t.key,
                label: t.label,
              }))}
              onClick={onTopMenuClick}
              className="mainTopMenu"
            />
          ) : null}
          <Dropdown
            placement="bottomRight"
            trigger={["click"]}
            dropdownRender={() => (
              <div
                className="mainUserDropdownPanel"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mainUserMenuInfo">
                  {user.active_role
                    ? `账号：${ROLE_LABELS[user.role]} · 当前身份：${ROLE_LABELS[user.active_role] ?? user.active_role}`
                    : `角色：${ROLE_LABELS[user.role] ?? user.role}`}
                </div>
                {showRoleSwitcher && switchableRoleOptions.length > 0 ? (
                  <div className="mainUserRoleTagsWrap">
                    {switchableRoleOptions.map((opt) => {
                      const selected = activeRoleKey === opt.value;
                      return (
                        <Tag
                          key={opt.value}
                          className={
                            selected
                              ? "mainUserRoleTag mainUserRoleTagActive"
                              : "mainUserRoleTag"
                          }
                          onClick={() => {
                            if (selected) return;
                            switchActiveRoleAndReload(opt.value);
                          }}
                        >
                          {opt.label}
                        </Tag>
                      );
                    })}
                    {activeRoleKey ? (
                      <Tag
                        className="mainUserRoleTag mainUserRoleTagDefault"
                        onClick={() => switchActiveRoleAndReload(null)}
                      >
                        恢复默认
                      </Tag>
                    ) : null}
                  </div>
                ) : null}
                <Divider className="mainUserDropdownDivider" />
                <Button
                  type="text"
                  danger
                  block
                  icon={<LogoutOutlined />}
                  className="mainUserLogoutBtn"
                  onClick={() => {
                    logout();
                    navigate("/login");
                  }}
                >
                  退出登录
                </Button>
              </div>
            )}
          >
            <Button
              type="text"
              icon={<UserOutlined />}
              className="mainUserTrigger"
            >
              {user?.name}
            </Button>
          </Dropdown>
        </div>
      </Header>
      <Layout hasSider className="mainWorkArea">
        <Sider
          trigger={null}
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          width={220}
          collapsedWidth={72}
          className="mainSider"
        >
          <button
            type="button"
            className="mainSiderCollapseBtn mainSiderEdgeTrigger"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
          >
            <CaretLeftOutlined
              aria-hidden
              className={`mainSiderCollapseCaret ${collapsed ? "mainSiderCollapseCaretFlipped" : ""}`}
            />
          </button>
          <div className="mainSiderMenuScroll">
            <Menu
              mode="inline"
              inlineCollapsed={collapsed}
              openKeys={sideOpenKeys}
              onOpenChange={setSideOpenKeys}
              selectedKeys={[getMenuSelectedKey(activeTabPath)]}
              items={sideMenuItems}
              onClick={({ key }) => navigate(String(key))}
              className="mainSiderMenu"
            />
          </div>
        </Sider>
        <Content className="mainContentOuter">
          <div className="mainContentPanel">
            <MainLayoutTabStrip
              activeTabPath={activeTabPath}
              setActiveTabPath={setActiveTabPath}
              activeTop={activeTop}
              locationPathname={location.pathname}
              locationState={location.state}
              navigate={navigate}
              openTabsByTop={openTabsByTop}
              setOpenTabsByTop={setOpenTabsByTop}
              onTabEdit={onTabEdit}
            />
            <div className="mainOutletWrap mainTabPanels">
              {panelTabList.map((t) => (
                <div
                  key={t.path}
                  className="mainTabPanel"
                  hidden={t.path !== activeTabPath}
                >
                  <MainLayoutTabPanel pathname={t.path} />
                </div>
              ))}
            </div>
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}
