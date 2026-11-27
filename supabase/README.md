# Esquema de base de datos (Supabase)

Este directorio contiene las migraciones de la base de datos, versionadas y ordenadas.

## Migraciones

| Archivo | Descripción |
|---------|-------------|
| `migrations/20260812000000_baseline.sql` | Estado actual de la DB: tablas `profiles` y `evolution` con sus PK/FK |
| `migrations/20260812000001_auth_schema.sql` | Cambios: trigger de perfil, RLS en `profiles`/`evolution` y protección contra escalada de privilegios |
| `migrations/20260812000002_fix_prevent_role_escalation.sql` | Permite operaciones de servidor (auth.uid() null) en el trigger anti-escalada |
| `migrations/20260812000003_fix_admin_policy_recursion.sql` | Corrige recursión infinita de RLS en políticas admin (función `is_admin` security definer) |
| `migrations/20260812000004_profile_fields.sql` | Agrega columnas de ficha del alumno: `name`, `goal`, `height_cm`, `weight_kg` |
| `migrations/20261016000000_training_tables.sql` | Entrenamiento: `training_cycles` (N macrociclos por alumno, plan en jsonb), `training_sessions` (día terminado o no entrenado) y `training_set_logs` (series anotadas), con RLS. Se prueba en `src/features/coaching/repo/esquema.test.js` sobre un Postgres en memoria (PGlite) |
| `migrations/20261102000000_realtime_entrenamiento.sql` | Suma `training_set_logs` y `training_sessions` a la publicación `supabase_realtime`, para que el entrenador vea en vivo lo que completa el alumno. Idempotente |
| `migrations/20261108000000_nutrition_plans.sql` | Nutrición: `nutrition_plans` (un plan de alimentación por alumno, en jsonb, con `published`: el coach lo prepara y lo muestra; el alumno solo lee el suyo si está publicado), con RLS. Se prueba en `src/features/nutricion/esquemaNutricion.test.js` (PGlite). **Aplicarla en Supabase antes de desplegar la app que la usa** |
| `migrations/20261108000001_nutrition_foods.sql` | Nutrición: `nutrition_foods`, la biblioteca de alimentos compartida por todos los coaches (nombre único por categoría), con RLS: solo los admins la ven y la escriben. Se prueba en `src/features/nutricion/esquemaAlimentos.test.js` (PGlite). **Aplicarla en Supabase antes de desplegar la app que la usa** |
| `migrations/20261125000000_llamadas.sql` | Llamadas: `call_openings` (días que abre el coach), `call_bookings` (turnos, un email por día, sin pisarse) y `group_calls` (la grupal con su enlace). El coach ve teléfono y WhatsApp; el alumno ve su turno y la grupal; quien reserva sin cuenta solo ve los huecos de la primera llamada. Se prueba en `src/features/reservas/esquemaLlamadas.test.js` (PGlite). **Aplicarla en Supabase antes de usar las llamadas entre dispositivos** |
| `migrations/20261125010000_llamadas_script.sql` | El script de Google Calendar del coach (`call_settings`): lo leen la primera llamada y el seguimiento para agendar el evento con el mail del alumno y el del coach. **Aplicarla en Supabase** |
| `migrations/20261126000000_llamadas_calendario.sql` | Llamadas con varios coaches: `call_coaches` (el script de Google Calendar de cada coach; ya no es público), `coach_id` en días y turnos (el turno toma el coach de su día) y el resultado del calendario en cada turno (`calendario_estado`: pendiente, agendado, error o sin_script, con el motivo). Pasa el script ya cargado al coach que lo cargó. Se prueba en `src/features/reservas/esquemaCalendario.test.js` (PGlite). **Aplicarla en Supabase y publicar la función `agendar-llamada` antes de desplegar la app que la usa** |

## Convención

- Archivos nombrados `YYYYMMDDHHMMSS_descripcion.sql`.
- Se ejecutan en orden. Cada migración es idempotente (usa `create or replace`, `drop ... if exists`, `on conflict do nothing`).

## Cómo aplicarlas

**Opción manual** (SQL Editor del Dashboard): copiar y ejecutar cada archivo en orden.

**Opción con Supabase CLI** (recomendado a futuro):

```bash
supabase db push
```

Ver `https://supabase.com/docs/guides/local-development`.

## Funciones (Edge Functions)

| Función | Qué hace |
|---------|----------|
| `functions/admin-usuarios` | Altas y bajas de alumnos (solo admin) |
| `functions/ai-plan` | Consulta a Gemini para el constructor de planes y la nutrición (solo admin; secreto `GEMINI_API_KEY`) |
| `functions/agendar-llamada` | Agenda en Google Calendar un turno recién reservado, con el script del coach de ese turno, y guarda en el turno si quedó agendado o por qué falló. Quien reserva la puede llamar una sola vez, en los minutos siguientes; reintentar es del coach. Se prueba en `src/features/reservas/funcionAgendar.test.js` |

Se publican con la CLI de Supabase:

```bash
supabase functions deploy agendar-llamada
```
