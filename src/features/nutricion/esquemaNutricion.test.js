// @vitest-environment node
// Aplica la migración de nutrición sobre un Postgres real (PGlite, corre en memoria) y verifica las
// restricciones y los permisos (RLS): quién ve y escribe qué.
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const MIGRACION = readFileSync(
  new URL('../../../supabase/migrations/20261108000000_nutrition_plans.sql', import.meta.url),
  'utf8',
);

const COACH = '00000000-0000-0000-0000-00000000000c';
const ANA = '00000000-0000-0000-0000-0000000000a1';
const LUIS = '00000000-0000-0000-0000-0000000000a2';
const PARAMETROS = JSON.stringify({ kcal: 2200 });
const COMIDAS = JSON.stringify([{ id: 'c1', nombre: 'Almuerzo', hora: '13:00', opciones: [] }]);

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
  await db.exec('truncate public.nutrition_plans, public.profiles cascade');
  await db.exec(`insert into public.profiles (id, role) values
    ('${COACH}', 'admin'), ('${ANA}', 'alumno'), ('${LUIS}', 'alumno')`);
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

async function plan(alumno, { publicado = false, parametros = PARAMETROS, comidas = COMIDAS, notas = '' } = {}) {
  await db.query(
    'insert into public.nutrition_plans (student_id, parametros, comidas, notas, published) values ($1, $2, $3, $4, $5)',
    [alumno, parametros, comidas, notas, publicado],
  );
}

describe('esquema de nutrición: restricciones', () => {
  it('la migración se puede aplicar dos veces', async () => {
    await db.exec(MIGRACION);
  });

  it('empieza sin publicar: el coach lo prepara y después lo muestra', async () => {
    await db.query('insert into public.nutrition_plans (student_id) values ($1)', [ANA]);
    const { rows } = await db.query('select published, published_at, notas, comidas from public.nutrition_plans');
    expect(rows[0]).toMatchObject({ published: false, published_at: null, notas: '', comidas: [] });
  });

  it('un alumno tiene un solo plan (se actualiza, no se duplica)', async () => {
    await plan(ANA);
    await expect(plan(ANA)).rejects.toThrow(/duplicate key|unique|primary/i);
  });

  it('rechaza parámetros que no son un objeto, comidas que no son una lista y notas demasiado largas', async () => {
    await expect(plan(ANA, { parametros: '[]' })).rejects.toThrow(/check/i);
    await expect(plan(ANA, { comidas: '{}' })).rejects.toThrow(/check/i);
    await expect(plan(ANA, { notas: 'x'.repeat(2001) })).rejects.toThrow(/check/i);
  });

  it('al borrar el alumno se borra su plan', async () => {
    await plan(ANA);
    await db.query('delete from public.profiles where id = $1', [ANA]);
    const { rows } = await db.query('select 1 from public.nutrition_plans');
    expect(rows).toHaveLength(0);
  });

  it('guardar el plan actualiza updated_at', async () => {
    await plan(ANA);
    await db.query(`update public.nutrition_plans set updated_at = '2020-01-01'`);
    await db.query(`update public.nutrition_plans set notas = 'Tomar agua'`);
    const { rows } = await db.query(
      "select updated_at > now() - interval '1 minute' as reciente from public.nutrition_plans",
    );
    expect(rows[0].reciente).toBe(true);
  });
});

describe('esquema de nutrición: permisos (RLS)', () => {
  it('el alumno ve su plan solo cuando el coach lo publicó', async () => {
    await plan(ANA, { publicado: false });
    expect((await como(ANA, 'select 1 from public.nutrition_plans')).rows).toHaveLength(0);
    await db.query('update public.nutrition_plans set published = true');
    expect((await como(ANA, 'select 1 from public.nutrition_plans')).rows).toHaveLength(1);
  });

  it('el alumno no ve el plan de otro alumno aunque esté publicado', async () => {
    await plan(LUIS, { publicado: true });
    expect((await como(ANA, 'select 1 from public.nutrition_plans')).rows).toHaveLength(0);
  });

  it('el admin ve todos los planes, publicados o no, y los puede crear, editar y borrar', async () => {
    await plan(ANA, { publicado: false });
    expect((await como(COACH, 'select 1 from public.nutrition_plans')).rows).toHaveLength(1);
    await como(COACH, 'insert into public.nutrition_plans (student_id) values ($1)', [LUIS]);
    await como(
      COACH,
      `update public.nutrition_plans set published = true, published_at = now() where student_id = $1`,
      [LUIS],
    );
    expect((await como(LUIS, 'select 1 from public.nutrition_plans')).rows).toHaveLength(1);
    await como(COACH, 'delete from public.nutrition_plans');
    expect((await db.query('select 1 from public.nutrition_plans')).rows).toHaveLength(0);
  });

  it('el alumno no puede crear, editar ni borrar planes, ni siquiera el suyo', async () => {
    await expect(como(ANA, 'insert into public.nutrition_plans (student_id) values ($1)', [ANA])).rejects.toThrow(
      /row-level security/i,
    );
    await plan(ANA, { publicado: true });
    // sin política de escritura, el UPDATE/DELETE del alumno no encuentra filas para afectar
    await como(ANA, `update public.nutrition_plans set notas = 'cambiada', published = false`);
    await como(ANA, 'delete from public.nutrition_plans');
    const { rows } = await db.query('select notas, published from public.nutrition_plans');
    expect(rows).toEqual([{ notas: '', published: true }]);
  });

  it('un usuario sin sesión no ve nada', async () => {
    await plan(ANA, { publicado: true });
    expect((await como(null, 'select 1 from public.nutrition_plans')).rows).toHaveLength(0);
  });
});
