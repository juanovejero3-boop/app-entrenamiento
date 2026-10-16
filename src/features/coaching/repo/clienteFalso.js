// Cliente de Supabase falso para los tests: tablas en memoria y solo lo que usa el repo
// (select/insert/update/upsert/delete con eq, in, limit, single y maybeSingle).
// Aplica los valores por defecto y las claves únicas que importan; los permisos (RLS) y las
// restricciones se prueban contra Postgres de verdad en esquema.test.js.

const CLAVES = {
  training_cycles: ['id'],
  training_sessions: ['cycle_id', 'day_id'],
  training_set_logs: ['cycle_id', 'exercise_id', 'set_n'],
};

export function crearClienteFalso() {
  /** @type {Record<string, object[]>} */
  const tablas = { training_cycles: [], training_sessions: [], training_set_logs: [] };
  const llamadas = [];
  let falla = null;

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
        resultado = filas.filter((f) => this.coincide(f)).slice(0, this.limite);
      } else if (this.op === 'insert') {
        resultado = this.filas.map((f) => ({ id: crypto.randomUUID(), status: 'activo', ...f }));
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
        if (this.tabla === 'training_cycles') {
          // borrado en cascada
          const ids = borrar.map((f) => f.id);
          for (const hija of ['training_sessions', 'training_set_logs']) {
            tablas[hija] = tablas[hija].filter((f) => !ids.includes(f.cycle_id));
          }
        }
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
    // ayudas para los tests
    tablas,
    llamadas,
    /** La próxima consulta devuelve este error. */
    fallarLaProxima(mensaje) {
      falla = mensaje;
    },
  };
}
