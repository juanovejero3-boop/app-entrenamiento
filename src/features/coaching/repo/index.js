// Punto de entrada único para guardar y cargar planes. Las pantallas importan `repo`
// desde acá y no saben dónde viven los datos.
//
// Los planes, las series y las sesiones viven en Supabase (ver la migración
// 20261016000000_training_tables.sql); los permisos los resuelve RLS en la base.
// El repo local (local.js) sigue existiendo para los tests y como referencia de la interfaz.
import { supaClient } from '../../../lib/supabase.js';
import { crearRepoSupabase } from './supabase.js';

export const repo = crearRepoSupabase(supaClient);

/** El cliente de Supabase, para los repos de otras áreas (nutrición); los tests lo reemplazan por uno falso. */
export const clienteSupabase = supaClient;
