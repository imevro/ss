import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const configured = process.env.API_ORIGIN;

const apiOrigin = (): string => {
  if (configured === undefined) return 'http://localhost:8787';
  return configured;
};

const api = apiOrigin();

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [tailwindcss(), reactRouter()],
  // Вход, данные и живой поток живут в нашем API; сервер разработки отдаёт их
  // по тем же путям. `ws` обязателен: без него соединение комнаты не поднимается.
  server: {
    allowedHosts: ['.erodionov.com'],
    proxy: {
      '/api': { target: api, ws: true },
      '/v1': { target: api, ws: true },
    },
  },
});
