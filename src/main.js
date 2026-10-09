// Punto de entrada de Vite.
// Transición: la lógica sigue en public/app.js (script clásico con funciones globales
// usadas desde los onclick inline). Este módulo corre antes que app.js (ambos son
// diferidos y se ejecutan en orden) y le deja disponibles las dependencias en window.
import './styles/main.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import { createClient } from '@supabase/supabase-js';
import emailjs from '@emailjs/browser';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

Object.assign(window, {
  SUPABASE_URL,
  SUPABASE_KEY,
  supaClient: createClient(SUPABASE_URL, SUPABASE_KEY),
  emailjs,
});
