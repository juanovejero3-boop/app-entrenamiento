import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    // pdfmake (~970 kB) y su tipografía (~850 kB) son chunks aparte que se cargan solo al
    // generar un PDF; el aviso de Vite por tamaño no aplica a la carga inicial.
    chunkSizeWarningLimit: 1000,
  },
  test: {
    // DOM simulado (document, eventos, localStorage) para los tests que lo necesitan
    environment: 'happy-dom',
    include: ['src/**/*.test.js'],
    // Cambia el repo de Supabase por el local en los tests de pantallas
    setupFiles: ['./src/test-setup.js'],
    // Restaura console.* y otros mocks entre tests
    restoreMocks: true,
  },
});
