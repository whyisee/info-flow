import "./i18n/dayjs";

import { RouterProvider } from "react-router-dom";
import { ConfigProvider, theme } from "antd";
import { AuthProvider } from "./store/AuthContext";
import router from "./router";
import zhCN from "antd/es/locale/zh_CN";

export default function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: "#4f46e5",
          colorInfo: "#6366f1",
          borderRadiusLG: 12,
          borderRadius: 10,
          fontFamily:
            '"SF Pro SC", "PingFang SC", "Microsoft YaHei", system-ui, -apple-system, sans-serif',
          colorBgLayout: "#f1f5f9",
          colorText: "#0f172a",
          colorTextSecondary: "#64748b",
        },
        components: {
          Layout: {
            headerBg: "rgba(255,255,255,0.85)",
            bodyBg: "transparent",
            siderBg: "#ffffff",
          },
          Menu: {
            itemBorderRadius: 10,
            itemMarginInline: 8,
            itemHeight: 42,
            iconSize: 18,
            collapsedIconSize: 18,
          },
          Card: {
            borderRadiusLG: 16,
          },
          Button: {
            primaryShadow: "0 2px 0 rgba(79, 70, 229, 0.06)",
          },
        },
      }}
    >
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ConfigProvider>
  );
}
