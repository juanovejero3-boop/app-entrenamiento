// Punto de entrada de Vite. Los estilos se cargan con <link> en index.html
// (evita el flash de HTML sin estilos en desarrollo).
import './lib/acciones.js'; // listeners de data-click / data-input / data-change / data-submit
import './lib/ui.js'; // instala los modales propios (window.alert / window.confirm)
import './router.js';
// Secciones que no importa el router: se cargan para que registren sus acciones
import './features/admin/alumnos.js';
import './features/admin/vencimientos.js';
import { iniciarSesion } from './session.js';

iniciarSesion();
