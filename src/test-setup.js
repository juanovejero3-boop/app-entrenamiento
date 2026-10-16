// Los tests de pantallas no hablan con Supabase: usan el repo real sobre un cliente falso en
// memoria, que se vacía antes de cada test.
import { beforeEach, vi } from 'vitest';

vi.mock('./features/coaching/repo/index.js', async () => {
  const { crearClienteFalso } = await import('./features/coaching/repo/clienteFalso.js');
  const { crearRepoSupabase } = await import('./features/coaching/repo/supabase.js');
  const clienteDePrueba = crearClienteFalso();
  return { repo: crearRepoSupabase(clienteDePrueba), clienteDePrueba };
});

beforeEach(async () => {
  const { clienteDePrueba } = await import('./features/coaching/repo/index.js');
  clienteDePrueba?.reiniciar();
});
