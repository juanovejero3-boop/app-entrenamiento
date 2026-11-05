// PDF del plan de alimentación para el alumno: sus objetivos del día, las comidas por horario con los alimentos y
// cantidades de cada opción, el total del día y las aclaraciones del coach. Es la misma información que ve en la app.
import { nombreDelAlumno } from '../coaching/pdf/alumno.js';
import {
  barra,
  COLOR,
  cajaTexto,
  celdaNombre,
  documento,
  encabezado,
  tabla,
  tarjeta,
  textoVacio,
  tituloSeccion,
} from '../coaching/pdf/documento.js';
import { cantidadParaMostrar, macrosDeItem, macrosDelDia, ordenadasPorHora } from './comidas.js';
import { calcularObjetivos } from './objetivos.js';

const numero = (n) => ({ text: String(Math.round(n)), alignment: 'center' });

const opcionesConAlimentos = (comida) =>
  comida.opciones.map((opcion, i) => ({ opcion, numero: i + 1 })).filter(({ opcion }) => opcion.items.length);

function tablaDeOpcion(opcion) {
  const filas = opcion.items.map((item) => {
    const m = macrosDeItem(item);
    return [
      celdaNombre(item.nombre),
      { text: cantidadParaMostrar(item.porcion, item.porciones), bold: true, color: COLOR.rojo },
      numero(m.p),
      numero(m.c),
      numero(m.f),
      numero(m.kcal),
    ];
  });
  return tabla(['Alimento', 'Cantidad', 'P', 'C', 'G', 'kcal'], filas, ['*', 110, 30, 30, 30, 40]);
}

function bloqueDeComida(comida) {
  const opciones = opcionesConAlimentos(comida);
  const titulo = comida.hora ? `${comida.hora} — ${comida.nombre}` : comida.nombre;
  const varias = opciones.length > 1;
  return [
    barra(titulo),
    ...opciones.flatMap(({ opcion, numero: n }) => [
      ...(varias ? [{ text: `Opción ${n}`, bold: true, color: COLOR.gris, fontSize: 9, margin: [0, 2, 0, 4] }] : []),
      tablaDeOpcion(opcion),
      { text: '', margin: [0, 0, 0, 6] },
    ]),
  ];
}

/**
 * @param {{ parametros: object, comidas: import('./comidas.js').Comida[], notas: string }} plan
 * @param {{ name?: string, email?: string }} alumno
 * @param {{ fecha: string }} opciones  fecha de emisión (AAAA-MM-DD)
 */
export function docPlanDeAlimentacion(plan, alumno, { fecha }) {
  const objetivos = calcularObjetivos(plan.parametros);
  const comidas = ordenadasPorHora(plan.comidas).filter((c) => opcionesConAlimentos(c).length);

  const campos = [['Alumno', nombreDelAlumno(alumno)]];
  if (objetivos) {
    campos.push(
      ['Objetivo diario', `${objetivos.kcal} kcal`],
      ['Proteína', `${objetivos.p} g`],
      ['Carbohidratos', `${objetivos.c} g`],
      ['Grasas', `${objetivos.f} g`],
    );
  }
  const contenido = [...encabezado(fecha), tarjeta(campos), tituloSeccion('Plan de alimentación')];

  if (!comidas.length) {
    contenido.push(textoVacio('Este plan todavía no tiene comidas cargadas.'));
  } else {
    contenido.push(...comidas.flatMap(bloqueDeComida));
    const total = macrosDelDia(comidas);
    const hayVarias = comidas.some((c) => opcionesConAlimentos(c).length > 1);
    contenido.push({
      text: [
        { text: 'TOTAL DEL DÍA  ', bold: true, color: COLOR.rojo },
        { text: `${total.kcal} kcal · P ${total.p} g · C ${total.c} g · G ${total.f} g`, bold: true },
        ...(hayVarias ? [{ text: '  (con la opción 1 de cada comida)', color: COLOR.grisClaro, fontSize: 8 }] : []),
      ],
      margin: [0, 10, 0, 0],
    });
  }

  if (plan.notas.trim()) contenido.push(cajaTexto('Aclaraciones', plan.notas.trim()));
  return documento(contenido, `Plan de alimentación · ${nombreDelAlumno(alumno)}`);
}
