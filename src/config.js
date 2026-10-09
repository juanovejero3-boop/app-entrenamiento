// Configuración pública de la app. La URL y la clave "publishable" de Supabase
// están pensadas para el frontend; se pueden sobreescribir con variables VITE_*.
export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://bnqjtyaytvvajuikzymq.supabase.co';
export const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_TbmI-Ng6DpGTo4WK-stBHg_F507N3Cr';
