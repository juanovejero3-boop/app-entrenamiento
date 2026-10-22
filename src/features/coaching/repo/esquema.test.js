// @vitest-environment node
// Aplica la migración de entrenamiento sobre un Postgres real (PGlite, corre en memoria) y
// verifica las restricciones y los permisos (RLS): quién ve y escribe qué.
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const MIGRACION = readFileSync(
  new URL('../../../../supabase/migrations/20261016000000_training_tables.sql', import.meta.url),
  'utf8',
);

const COACH = '00000000-0000-0000-0000-00000000000c';
const ANA = '00000000-0000-0000-0000-0000000000a1';
const LUIS = '00000000-0000-0000-0000-0000000000a2';
const PLAN = JSON.stringify({ macroName: 'Fuerza', weeks: [] });

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
  await db.exec('truncate public.training_cycles, public.profiles cascade');
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

async function ciclo(alumno, estado = 'activo') {
  const { rows } = await db.query(
    'insert into public.training_cycles (student_id, status, plan) values ($1, $2, $3) returning id',
    [alumno, estado, PLAN],
  );
  return rows[0].id;
}

const sesion = (cicloId, alumno, dia = 'd1') =>
  como(
    alumno,
    `insert into public.training_sessions (cycle_id, student_id, day_id, fecha) values ($1, $2, $3, '2026-10-16')`,
    [cicloId, alumno, dia],
  );
const serie = (cicloId, alumno, ejercicio = 'e1', n = 1) =>
  como(
    alumno,
    `insert into public.training_set_logs (cycle_id, student_id, exercise_id, set_n, kg) values ($1, $2, $3, $4, '80')`,
    [cicloId, alumno, ejercicio, n],
  );

describe('esquema de entrenamiento: restricciones', () => {
  it('la migración se puede aplicar dos veces', async () => {
    await expect(db.exec(MIGRACION)).resolves.not.toThrow();
  });

  it('un alumno puede tener varios ciclos finalizados pero un solo ciclo activo', async () => {
    await ciclo(ANA, 'finalizado');
    await ciclo(ANA, 'finalizado');
    await ciclo(ANA, 'borrador');
    await ciclo(ANA, 'activo');
    await expect(ciclo(ANA, 'activo')).rejects.toThrow(/uq_training_cycles_un_activo/);
    await expect(ciclo(LUIS, 'activo')).resolves.toBeTruthy(); // otro alumno, otro activo
  });

  it('rechaza un estado de ciclo o de sesión desconocido y un plan que no es un objeto', async () => {
    await expect(ciclo(ANA, 'pausado')).rejects.toThrow(/check/);
    await expect(
      db.query(`insert into public.training_cycles (student_id, plan) values ($1, '[]')`, [ANA]),
    ).rejects.toThrow(/check/);
    const id = await ciclo(ANA);
    await expect(
      db.query(
        `insert into public.training_sessions (cycle_id, student_id, day_id, fecha, estado) values ($1, $2, 'd1', '2026-10-16', 'quizas')`,
        [id, ANA],
      ),
    ).rejects.toThrow(/check/);
  });

  it('una serie no puede estar hecha y omitida a la vez, ni tener número menor a 1', async () => {
    const id = await ciclo(ANA);
    await expect(
      db.query(
        `insert into public.training_set_logs (cycle_id, student_id, exercise_id, set_n, done, skipped) values ($1, $2, 'e1', 1, true, true)`,
        [id, ANA],
      ),
    ).rejects.toThrow(/check/);
    await expect(
      db.query(
        `insert into public.training_set_logs (cycle_id, student_id, exercise_id, set_n) values ($1, $2, 'e1', 0)`,
        [id, ANA],
      ),
    ).rejects.toThrow(/check/);
  });

  it('una sesión o una serie no pueden apuntar a un ciclo de otro alumno', async () => {
    const id = await ciclo(ANA);
    // como dueño de la base, sin pasar por RLS: lo frena la clave foránea compuesta
    await expect(
      db.query(
        `insert into public.training_sessions (cycle_id, student_id, day_id, fecha) values ($1, $2, 'd1', '2026-10-16')`,
        [id, LUIS],
      ),
    ).rejects.toThrow(/foreign key/);
    await expect(
      db.query(
        `insert into public.training_set_logs (cycle_id, student_id, exercise_id, set_n) values ($1, $2, 'e1', 1)`,
        [id, LUIS],
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it('un día y una serie se guardan una sola vez por ciclo (hay que actualizarlos)', async () => {
    const id = await ciclo(ANA);
    await sesion(id, ANA);
    await serie(id, ANA);
    await expect(sesion(id, ANA)).rejects.toThrow(/duplicate key/);
    await expect(serie(id, ANA)).rejects.toThrow(/duplicate key/);
    await expect(sesion(id, ANA, 'd2')).resolves.toBeTruthy();
  });

  it('al borrar el ciclo se borran sus sesiones y series; al borrar el alumno, sus ciclos', async () => {
    const id = await ciclo(ANA);
    await sesion(id, ANA);
    await serie(id, ANA);
    await db.query('delete from public.profiles where id = $1', [ANA]);
    for (const tabla of ['training_cycles', 'training_sessions', 'training_set_logs']) {
      expect((await db.query(`select 1 from public.${tabla}`)).rows).toHaveLength(0);
    }
  });

  it('guardar un ciclo actualiza updated_at', async () => {
    const id = await ciclo(ANA);
    const antes = (await db.query('select updated_at from public.training_cycles where id = $1', [id])).rows[0]
      .updated_at;
    await new Promise((r) => setTimeout(r, 20));
    await db.query(`update public.training_cycles set status = 'finalizado' where id = $1`, [id]);
    const despues = (await db.query('select updated_at from public.training_cycles where id = $1', [id])).rows[0]
      .updated_at;
    expect(despues.getTime()).toBeGreaterThan(antes.getTime());
  });
});

describe('esquema de entrenamiento: permisos (RLS)', () => {
  it('el alumno ve su ciclo activo y los finalizados, no los borradores ni los de otros', async () => {
    await ciclo(ANA, 'activo');
    await ciclo(ANA, 'finalizado');
    await ciclo(ANA, 'borrador');
    await ciclo(LUIS, 'activo');

    const { rows } = await como(ANA, 'select status from public.training_cycles order by status');
    expect(rows.map((r) => r.status)).toEqual(['activo', 'finalizado']);
  });

  it('el admin ve todos los ciclos, borradores incluidos, y los puede crear y editar', async () => {
    await ciclo(ANA, 'borrador');
    await ciclo(LUIS, 'activo');
    expect((await como(COACH, 'select 1 from public.training_cycles')).rows).toHaveLength(2);

    await como(COACH, `insert into public.training_cycles (student_id, plan) values ($1, $2)`, [COACH, PLAN]);
    const editado = await como(COACH, `update public.training_cycles set status = 'activo' where student_id = $1`, [
      ANA,
    ]);
    expect(editado.affectedRows).toBe(1);
  });

  it('el admin puede borrar un ciclo de cualquier estado, con lo que el alumno anotó en él', async () => {
    for (const estado of ['finalizado', 'activo']) {
      const id = await ciclo(ANA, estado);
      // se cargan como dueño de la base: en un ciclo finalizado el alumno ya no puede escribir
      await db.query(
        `insert into public.training_sessions (cycle_id, student_id, day_id, fecha) values ($1, $2, 'd1', '2026-10-16')`,
        [id, ANA],
      );
      await db.query(
        `insert into public.training_set_logs (cycle_id, student_id, exercise_id, set_n) values ($1, $2, 'e1', 1)`,
        [id, ANA],
      );
      const borrado = await como(COACH, 'delete from public.training_cycles where id = $1', [id]);
      expect(borrado.affectedRows).toBe(1);
    }
    for (const tabla of ['training_cycles', 'training_sessions', 'training_set_logs']) {
      expect((await db.query(`select 1 from public.${tabla}`)).rows).toHaveLength(0);
    }
  });

  it('el alumno no puede crear, editar ni borrar ciclos', async () => {
    const id = await ciclo(ANA);
    await expect(
      como(ANA, `insert into public.training_cycles (student_id, plan) values ($1, $2)`, [ANA, PLAN]),
    ).rejects.toThrow(/row-level security/);
    expect((await como(ANA, `update public.training_cycles set plan = '{}' where id = $1`, [id])).affectedRows).toBe(0);
    expect((await como(ANA, 'delete from public.training_cycles where id = $1', [id])).affectedRows).toBe(0);
    expect((await db.query('select 1 from public.training_cycles')).rows).toHaveLength(1);
  });

  it('el alumno anota sesiones y series en su ciclo activo, las corrige y las borra (reabrir)', async () => {
    const id = await ciclo(ANA);
    await sesion(id, ANA);
    await serie(id, ANA);

    const corregida = await como(
      ANA,
      `update public.training_set_logs set kg = '85', done = true where cycle_id = $1`,
      [id],
    );
    expect(corregida.affectedRows).toBe(1);
    const reabierta = await como(ANA, 'delete from public.training_sessions where cycle_id = $1', [id]);
    expect(reabierta.affectedRows).toBe(1);
  });

  it('el alumno no puede escribir en el ciclo de otro alumno', async () => {
    const delOtro = await ciclo(LUIS);
    await expect(sesion(delOtro, ANA)).rejects.toThrow(/row-level security|foreign key/);
    await expect(serie(delOtro, ANA)).rejects.toThrow(/row-level security|foreign key/);
    expect((await db.query('select 1 from public.training_sessions')).rows).toHaveLength(0);
  });

  it('no puede escribir como otro alumno aunque el ciclo sea suyo', async () => {
    const id = await ciclo(ANA);
    await expect(
      sesion(id, ANA).then(() => como(LUIS, 'select 1 from public.training_sessions')),
    ).resolves.toBeTruthy();
    expect((await como(LUIS, 'select 1 from public.training_sessions')).rows).toHaveLength(0);
    expect((await como(LUIS, `update public.training_sessions set estado = 'omitida'`)).affectedRows).toBe(0);
  });

  it('en un ciclo finalizado el alumno lee lo suyo pero ya no puede cambiarlo', async () => {
    const id = await ciclo(ANA);
    await sesion(id, ANA);
    await serie(id, ANA);
    await db.query(`update public.training_cycles set status = 'finalizado' where id = $1`, [id]);

    expect((await como(ANA, 'select 1 from public.training_sessions')).rows).toHaveLength(1);
    expect((await como(ANA, 'select 1 from public.training_set_logs')).rows).toHaveLength(1);
    await expect(sesion(id, ANA, 'd2')).rejects.toThrow(/row-level security/);
    await expect(serie(id, ANA, 'e1', 2)).rejects.toThrow(/row-level security/);
    expect((await como(ANA, `update public.training_set_logs set kg = '1'`)).affectedRows).toBe(0);
    expect((await como(ANA, 'delete from public.training_sessions')).affectedRows).toBe(0);
  });

  it('el admin ve lo que anotó el alumno y puede corregirlo', async () => {
    const id = await ciclo(ANA);
    await sesion(id, ANA);
    await serie(id, ANA);
    expect((await como(COACH, 'select 1 from public.training_sessions')).rows).toHaveLength(1);
    expect((await como(COACH, `update public.training_set_logs set kg = '90'`)).affectedRows).toBe(1);
  });

  it('un usuario sin sesión no ve nada', async () => {
    const id = await ciclo(ANA);
    await sesion(id, ANA);
    for (const tabla of ['training_cycles', 'training_sessions', 'training_set_logs']) {
      expect((await como(null, `select 1 from public.${tabla}`)).rows).toHaveLength(0);
    }
  });
});
