// Piezas de los PDF de Prime Physique (definiciones de documento de pdfmake).
// Estilo tomado del PDF de nutrición del entrenador: encabezado con la marca, tarjeta gris
// con los datos del alumno, títulos rojos en mayúsculas, barras grises con borde rojo a la
// izquierda, tablas limpias y cajas de texto con borde rojo.

export const COLOR = {
  rojo: '#d31027',
  texto: '#111111',
  gris: '#555555',
  grisClaro: '#888888',
  fondoTarjeta: '#f7f7f7',
  fondoBarra: '#eeeeee',
  fondoCabecera: '#fafafa',
  borde: '#dddddd',
  linea: '#e5e5e5',
};

const ANCHO_UTIL = 515; // A4 (595 pt) menos márgenes de 40 pt a cada lado

/** Documento base: A4, tipografía, pie con número de página. */
export function documento(contenido) {
  return {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 50],
    defaultStyle: { fontSize: 10, color: COLOR.texto, lineHeight: 1.15 },
    footer: (pagina, total) => ({
      columns: [
        { text: 'Prime Physique', color: COLOR.grisClaro, fontSize: 8 },
        { text: `Página ${pagina} de ${total}`, alignment: 'right', color: COLOR.grisClaro, fontSize: 8 },
      ],
      margin: [40, 15, 40, 0],
    }),
    content: contenido,
  };
}

/** "PRIME PHYSIQUE" con las P en rojo, subtítulo, fecha a la derecha y línea roja. */
export function encabezado(fecha) {
  return [
    {
      columns: [
        {
          width: '*',
          stack: [
            {
              text: [{ text: 'P', color: COLOR.rojo }, 'RIME ', { text: 'P', color: COLOR.rojo }, 'HYSIQUE'],
              fontSize: 26,
              bold: true,
            },
            {
              text: 'PRIME PERFORMANCE REPORT',
              fontSize: 9,
              bold: true,
              color: COLOR.gris,
              characterSpacing: 1.5,
              margin: [0, 4, 0, 0],
            },
          ],
        },
        { width: 'auto', text: `Fecha: ${fecha}`, bold: true, color: COLOR.gris, fontSize: 10, margin: [0, 26, 0, 0] },
      ],
    },
    lineaHorizontal(COLOR.rojo, 1.2, [0, 10, 0, 16]),
  ];
}

export function lineaHorizontal(color, grosor, margin) {
  return {
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: ANCHO_UTIL, y2: 0, lineWidth: grosor, lineColor: color }],
    margin,
  };
}

/** Tarjeta gris con pares etiqueta/valor, en filas de hasta 2 columnas. */
export function tarjeta(campos) {
  const filas = [];
  for (let i = 0; i < campos.length; i += 2) {
    filas.push({
      columns: campos.slice(i, i + 2).map(([etiqueta, valor]) => ({
        width: '*',
        stack: [
          { text: etiqueta.toUpperCase(), fontSize: 8, color: COLOR.grisClaro, characterSpacing: 0.8 },
          { text: valor, fontSize: 12, bold: true, margin: [0, 2, 0, 0] },
        ],
      })),
      columnGap: 16,
      margin: [0, i ? 10 : 0, 0, 0],
    });
  }
  return {
    table: { widths: ['*'], body: [[{ stack: filas, margin: [12, 10, 12, 10] }]] },
    layout: {
      fillColor: () => COLOR.fondoTarjeta,
      hLineColor: () => COLOR.borde,
      vLineColor: () => COLOR.borde,
      hLineWidth: () => 0.8,
      vLineWidth: () => 0.8,
    },
    margin: [0, 0, 0, 6],
  };
}

/** Título de sección: rojo, mayúsculas, espaciado, con una línea gris debajo. */
export function tituloSeccion(texto, opciones = {}) {
  return {
    stack: [
      { text: texto.toUpperCase(), color: COLOR.rojo, bold: true, fontSize: 13, characterSpacing: 1.2 },
      lineaHorizontal(COLOR.linea, 0.8, [0, 4, 0, 8]),
    ],
    margin: [0, 16, 0, 0],
    ...opciones,
  };
}

const bordeRojoIzquierdo = (fondo) => ({
  fillColor: () => fondo,
  vLineWidth: (i) => (i === 0 ? 3 : 0),
  vLineColor: () => COLOR.rojo,
  hLineWidth: () => 0,
});

/** Barra gris con borde rojo a la izquierda (ej. "DÍA 1 — TORSO"). */
export function barra(texto) {
  return {
    table: {
      widths: ['*'],
      body: [[{ text: texto.toUpperCase(), bold: true, fontSize: 11, characterSpacing: 1, margin: [8, 5, 8, 5] }]],
    },
    layout: bordeRojoIzquierdo(COLOR.fondoBarra),
    margin: [0, 8, 0, 6],
  };
}

/** Caja con borde rojo a la izquierda, título rojo y texto (ej. "Lineamientos generales"). */
export function cajaTexto(titulo, texto) {
  return {
    table: {
      widths: ['*'],
      body: [
        [
          {
            stack: [
              { text: titulo.toUpperCase(), color: COLOR.rojo, bold: true, fontSize: 12, characterSpacing: 1.2 },
              { text: texto, margin: [0, 6, 0, 0] },
            ],
            margin: [12, 10, 12, 10],
          },
        ],
      ],
    },
    layout: bordeRojoIzquierdo(COLOR.fondoTarjeta),
    margin: [0, 16, 0, 0],
  };
}

/** Celda con el nombre en negrita y un detalle chico gris debajo (opcional). */
export function celdaNombre(nombre, detalle) {
  return {
    stack: [{ text: nombre, bold: true }, ...(detalle ? [{ text: detalle, fontSize: 8, color: COLOR.gris }] : [])],
  };
}

/** Celda de valor destacado: rojo, negrita, centrado. */
export const celdaValor = (texto) => ({ text: String(texto), color: COLOR.rojo, bold: true, alignment: 'center' });

/** Tabla con fila de encabezado gris claro y líneas finas entre filas. */
export function tabla(encabezados, filas, widths) {
  const cabecera = encabezados.map((t, i) => ({
    text: t,
    bold: true,
    color: COLOR.gris,
    fontSize: 9,
    alignment: i === 0 || i === 1 ? 'left' : 'center',
  }));
  return {
    table: { headerRows: 1, widths, body: [cabecera, ...filas] },
    layout: {
      fillColor: (fila) => (fila === 0 ? COLOR.fondoCabecera : null),
      hLineWidth: (i, nodo) => (i === 0 ? 0 : i === 1 || i === nodo.table.body.length ? 1 : 0.6),
      hLineColor: () => COLOR.linea,
      vLineWidth: () => 0,
      paddingTop: () => 6,
      paddingBottom: () => 6,
      paddingLeft: () => 6,
      paddingRight: () => 6,
    },
  };
}

/** Texto gris en itálica para secciones sin contenido. */
export const textoVacio = (texto) => ({ text: texto, italics: true, color: COLOR.grisClaro, margin: [0, 2, 0, 6] });
