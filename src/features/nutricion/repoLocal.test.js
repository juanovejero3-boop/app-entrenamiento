import { describe, expect, it } from 'vitest';
import { alimentosIniciales, crearAlimento } from './alimentos.js';
import { CLAVE_ALIMENTOS, crearRepoNutricionLocal } from './repoLocal.js';

/** Un localStorage de mentira, en memoria. */
function almacenFalso(inicial = {}) {
  const datos = new Map(Object.entries(inicial));
  return {
    datos,
    getItem: (k) => (datos.has(k) ? datos.get(k) : null),
    setItem: (k, v) => void datos.set(k, String(v)),
  };
}
const repoCon = (almacen) => crearRepoNutricionLocal(() => almacen);
const palta = () => crearAlimento({ categoria: 'fats', nombre: 'Palta', porcion: '60 g' });

describe('repo local de nutrición: alimentos', () => {
  it('la primera vez arranca con la base del coach y la guarda, para que los ids no cambien al recargar', () => {
    const almacen = almacenFalso();
    const repo = repoCon(almacen);

    const primera = repo.cargarAlimentos();
    expect(primera.length).toBe(alimentosIniciales().length);
    expect(almacen.datos.has(CLAVE_ALIMENTOS)).toBe(true);
    expect(repo.cargarAlimentos().map((a) => a.id)).toEqual(primera.map((a) => a.id));
  });

  it('lo que se guarda se vuelve a leer igual', () => {
    const repo = repoCon(almacenFalso());
    const lista = [palta()];
    repo.guardarAlimentos(lista);
    expect(repo.cargarAlimentos()).toEqual(lista);
  });

  it('una lista vacía guardada queda vacía: no se vuelve a llenar con la base', () => {
    const repo = repoCon(almacenFalso());
    repo.guardarAlimentos([]);
    expect(repo.cargarAlimentos()).toEqual([]);
  });

  it('usa solo su clave, sin tocar lo demás que haya guardado la app', () => {
    const almacen = almacenFalso({ otra: 'cosa' });
    repoCon(almacen).guardarAlimentos([palta()]);
    expect(almacen.datos.get('otra')).toBe('cosa');
    expect(CLAVE_ALIMENTOS).toBe('pp:v1:nutricion:alimentos');
  });

  it('si lo guardado está roto vuelve a la base en vez de romper la pantalla', () => {
    const repo = repoCon(almacenFalso({ [CLAVE_ALIMENTOS]: '{no es json' }));
    expect(repo.cargarAlimentos().length).toBe(alimentosIniciales().length);
  });

  it('si lo guardado no es una lista también', () => {
    const repo = repoCon(almacenFalso({ [CLAVE_ALIMENTOS]: '{"a":1}' }));
    expect(repo.cargarAlimentos().length).toBe(alimentosIniciales().length);
  });

  it('descarta los alimentos inválidos y conserva los buenos', () => {
    const bueno = palta();
    const guardado = JSON.stringify([bueno, { nombre: 'sin categoría' }, 7]);
    expect(repoCon(almacenFalso({ [CLAVE_ALIMENTOS]: guardado })).cargarAlimentos()).toEqual([bueno]);
  });

  it('si el navegador no deja ni acceder al almacenamiento, usa la base en memoria y no se rompe', () => {
    const repo = crearRepoNutricionLocal(() => {
      throw new Error('bloqueado');
    });
    expect(repo.cargarAlimentos().length).toBe(alimentosIniciales().length);
  });

  it('crear el repo no toca el almacenamiento: eso recién pasa al usarlo', () => {
    let accesos = 0;
    crearRepoNutricionLocal(() => {
      accesos += 1;
      return almacenFalso();
    });
    expect(accesos).toBe(0);
  });

  it('si no se puede guardar lo avisa con un error que se puede mostrar', () => {
    const lleno = almacenFalso();
    lleno.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    expect(() => repoCon(lleno).guardarAlimentos([palta()])).toThrow(/no se pudo guardar/i);
  });
});
