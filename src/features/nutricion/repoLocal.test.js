import { describe, expect, it } from 'vitest';
import { alimentosIniciales, crearAlimento } from './alimentos.js';
import { agregarItem, crearComida } from './comidas.js';
import { CLAVE_ALIMENTOS, claveDelPlan, crearRepoNutricionLocal } from './repoLocal.js';

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

describe('repo local de nutrición: plan de cada alumno', () => {
  const plan = {
    parametros: {
      sexo: 'F',
      edad: 30,
      peso: 60,
      altura: 165,
      actividad: 1.375,
      ajuste: 90,
      proteinaGKg: 2,
      grasaPct: 28,
    },
  };

  it('guarda y devuelve también las comidas del plan', () => {
    const repo = repoCon(almacenFalso());
    const comida = crearComida({ nombre: 'Almuerzo', hora: '13:00' });
    const comidas = agregarItem([comida], comida.id, comida.opciones[0].id, palta(), 2);
    repo.guardarPlan('u1', { ...plan, comidas });
    expect(repo.cargarPlan('u1').comidas).toEqual(comidas);
  });

  it('un plan guardado antes de que existieran las comidas las devuelve vacías', () => {
    const guardado = JSON.stringify({ parametros: plan.parametros });
    expect(repoCon(almacenFalso({ [claveDelPlan('u1')]: guardado })).cargarPlan('u1').comidas).toEqual([]);
  });

  it('sanea las comidas guardadas', () => {
    const guardado = JSON.stringify({
      parametros: plan.parametros,
      comidas: [
        { nombre: 'Cena', hora: 'mal', opciones: [{ items: [{ categoria: 'nada', nombre: 'x', porciones: 1 }] }] },
      ],
    });
    const [cena] = repoCon(almacenFalso({ [claveDelPlan('u1')]: guardado })).cargarPlan('u1').comidas;
    expect(cena).toMatchObject({ nombre: 'Cena', hora: '' });
    expect(cena.opciones[0].items).toEqual([]);
  });

  it('un alumno sin plan devuelve null', () => {
    expect(repoCon(almacenFalso()).cargarPlan('u1')).toBeNull();
  });

  it('lo que se guarda se vuelve a leer igual', () => {
    const repo = repoCon(almacenFalso());
    repo.guardarPlan('u1', { ...plan, comidas: [] });
    expect(repo.cargarPlan('u1')).toEqual({ ...plan, comidas: [] });
  });

  it('cada alumno tiene el suyo', () => {
    const repo = repoCon(almacenFalso());
    repo.guardarPlan('u1', plan);
    expect(repo.cargarPlan('u2')).toBeNull();
    repo.guardarPlan('u2', { parametros: { ...plan.parametros, peso: 80 } });
    expect(repo.cargarPlan('u1').parametros.peso).toBe(60);
    expect(repo.cargarPlan('u2').parametros.peso).toBe(80);
  });

  it('usa una clave por alumno y no toca la de los alimentos', () => {
    const almacen = almacenFalso();
    repoCon(almacen).guardarPlan('u1', plan);
    expect([...almacen.datos.keys()]).toEqual(['pp:v1:nutricion:plan:u1']);
  });

  it('si lo guardado está roto o no es un plan devuelve null', () => {
    expect(repoCon(almacenFalso({ [claveDelPlan('u1')]: '{no es json' })).cargarPlan('u1')).toBeNull();
    expect(repoCon(almacenFalso({ [claveDelPlan('u1')]: '7' })).cargarPlan('u1')).toBeNull();
  });

  it('sanea los parámetros guardados', () => {
    const guardado = JSON.stringify({ parametros: { ...plan.parametros, peso: null, hack: 1 } });
    const leido = repoCon(almacenFalso({ [claveDelPlan('u1')]: guardado })).cargarPlan('u1');
    expect(leido.parametros.peso).toBe('');
    expect(leido.parametros).not.toHaveProperty('hack');
  });

  it('si el navegador no deja acceder al almacenamiento no se rompe', () => {
    const repo = crearRepoNutricionLocal(() => {
      throw new Error('bloqueado');
    });
    expect(repo.cargarPlan('u1')).toBeNull();
  });

  it('si no se puede guardar lo avisa con un error que se puede mostrar', () => {
    const lleno = almacenFalso();
    lleno.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    expect(() => repoCon(lleno).guardarPlan('u1', plan)).toThrow(/no se pudo guardar/i);
  });
});

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
