import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  /** 与 antd/rc-picker 共用同一份 dayjs，否则 dayjs.locale('zh-cn') 不作用于日期面板 */
  resolve: {
    dedupe: ['dayjs'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
