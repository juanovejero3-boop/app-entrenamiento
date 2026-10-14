// Punto de entrada de Vite. Los estilos se cargan con <link> en index.html
// (evita el flash de HTML sin estilos en desarrollo).
import './lib/ui.js'; // instala los modales propios (window.alert / window.confirm)
import './router.js';
// Secciones que solo registran handlers en window (no las importa el router)
import './features/admin/alumnos.js';
import './features/admin/vencimientos.js';
import { iniciarSesion } from './session.js';

iniciarSesion();
