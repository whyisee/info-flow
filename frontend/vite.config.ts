import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  /** 与 antd/rc-picker 共用同一份 dayjs，否则 dayjs.locale('zh-cn') 不作用于日期面板 */
  resolve: {
    dedupe: ["dayjs"],
  },
  server: {
    /** 避免仅绑定 IPv6(::1) 时 http://127.0.0.1:端口 无法访问 */
    host: true,
    port: 5173,
    allowedHosts: ["if.oniao-ai.com"],
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
