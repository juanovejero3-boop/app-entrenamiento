// @vitest-environment node
// La migración que guarda en cada turno el evento de Google Calendar y su enlace de Meet.
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const migracion = (nombre) => readFileSync(new URL(`../../../supabase/migrations/${nombre}`, import.meta.url), 'utf8');
const MIGRACIONES = [
  '20261125000000_llamadas.sql',
  '20261125010000_llamadas_script.sql',
  '20261126000000_llamadas_calendario.sql',
].map(migracion);
const EVENTO = migracion('20261127000000_llamadas_evento.sql');

const ANA = '00000000-0000-0000-0000-0000000000a1';

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

async function como(usuario, sql, params = []) {
  await db.exec(usuario ? 'set role authenticated' : 'set role anon');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [usuario ?? '']);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role');
  }
}

describe('migración del evento de cada turno', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(SUPABASE_MINIMO);
    await db.exec(`insert into public.profiles (id, role, email) values ('${ANA}', 'alumno', 'ana@test.com')`);
    for (const sql of MIGRACIONES) await db.exec(sql);
    await db.exec(EVENTO);
    await db.exec(EVENTO); // se puede aplicar dos veces
  }, 60_000); // arrancar Postgres en memoria (WASM) puede tardar con la máquina cargada
  afterAll(() => db.close());
  beforeEach(async () => {
    await db.exec('reset role');
    await db.exec('truncate public.call_bookings, public.call_openings');
    await db.query(
      `insert into public.call_openings (agenda, fecha, desde, hasta, duracion_min, descanso_min)
       values ('seguimiento', '2026-12-20', '09:00', '12:00', 30, 30)`,
    );
  });

  it('quien reserva no puede inventar el evento ni el enlace de Meet', async () => {
    await como(
      ANA,
      `insert into public.call_bookings (agenda, fecha, hora, duracion_min, descanso_min, nombre, email, user_id,
         calendario_evento_id, meet_link)
       values ('seguimiento', '2026-12-20', '09:00', 30, 30, 'Ana', 'ana@test.com', $1, 'evento-falso', 'https://malo')`,
      [ANA],
    );
    const { rows } = await db.query('select calendario_evento_id, meet_link from public.call_bookings');
    expect(rows).toEqual([{ calendario_evento_id: '', meet_link: '' }]);
  });

  it('el alumno ve el Meet de su turno', async () => {
    await db.query(
      `insert into public.call_bookings (agenda, fecha, hora, duracion_min, descanso_min, nombre, email, user_id)
       values ('seguimiento', '2026-12-20', '09:00', 30, 30, 'Ana', 'ana@test.com', $1)`,
      [ANA],
    );
    await db.query(`update public.call_bookings set meet_link = 'https://meet.google.com/abc-defg-hij'`);
    expect((await como(ANA, 'select meet_link from public.call_bookings')).rows).toEqual([
      { meet_link: 'https://meet.google.com/abc-defg-hij' },
    ]);
  });
});
