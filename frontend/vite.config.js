import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
var apiPort = process.env.VITE_API_PORT || '3001';
export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: "http://localhost:".concat(apiPort),
                changeOrigin: true,
                rewrite: function (path) { return path.replace(/^\/api/, '/api'); },
            },
        },
    },
});
