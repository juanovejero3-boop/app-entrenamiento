import { describe, expect, it } from 'vitest';
import {
  ACTIVIDADES,
  calcularObjetivos,
  normalizarParametros,
  parametrosIniciales,
  validarParametros,
} from './objetivos.js';

const base = {
  sexo: 'M',
  edad: 28,
  peso: 75,
  altura: 175,
  actividad: 1.55,
  ajuste: 100,
  proteinaGKg: 2.2,
  grasaPct: 25,
};

describe('calcularObjetivos', () => {
  it('calcula el gasto con Mifflin-St Jeor para un hombre (a mano: 10·75 + 6,25·175 − 5·28 + 5 = 1708,75)', () => {
    const r = calcularObjetivos(base);
    expect(r.tmb).toBe(1709);
    expect(r.tdee).toBe(2649); // 1708,75 × 1,55 = 2648,56
    expect(r.kcal).toBe(2649);
  });

  it('para una mujer resta 161 en vez de sumar 5', () => {
    const r = calcularObjetivos({ ...base, sexo: 'F', peso: 60, altura: 165, edad: 30 });
    expect(r.tmb).toBe(Math.round(10 * 60 + 6.25 * 165 - 5 * 30 - 161)); // 1320
    expect(r.tdee).toBe(Math.round(1320.25 * 1.55));
  });

  it('el ajuste calórico es un porcentaje del gasto: 85 % es déficit y 115 % superávit', () => {
    expect(calcularObjetivos({ ...base, ajuste: 85 }).kcal).toBe(Math.round(2648.5625 * 0.85));
    expect(calcularObjetivos({ ...base, ajuste: 115 }).kcal).toBe(Math.round(2648.5625 * 1.15));
    expect(calcularObjetivos({ ...base, ajuste: 85 }).tdee).toBe(2649); // el gasto no cambia
  });

  it('la proteína sale del peso (g por kg), la grasa del porcentaje de calorías y los carbohidratos son lo que queda', () => {
    const r = calcularObjetivos(base);
    expect(r.p).toBe(165); // 75 × 2,2
    expect(r.f).toBe(74); // 2648,56 × 25 % / 9 = 73,57
    expect(r.c).toBe(332); // (2648,56 − 165·4 − 73,57·9) / 4 = 331,64
  });

  it('el porcentaje de grasa ya no está fijo: cambiarlo cambia las grasas y los carbohidratos', () => {
    const poca = calcularObjetivos({ ...base, grasaPct: 20 });
    const mucha = calcularObjetivos({ ...base, grasaPct: 35 });
    expect(mucha.f).toBeGreaterThan(poca.f);
    expect(mucha.c).toBeLessThan(poca.c);
    expect(poca.p).toBe(mucha.p);
  });

  it('las calorías de los macros suman el objetivo (con el redondeo)', () => {
    const r = calcularObjetivos(base);
    expect(Math.abs(r.p * 4 + r.c * 4 + r.f * 9 - r.kcal)).toBeLessThanOrEqual(14);
  });

  it('informa el porcentaje de calorías de cada macro, y suma 100', () => {
    const { porcentajes } = calcularObjetivos(base);
    expect(porcentajes.p + porcentajes.c + porcentajes.f).toBe(100);
    expect(porcentajes.f).toBe(25);
    expect(porcentajes.p).toBe(25); // 660 / 2649
  });

  it('si proteína y grasa ya superan las calorías los carbohidratos quedan en 0 y avisa', () => {
    const r = calcularObjetivos({ ...base, peso: 120, proteinaGKg: 4, ajuste: 65, grasaPct: 45 });
    expect(r.c).toBe(0);
    expect(r.advertencia).toMatch(/superan/i);
    expect(r.porcentajes.p + r.porcentajes.c + r.porcentajes.f).toBe(100);
  });

  it('con parámetros normales no hay advertencia', () => {
    expect(calcularObjetivos(base).advertencia).toBeNull();
  });

  it('acepta números escritos como texto (vienen de un formulario)', () => {
    const r = calcularObjetivos({
      sexo: 'M',
      edad: '28',
      peso: '75',
      altura: '175',
      actividad: '1.55',
      ajuste: '100',
      proteinaGKg: '2.2',
      grasaPct: '25',
    });
    expect(r.kcal).toBe(2649);
  });

  it('con datos que faltan o no sirven devuelve null en vez de números raros', () => {
    expect(calcularObjetivos({ ...base, edad: '' })).toBeNull();
    expect(calcularObjetivos({ ...base, peso: 'abc' })).toBeNull();
    expect(calcularObjetivos({ ...base, altura: 0 })).toBeNull();
  });
});

describe('validarParametros', () => {
  it('unos parámetros correctos no tienen error', () => {
    expect(validarParametros(base)).toBeNull();
  });

  it.each([
    [{ edad: '' }, /edad/i],
    [{ edad: 5 }, /edad/i],
    [{ edad: 120 }, /edad/i],
    [{ peso: 20 }, /peso/i],
    [{ peso: 400 }, /peso/i],
    [{ altura: 80 }, /altura/i],
    [{ altura: 260 }, /altura/i],
    [{ sexo: 'X' }, /sexo/i],
    [{ actividad: 3 }, /actividad/i],
    [{ ajuste: 50 }, /ajuste/i],
    [{ ajuste: 200 }, /ajuste/i],
    [{ proteinaGKg: 0.5 }, /prote/i],
    [{ proteinaGKg: 5 }, /prote/i],
    [{ grasaPct: 5 }, /grasa/i],
    [{ grasaPct: 70 }, /grasa/i],
  ])('rechaza %j', (cambio, mensaje) => {
    expect(validarParametros({ ...base, ...cambio })).toMatch(mensaje);
  });
});

describe('parametrosIniciales', () => {
  it('toma el peso y la altura del perfil del alumno y deja la edad para que la cargue el coach', () => {
    const p = parametrosIniciales({ weight_kg: 62, height_cm: 164 });
    expect(p).toMatchObject({ peso: 62, altura: 164, edad: '' });
  });

  it('con un perfil sin datos queda vacío lo que falta y con valores razonables el resto', () => {
    const p = parametrosIniciales({});
    expect(p).toMatchObject({
      peso: '',
      altura: '',
      sexo: 'M',
      actividad: 1.55,
      ajuste: 100,
      proteinaGKg: 2.2,
      grasaPct: 25,
    });
  });

  it('nunca devuelve un objeto compartido', () => {
    expect(parametrosIniciales({})).not.toBe(parametrosIniciales({}));
  });
});

describe('normalizarParametros (lo que viene de localStorage)', () => {
  it('conserva los parámetros válidos', () => {
    expect(normalizarParametros({ ...base })).toEqual(base);
  });

  it('descarta las claves desconocidas', () => {
    expect(normalizarParametros({ ...base, hack: '<script>' })).not.toHaveProperty('hack');
  });

  it('lo que falta o tiene un tipo raro vuelve al valor inicial', () => {
    const p = normalizarParametros({ sexo: 'Z', edad: { a: 1 }, peso: null, actividad: 'mucha', ajuste: undefined });
    expect(p).toMatchObject({
      sexo: 'M',
      edad: '',
      peso: '',
      actividad: 1.55,
      ajuste: 100,
      proteinaGKg: 2.2,
      grasaPct: 25,
    });
  });

  it('con algo que ni siquiera es un objeto devuelve los iniciales', () => {
    for (const dato of [null, undefined, 'x', 7, []])
      expect(normalizarParametros(dato)).toEqual(parametrosIniciales({}));
  });
});

describe('ACTIVIDADES', () => {
  it('son los cinco niveles del prototipo y el valor por defecto está entre ellos', () => {
    expect(ACTIVIDADES.map((a) => a.valor)).toEqual([1.2, 1.375, 1.55, 1.725, 1.9]);
    expect(ACTIVIDADES.some((a) => a.valor === parametrosIniciales({}).actividad)).toBe(true);
  });
});
