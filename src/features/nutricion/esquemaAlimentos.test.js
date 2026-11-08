// @vitest-environment node
// Aplica la migración de la biblioteca de alimentos sobre un Postgres real (PGlite, corre en memoria) y verifica
// las restricciones y los permisos (RLS): la biblioteca es de los coaches, el alumno no la ve.
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const MIGRACION = readFileSync(
  new URL('../../../supabase/migrations/20261108000001_nutrition_foods.sql', import.meta.url),
  'utf8',
);

const COACH = '00000000-0000-0000-0000-00000000000c';
const OTRO_COACH = '00000000-0000-0000-0000-00000000000d';
const ANA = '00000000-0000-0000-0000-0000000000a1';

// Lo mínimo de Supabase que la migración da por existente: roles, auth.uid(), profiles e is_admin().
const SUPABASE_MINIMO = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table public.profiles (id uuid primary key, role text not null default 'alumno');
  create function public.is_admin() returns boolean language sql security definer stable
    as $$ select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on all functions in schema public to anon, authenticated;
`;

let db;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_MINIMO);
  await db.exec(MIGRACION);
  await db.exec('grant select, insert, update, delete on all tables in schema public to anon, authenticated');
}, 60_000); // arrancar Postgres en memoria (WASM) puede tardar con la máquina cargada

afterAll(() => db.close());

beforeEach(async () => {
  await db.exec('reset role');
  await db.exec('truncate public.nutrition_foods, public.profiles cascade');
  await db.exec(`insert into public.profiles (id, role) values
    ('${COACH}', 'admin'), ('${OTRO_COACH}', 'admin'), ('${ANA}', 'alumno')`);
});

/** Ejecuta `sql` como ese usuario de Supabase (null = anónimo) y vuelve a ser dueño de la base. */
async function como(usuario, sql, params = []) {
  await db.exec(usuario ? 'set role authenticated' : 'set role anon');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [usuario ?? '']);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role');
  }
}

const alimento = (categoria, nombre, porcion = '100g') =>
  db.query('insert into public.nutrition_foods (categoria, nombre, porcion) values ($1, $2, $3)', [
    categoria,
    nombre,
    porcion,
  ]);

describe('esquema de la biblioteca de alimentos: restricciones', () => {
  it('la migración se puede aplicar dos veces', async () => {
    await db.exec(MIGRACION);
  });

  it('un alimento nuevo tiene id propio y sin gluten ni lácteo por defecto', async () => {
    await alimento('proteins', 'Pechuga de Pollo');
    const { rows } = await db.query('select id, gluten, lacteo from public.nutrition_foods');
    expect(rows[0].id).toEqual(expect.any(String));
    expect(rows[0]).toMatchObject({ gluten: false, lacteo: false });
  });

  it('acepta los ids que ya usa la app (texto) además de los generados', async () => {
    await db.query(
      `insert into public.nutrition_foods (id, categoria, nombre, porcion) values ('abc-123', 'fats', 'Aceite', '10ml')`,
    );
    const { rows } = await db.query(`select 1 from public.nutrition_foods where id = 'abc-123'`);
    expect(rows).toHaveLength(1);
  });

  it('no puede haber dos alimentos con el mismo nombre en una categoría (sin importar mayúsculas ni espacios)', async () => {
    await alimento('proteins', 'Pechuga de Pollo');
    await expect(alimento('proteins', '  pechuga DE pollo ')).rejects.toThrow(/duplicate key|unique/i);
  });

  it('el mismo nombre sí puede estar en otra categoría', async () => {
    await alimento('proteins', 'Queso');
    await alimento('mixed_pf', 'Queso');
    const { rows } = await db.query('select 1 from public.nutrition_foods');
    expect(rows).toHaveLength(2);
  });

  it('rechaza un nombre o una porción vacíos', async () => {
    await expect(alimento('proteins', '   ')).rejects.toThrow(/check/i);
    await expect(alimento('proteins', 'Pollo', '')).rejects.toThrow(/check/i);
  });

  it('guardar un alimento actualiza updated_at', async () => {
    await alimento('proteins', 'Pollo');
    await db.query(`update public.nutrition_foods set updated_at = '2020-01-01'`);
    await db.query(`update public.nutrition_foods set porcion = '120g'`);
    const { rows } = await db.query(
      `select updated_at > now() - interval '1 minute' as reciente from public.nutrition_foods`,
    );
    expect(rows[0].reciente).toBe(true);
  });
});

describe('esquema de la biblioteca de alimentos: permisos (RLS)', () => {
  it('cualquier coach ve, crea, edita y borra alimentos (la biblioteca es compartida)', async () => {
    await como(
      COACH,
      `insert into public.nutrition_foods (categoria, nombre, porcion) values ('fats', 'Aceite', '10ml')`,
    );
    expect((await como(OTRO_COACH, 'select 1 from public.nutrition_foods')).rows).toHaveLength(1);
    await como(OTRO_COACH, `update public.nutrition_foods set porcion = '15ml'`);
    expect((await db.query('select porcion from public.nutrition_foods')).rows[0].porcion).toBe('15ml');
    await como(OTRO_COACH, 'delete from public.nutrition_foods');
    expect((await db.query('select 1 from public.nutrition_foods')).rows).toHaveLength(0);
  });

  it('el alumno no ve la biblioteca y no puede escribir en ella', async () => {
    await alimento('proteins', 'Pollo');
    expect((await como(ANA, 'select 1 from public.nutrition_foods')).rows).toHaveLength(0);
    await expect(
      como(ANA, `insert into public.nutrition_foods (categoria, nombre, porcion) values ('fats', 'Aceite', '10ml')`),
    ).rejects.toThrow(/row-level security/i);
    await como(ANA, `update public.nutrition_foods set nombre = 'cambiado'`);
    await como(ANA, 'delete from public.nutrition_foods');
    const { rows } = await db.query('select nombre from public.nutrition_foods');
    expect(rows).toEqual([{ nombre: 'Pollo' }]);
  });

  it('un usuario sin sesión no ve nada', async () => {
    await alimento('proteins', 'Pollo');
    expect((await como(null, 'select 1 from public.nutrition_foods')).rows).toHaveLength(0);
  });
});
