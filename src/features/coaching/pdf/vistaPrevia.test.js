import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abrirVistaPrevia } from './vistaPrevia.js';

const modal = () => document.getElementById('pdf-vista-previa');
const boton = (accion) => modal().querySelector(`[data-click="${accion}"]`);
const paginas = () => modal().querySelector('[data-paginas]');
const pdfDePrueba = () => new Blob(['%PDF-1.7 prueba'], { type: 'application/pdf' });
const esperar = () => new Promise((r) => setTimeout(r, 0));

/** Dibujante de prueba: agrega N "páginas" al contenedor (en la app lo hace pdf.js con canvas). */
const dibujarPaginasFalsas =
  (n = 3) =>
  async (blob, contenedor) => {
    contenedor.innerHTML = Array.from({ length: n }, (_, i) => `<div class="pagina">Página ${i + 1}</div>`).join('');
  };

let descargas;
beforeEach(() => {
  descargas = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:vista-previa');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  // Evita que el navegador simulado intente navegar: registra qué se abriría o descargaría
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
    descargas.push({ nombre: this.getAttribute('download'), href: this.href, target: this.target });
  });
});

afterEach(() => {
  document.body.innerHTML = '';
});

const abrir = (opciones = {}) =>
  abrirVistaPrevia({
    blob: pdfDePrueba(),
    nombreArchivo: 'plan.pdf',
    titulo: 'PDF de lineamientos',
    dibujarPaginas: dibujarPaginasFalsas(),
    ...opciones,
  });

describe('vista previa de PDF', () => {
  it('muestra el título y los botones Abrir, Descargar y Cerrar', async () => {
    await abrir();
    expect(modal().textContent).toContain('PDF de lineamientos');
    expect(boton('vistaPreviaAbrir')).not.toBeNull();
    expect(boton('vistaPreviaDescargar')).not.toBeNull();
    expect(boton('vistaPreviaCerrar')).not.toBeNull();
  });

  it('dibuja todas las páginas en una lista que se desplaza (también con el dedo en el celular)', async () => {
    await abrir({ dibujarPaginas: dibujarPaginasFalsas(4) });
    expect(paginas().querySelectorAll('.pagina')).toHaveLength(4);
    expect(paginas().className).toContain('overflow-y-auto');
  });

  it('mientras dibuja muestra "Cargando vista previa"', async () => {
    let terminar;
    const promesa = abrir({ dibujarPaginas: () => new Promise((r) => (terminar = r)) });
    await esperar();
    expect(paginas().textContent).toContain('Cargando vista previa');
    terminar();
    await promesa;
  });

  it('si no se puede dibujar, ofrece abrirlo o descargarlo y avisa por consola', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await abrir({
      dibujarPaginas: async () => {
        throw new Error('sin canvas');
      },
    });
    expect(paginas()).toBeNull();
    expect(modal().textContent).toContain('plan.pdf');
    expect(modal().textContent).toContain('No se pudo mostrar');
    expect(boton('vistaPreviaAbrir')).not.toBeNull();
    expect(error).toHaveBeenCalled();
  });

  it('"Descargar" baja el archivo con su nombre', async () => {
    await abrir({ nombreArchivo: 'entrenamiento-ana-2026-10-15.pdf' });
    boton('vistaPreviaDescargar').click();
    expect(descargas).toEqual([
      expect.objectContaining({ nombre: 'entrenamiento-ana-2026-10-15.pdf', href: 'blob:vista-previa' }),
    ]);
  });

  it('"Abrir" lo abre en una pestaña nueva (visor del navegador, con zoom)', async () => {
    await abrir();
    boton('vistaPreviaAbrir').click();
    expect(descargas).toEqual([expect.objectContaining({ nombre: null, target: '_blank', href: 'blob:vista-previa' })]);
  });

  it('"Cerrar" quita el modal y libera el PDF de la memoria', async () => {
    await abrir();
    boton('vistaPreviaCerrar').click();
    expect(modal()).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:vista-previa');
  });

  it('se cierra con Escape y tocando afuera del recuadro', async () => {
    await abrir();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(modal()).toBeNull();

    await abrir();
    modal().click(); // el fondo oscuro
    expect(modal()).toBeNull();
  });

  it('si se cierra antes de terminar de dibujar, no vuelve a aparecer', async () => {
    let terminar;
    const promesa = abrir({
      dibujarPaginas: (blob, contenedor) =>
        new Promise((r) => {
          terminar = () => {
            contenedor.innerHTML = '<div class="pagina"></div>';
            r();
          };
        }),
    });
    await esperar();
    boton('vistaPreviaCerrar').click();
    terminar();
    await promesa;
    expect(modal()).toBeNull();
  });

  it('abrir otra vista previa reemplaza la anterior (un solo modal)', async () => {
    await abrir({ titulo: 'Primero' });
    await abrir({ titulo: 'Segundo' });
    expect(document.querySelectorAll('#pdf-vista-previa')).toHaveLength(1);
    expect(modal().textContent).toContain('Segundo');
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it('el título se muestra como texto', async () => {
    await abrir({ titulo: '<img src=x>' });
    expect(modal().querySelector('img')).toBeNull();
  });
});
