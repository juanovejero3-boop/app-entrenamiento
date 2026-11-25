// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const MIGRACION = readFileSync(
  new URL('../../../supabase/migrations/20261125000000_llamadas.sql', import.meta.url),
  'utf8',
);
const MIGRACION_SCRIPT = readFileSync(
  new URL('../../../supabase/migrations/20261125010000_llamadas_script.sql', import.meta.url),
  'utf8',
);

const COACH = '00000000-0000-0000-0000-00000000000c';
const ANA = '00000000-0000-0000-0000-0000000000a1';
const LUIS = '00000000-0000-0000-0000-0000000000a2';

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
  await db.exec(MIGRACION_SCRIPT);
}, 60_000);

afterAll(() => db.close());

beforeEach(async () => {
  await db.exec('reset role');
  await db.exec('truncate public.call_bookings, public.call_openings, public.group_calls, public.profiles cascade');
  await db.exec(`insert into public.profiles (id, role) values
    ('${COACH}', 'admin'), ('${ANA}', 'alumno'), ('${LUIS}', 'alumno')`);
});

async function como(usuario, sql, params = []) {
  await db.exec(usuario ? 'set role authenticated' : 'set role anon');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [usuario ?? '']);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role');
  }
}

describe('esquema de llamadas', () => {
  it('la migración se puede aplicar dos veces', async () => {
    await db.exec(MIGRACION);
    await db.exec(MIGRACION_SCRIPT);
  });

  it('cualquiera lee el script del coach y solo el admin lo cambia', async () => {
    await como(
      COACH,
      `update public.call_settings set script_url = 'https://script.google.com/macros/s/abc/exec', coach_email = 'coach@test.com' where id = 'coach'`,
    );
    const publico = await como(null, 'select script_url, coach_email from public.call_settings');
    expect(publico.rows[0]).toMatchObject({
      script_url: 'https://script.google.com/macros/s/abc/exec',
      coach_email: 'coach@test.com',
    });

    await expect(como(null, `update public.call_settings set script_url = 'https://evil' where id = 'coach'`)).rejects.toThrow();
    const sigue = await db.query('select script_url from public.call_settings');
    expect(sigue.rows[0].script_url).toBe('https://script.google.com/macros/s/abc/exec');
  });

  it('dos turnos no se pisan y un email no repite el día', async () => {
    await db.query(
      `insert into public.call_bookings (agenda, fecha, hora, duracion_min, descanso_min, nombre, email, user_id)
       values ('seguimiento', '2026-12-20', '11:30', 30, 30, 'Ana', 'Ana@test.com', $1)`,
      [ANA],
    );
    await expect(
      db.query(
        `insert into public.call_bookings (agenda, fecha, hora, duracion_min, descanso_min, nombre, email)
         values ('primera', '2026-12-20', '12:00', 20, 0, 'Luis', 'luis@test.com')`,
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        `insert into public.call_bookings (agenda, fecha, hora, duracion_min, descanso_min, nombre, email)
         values ('seguimiento', '2026-12-20', '15:00', 30, 0, 'Ana', 'ana@test.com')`,
      ),
    ).rejects.toThrow();
    const { rows } = await db.query(`select email, bloque from public.call_bookings`);
    expect(rows[0].email).toBe('ana@test.com');
    expect(rows[0].bloque).toContain('11:30');
  });

  it('el anónimo reserva la primera llamada y no ve el teléfono', async () => {
    await db.query(
      `insert into public.call_openings (agenda, fecha, desde, hasta, duracion_min, descanso_min)
       values ('primera', '2026-12-20', '14:00', '16:00', 20, 0),
              ('seguimiento', '2026-12-20', '09:00', '12:00', 30, 30)`,
    );
    await como(
      null,
      `insert into public.call_bookings (agenda, fecha, hora, duracion_min, descanso_min, nombre, email, telefono, user_id)
       values ('primera', '2026-12-20', '14:00', 20, 0, 'Ana', 'ana@test.com', '111', null)`,
    );
    await expect(
      como(
        null,
        `insert into public.call_bookings (agenda, fecha, hora, duracion_min, descanso_min, nombre, email)
         values ('seguimiento', '2026-12-20', '09:00', 30, 30, 'Ana', 'ana2@test.com')`,
      ),
    ).rejects.toThrow();

    const propias = await como(null, 'select nombre from public.call_bookings');
    expect(propias.rows).toEqual([]);
    const huecos = await como(null, 'select agenda, hora::text from public.call_occupancy()');
    expect(huecos.rows).toEqual([{ agenda: 'primera', hora: '14:00:00' }]);
    const dias = await como(null, 'select agenda from public.call_openings order by agenda');
    expect(dias.rows.map((fila) => fila.agenda)).toEqual(['primera']);
    await expect(como(null, 'select enlace from public.group_calls')).rejects.toThrow();
  });

  it('el alumno ve su turno y la grupal, no el teléfono de otro', async () => {
    await db.query(
      `insert into public.call_bookings (agenda, fecha, hora, duracion_min, descanso_min, nombre, email, telefono, user_id)
       values ('seguimiento', '2026-12-20', '09:00', 30, 30, 'Ana', 'ana@test.com', '111', $1),
              ('seguimiento', '2026-12-21', '09:00', 30, 30, 'Luis', 'luis@test.com', '222', $2)`,
      [ANA, LUIS],
    );
    await db.query(
      `insert into public.group_calls (id, fecha, hora, enlace) values ('00000000-0000-0000-0000-000000000091', '2026-12-20', '19:00', 'https://meet.google.com/abc')`,
    );

    const turnos = await como(ANA, 'select telefono from public.call_bookings');
    expect(turnos.rows).toEqual([{ telefono: '111' }]);
    const grupales = await como(ANA, 'select enlace from public.group_calls');
    expect(grupales.rows).toEqual([{ enlace: 'https://meet.google.com/abc' }]);

    const coach = await como(COACH, 'select telefono from public.call_bookings order by telefono');
    expect(coach.rows.map((fila) => fila.telefono)).toEqual(['111', '222']);
  });
});
