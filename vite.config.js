import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss()],
  test: {
    // DOM simulado (document, eventos, localStorage) para los tests que lo necesitan
    environment: 'happy-dom',
    include: ['src/**/*.test.js'],
    // Restaura console.* y otros mocks entre tests
    restoreMocks: true,
  },
});
