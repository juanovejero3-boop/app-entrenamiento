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
