// Cliente de Supabase falso para los tests: tablas en memoria y solo lo que usa el repo
// (select/insert/update/upsert/delete con eq, in, order, limit, single y maybeSingle) y los canales de Realtime
// (channel/on/subscribe/removeChannel), que avisan cuando se escribe en una tabla, como haría Supabase.
// Aplica los valores por defecto y las claves únicas que importan; los permisos (RLS) y las
// restricciones se prueban contra Postgres de verdad en esquema.test.js.

const CLAVES = {
  training_cycles: ['id'],
  training_sessions: ['cycle_id', 'day_id'],
  training_set_logs: ['cycle_id', 'exercise_id', 'set_n'],
  nutrition_plans: ['student_id'],
  nutrition_foods: ['id'],
};

export function crearClienteFalso() {
  /** @type {Record<string, object[]>} */
  const tablas = {
    training_cycles: [],
    training_sessions: [],
    training_set_logs: [],
    nutrition_plans: [],
    nutrition_foods: [],
  };
  const llamadas = [];
  let falla = null;
  let reloj = 0; // created_at crece con cada fila nueva, así el orden por fecha es el de creación
  /** @type {{ nombre: string, suscripto: boolean, escuchas: { tabla: string, filtro: string, alCambiar: Function }[] }[]} */
  let canales = [];

  /** Avisa (de forma asíncrona, como la red) a los canales que escuchan esa tabla y cuyo filtro coincide. */
  function notificar(tabla, evento, filas) {
    for (const fila of filas) {
      setTimeout(() => {
        for (const canal of canales) {
          for (const escucha of canal.escuchas) {
            if (escucha.tabla !== tabla) continue;
            const [columna, valor] = escucha.filtro.split('=eq.');
            if (columna && String(fila[columna]) !== valor) continue;
            escucha.alCambiar({ eventType: evento, table: tabla, new: fila });
          }
        }
      }, 0);
    }
  }

  class Consulta {
    constructor(tabla) {
      this.tabla = tabla;
      this.filtros = [];
      this.limite = Infinity;
    }
    select() {
      if (!this.op) this.op = 'select';
      else this.devuelve = true; // insert(...).select()
      return this;
    }
    insert(filas) {
      this.op = 'insert';
      this.filas = [].concat(filas);
      return this;
    }
    update(cambios) {
      this.op = 'update';
      this.cambios = cambios;
      return this;
    }
    upsert(filas, opciones = {}) {
      this.op = 'upsert';
      this.filas = [].concat(filas);
      this.conflicto = opciones.onConflict;
      return this;
    }
    delete() {
      this.op = 'delete';
      return this;
    }
    eq(columna, valor) {
      this.filtros.push((fila) => fila[columna] === valor);
      return this;
    }
    in(columna, valores) {
      this.filtros.push((fila) => valores.includes(fila[columna]));
      return this;
    }
    order(columna, { ascending = true } = {}) {
      this.orden = { columna, ascending };
      return this;
    }
    limit(n) {
      this.limite = n;
      return this;
    }
    single() {
      this.uno = 'single';
      return this;
    }
    maybeSingle() {
      this.uno = 'maybe';
      return this;
    }
    then(resolver, rechazar) {
      return Promise.resolve(this.ejecutar()).then(resolver, rechazar);
    }

    coincide(fila) {
      return this.filtros.every((f) => f(fila));
    }

    ejecutar() {
      llamadas.push({ tabla: this.tabla, op: this.op, filas: this.filas, cambios: this.cambios });
      if (falla) {
        const error = { message: falla };
        falla = null;
        return { data: null, error };
      }
      const filas = tablas[this.tabla];
      let resultado = [];
      if (this.op === 'select') {
        resultado = filas.filter((f) => this.coincide(f));
        if (this.orden) {
          const { columna, ascending } = this.orden;
          resultado.sort(
            (a, b) => (a[columna] < b[columna] ? -1 : a[columna] > b[columna] ? 1 : 0) * (ascending ? 1 : -1),
          );
        }
        resultado = resultado.slice(0, this.limite);
      } else if (this.op === 'insert') {
        resultado = this.filas.map((f) => ({
          id: crypto.randomUUID(),
          status: 'activo',
          finished_at: null,
          created_at: new Date(Date.UTC(2026, 0, 1) + ++reloj * 1000).toISOString(),
          ...f,
        }));
        filas.push(...resultado);
      } else if (this.op === 'update') {
        resultado = filas.filter((f) => this.coincide(f));
        resultado.forEach((f) => Object.assign(f, this.cambios));
      } else if (this.op === 'upsert') {
        const claves = this.conflicto?.split(',') ?? CLAVES[this.tabla];
        for (const nueva of this.filas) {
          const existente = filas.find((f) => claves.every((c) => f[c] === nueva[c]));
          if (existente) Object.assign(existente, nueva);
          else filas.push({ ...nueva });
        }
      } else if (this.op === 'delete') {
        const borrar = filas.filter((f) => this.coincide(f));
        tablas[this.tabla] = filas.filter((f) => !borrar.includes(f));
        resultado = borrar;
        if (this.tabla === 'training_cycles') {
          // borrado en cascada
          const ids = borrar.map((f) => f.id);
          for (const hija of ['training_sessions', 'training_set_logs']) {
            tablas[hija] = tablas[hija].filter((f) => !ids.includes(f.cycle_id));
          }
        }
      }

      const eventos = { insert: 'INSERT', update: 'UPDATE', upsert: 'UPDATE', delete: 'DELETE' };
      if (eventos[this.op]) {
        const afectadas = this.op === 'upsert' ? this.filas : resultado;
        notificar(this.tabla, eventos[this.op], afectadas);
      }

      if (this.uno === 'single' || this.uno === 'maybe') {
        if (resultado.length > 1) return { data: null, error: { message: 'Más de una fila' } };
        if (!resultado.length && this.uno === 'single') return { data: null, error: { message: 'Sin filas' } };
        return { data: resultado[0] ?? null, error: null };
      }
      return { data: this.op === 'select' || this.devuelve ? resultado : null, error: null };
    }
  }

  return {
    from: (tabla) => new Consulta(tabla),
    channel(nombre) {
      const canal = { nombre, suscripto: false, escuchas: [] };
      canales.push(canal);
      const api = {
        on(_tipo, { table, filter }, alCambiar) {
          canal.escuchas.push({ tabla: table, filtro: filter ?? '', alCambiar });
          return api;
        },
        subscribe() {
          canal.suscripto = true;
          return api;
        },
        _canal: canal,
      };
      return api;
    },
    removeChannel(api) {
      canales = canales.filter((c) => c !== api._canal);
    },
    // ayudas para los tests
    get canales() {
      return canales;
    },
    canalesActivos: () => canales.length,
    tablas,
    llamadas,
    /** Vacía las tablas y el registro de llamadas (entre test y test). */
    reiniciar() {
      for (const tabla of Object.keys(tablas)) tablas[tabla] = [];
      llamadas.length = 0;
      canales = [];
      falla = null;
    },
    /** La próxima consulta devuelve este error. */
    fallarLaProxima(mensaje) {
      falla = mensaje;
    },
  };
}
