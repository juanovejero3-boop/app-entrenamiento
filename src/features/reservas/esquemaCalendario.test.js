// @vitest-environment node
// La migración que agrega los coaches con su script y el resultado del calendario en cada turno.
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const migracion = (nombre) => readFileSync(new URL(`../../../supabase/migrations/${nombre}`, import.meta.url), 'utf8');
const LLAMADAS = migracion('20261125000000_llamadas.sql');
const SCRIPT = migracion('20261125010000_llamadas_script.sql');
const CALENDARIO = migracion('20261126000000_llamadas_calendario.sql');

const COACH = '00000000-0000-0000-0000-00000000000c';
const OTRO_COACH = '00000000-0000-0000-0000-00000000000d';
const ANA = '00000000-0000-0000-0000-0000000000a1';
const URL_SCRIPT = 'https://script.google.com/macros/s/abc/exec';

const SUPABASE_MINIMO = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table public.profiles (id uuid primary key, role text not null default 'alumno', email text);
  create function public.is_admin() returns boolean language sql security definer stable
    as $$ select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on all functions in schema public to anon, authenticated;
`;

let db;

/** Arranca una base nueva con las migraciones; `antesDeCalendario` corre entre la del script y la nueva. */
async function base(antesDeCalendario = '') {
  db = new PGlite();
  await db.exec(SUPABASE_MINIMO);
  await db.exec(`insert into public.profiles (id, role, email) values
    ('${COACH}', 'admin', 'Coach@Test.com'), ('${OTRO_COACH}', 'admin', 'otro@test.com'), ('${ANA}', 'alumno', 'ana@test.com')`);
  await db.exec(LLAMADAS);
  await db.exec(SCRIPT);
  if (antesDeCalendario) await db.exec(antesDeCalendario);
  await db.exec(CALENDARIO);
}

async function como(usuario, sql, params = []) {
  await db.exec(usuario ? 'set role authenticated' : 'set role anon');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [usuario ?? '']);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role');
  }
}

/** Abre un día de primera llamada (la que puede reservar alguien sin cuenta). */
const abrirDia = (coach = COACH) =>
  db.query(
    `insert into public.call_openings (agenda, fecha, desde, hasta, duracion_min, descanso_min, coach_id)
     values ('primera', '2026-12-20', '09:00', '12:00', 30, 30, $1)`,
    [coach],
  );

describe('migración del calendario: lo que ya estaba cargado', () => {
  it('el script que el coach ya había guardado pasa a ser suyo, y sus días y turnos quedan a su nombre', async () => {
    await base(`
      update public.call_settings set script_url = '${URL_SCRIPT}', coach_email = 'coach@test.com' where id = 'coach';
      insert into public.call_openings (agenda, fecha, desde, hasta, duracion_min, descanso_min)
        values ('seguimiento', '2026-12-20', '09:00', '12:00', 30, 30);
      insert into public.call_bookings (agenda, fecha, hora, duracion_min, descanso_min, nombre, email)
        values ('seguimiento', '2026-12-20', '09:00', 30, 30, 'Ana', 'ana@test.com');
    `);
    const { rows } = await db.query('select coach_id, script_url, coach_email from public.call_coaches');
    expect(rows).toEqual([{ coach_id: COACH, script_url: URL_SCRIPT, coach_email: 'coach@test.com' }]);
    expect((await db.query('select coach_id from public.call_openings')).rows).toEqual([{ coach_id: COACH }]);
    const turno = (await db.query('select coach_id, calendario_estado from public.call_bookings')).rows[0];
    expect(turno).toEqual({ coach_id: COACH, calendario_estado: 'pendiente' });
    await db.close();
  }, 60_000); // arrancar Postgres en memoria (WASM) puede tardar con la máquina cargada

  it('se puede aplicar dos veces sin duplicar nada', async () => {
    await base(`update public.call_settings set script_url = '${URL_SCRIPT}', coach_email = 'coach@test.com';`);
    await db.exec(CALENDARIO);
    expect((await db.query('select 1 from public.call_coaches')).rows).toHaveLength(1);
    await db.close();
  }, 60_000); // arrancar Postgres en memoria (WASM) puede tardar con la máquina cargada
});

describe('migración del calendario: turnos nuevos', () => {
  beforeAll(async () => {
    await base();
  }, 60_000);
  afterAll(() => db.close());
  beforeEach(async () => {
    await db.exec('reset role');
    await db.exec('truncate public.call_bookings, public.call_openings, public.call_coaches');
  });

  it('un turno nuevo toma el coach de su día, aunque quien reserva mande otro', async () => {
    await abrirDia(COACH);
    await como(
      null,
      `insert into public.call_bookings (agenda, fecha, hora, duracion_min, descanso_min, nombre, email, coach_id)
       values ('primera', '2026-12-20', '09:00', 30, 30, 'Ana', 'ana@test.com', $1)`,
      [OTRO_COACH],
    );
    expect((await db.query('select coach_id from public.call_bookings')).rows).toEqual([{ coach_id: COACH }]);
  });

  it('quien reserva no puede marcar su turno como ya agendado', async () => {
    await abrirDia();
    await como(
      null,
      `insert into public.call_bookings (agenda, fecha, hora, duracion_min, descanso_min, nombre, email, calendario_estado, calendario_error)
       values ('primera', '2026-12-20', '09:00', 30, 30, 'Ana', 'ana@test.com', 'agendado', 'x')`,
    );
    const { rows } = await db.query('select calendario_estado, calendario_error from public.call_bookings');
    expect(rows).toEqual([{ calendario_estado: 'pendiente', calendario_error: '' }]);
  });

  it('acepta el id que genera la app (así puede pedir que se agende sin poder leer la tabla)', async () => {
    await abrirDia();
    const id = '00000000-0000-0000-0000-0000000000b1';
    await como(
      null,
      `insert into public.call_bookings (id, agenda, fecha, hora, duracion_min, descanso_min, nombre, email)
       values ($1, 'primera', '2026-12-20', '09:00', 30, 30, 'Ana', 'ana@test.com')`,
      [id],
    );
    expect((await db.query('select id from public.call_bookings')).rows).toEqual([{ id }]);
  });

  it('el estado del calendario solo admite los valores conocidos', async () => {
    await abrirDia();
    await db.query(
      `insert into public.call_bookings (agenda, fecha, hora, duracion_min, descanso_min, nombre, email)
       values ('seguimiento', '2026-12-20', '09:00', 30, 30, 'Ana', 'ana@test.com')`,
    );
    await expect(db.query(`update public.call_bookings set calendario_estado = 'cualquiera'`)).rejects.toThrow(
      /check/i,
    );
    await db.query(`update public.call_bookings set calendario_estado = 'agendado'`);
  });

  it('la dirección del script ya no es pública: ni el anónimo ni el alumno la leen; el coach sí', async () => {
    await db.query(
      `insert into public.call_coaches (coach_id, script_url, coach_email) values ($1, $2, 'coach@test.com')`,
      [COACH, URL_SCRIPT],
    );
    await expect(como(null, 'select script_url from public.call_coaches')).rejects.toThrow(/permission denied/i);
    expect((await como(ANA, 'select script_url from public.call_coaches')).rows).toEqual([]);
    expect((await como(COACH, 'select script_url from public.call_coaches')).rows).toEqual([
      { script_url: URL_SCRIPT },
    ]);
    await expect(como(null, 'select script_url from public.call_settings')).rejects.toThrow(/permission denied/i);
    expect((await como(ANA, 'select script_url from public.call_settings')).rows).toEqual([]);
  });

  it('el alumno no puede cambiar el script de nadie', async () => {
    await expect(
      como(ANA, `insert into public.call_coaches (coach_id, script_url) values ($1, 'https://otro')`, [ANA]),
    ).rejects.toThrow(/row-level security/i);
  });
});
