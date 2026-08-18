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
