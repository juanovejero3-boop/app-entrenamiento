// Los tests de pantallas no hablan con Supabase: usan el repo local (localStorage simulado).
import { vi } from 'vitest';

vi.mock('./features/coaching/repo/index.js', async () => {
  const { crearRepoLocal } = await import('./features/coaching/repo/local.js');
  return { repo: crearRepoLocal() };
});
