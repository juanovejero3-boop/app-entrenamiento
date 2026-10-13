// Estado compartido entre secciones de la app.
// Un módulo no puede reasignar variables importadas de otro, así que lo que
// varias secciones modifican vive en este objeto (state.userProfile = ...).
export const state = {
  /** Usuario de Supabase Auth con sesión iniciada (null si no hay sesión). */
  currentUser: null,
  /** Fila de `profiles` del usuario logueado. */
  userProfile: null,
  /** Registros de `evolution` del usuario logueado. */
  evolutionHistory: [],
  /** Todos los perfiles (solo se carga para el admin). */
  adminAllUsers: [],
  /** true mientras se muestra la pantalla de nueva contraseña (link de recuperación). */
  passwordRecoveryActive: false,
  /** Pestaña activa de la barra inferior (null fuera de la app). */
  currentTab: null,
  /** Evita re-renderizar la app entera si Supabase re-emite SIGNED_IN. */
  appRendered: false,
};
