import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abrirVistaPrevia } from './vistaPrevia.js';

const modal = () => document.getElementById('pdf-vista-previa');
const boton = (accion) => modal().querySelector(`[data-click="${accion}"]`);
const pdfDePrueba = () => new Blob(['%PDF-1.7 prueba'], { type: 'application/pdf' });

let descargas;
beforeEach(() => {
  descargas = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:vista-previa');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  // Evita que el navegador simulado intente navegar: registra qué se descargaría
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
    descargas.push({ nombre: this.getAttribute('download'), href: this.href, target: this.target });
  });
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('vista previa de PDF', () => {
  it('muestra el PDF en un visor con el título y los botones Descargar y Cerrar', () => {
    abrirVistaPrevia({
      blob: pdfDePrueba(),
      nombreArchivo: 'plan.pdf',
      titulo: 'PDF de lineamientos',
      verEnLinea: true,
    });

    expect(modal()).not.toBeNull();
    expect(modal().textContent).toContain('PDF de lineamientos');
    const visor = modal().querySelector('object');
    expect(visor.getAttribute('type')).toBe('application/pdf');
    expect(visor.getAttribute('data')).toBe('blob:vista-previa');
    expect(boton('vistaPreviaDescargar')).not.toBeNull();
    expect(boton('vistaPreviaCerrar')).not.toBeNull();
  });

  it('"Descargar" baja el archivo con su nombre', () => {
    abrirVistaPrevia({
      blob: pdfDePrueba(),
      nombreArchivo: 'entrenamiento-ana-2026-10-15.pdf',
      titulo: 'X',
      verEnLinea: true,
    });

    boton('vistaPreviaDescargar').click();

    expect(descargas).toEqual([
      expect.objectContaining({ nombre: 'entrenamiento-ana-2026-10-15.pdf', href: 'blob:vista-previa' }),
    ]);
  });

  it('si el navegador no muestra PDF embebidos (celular), ofrece Abrir y Descargar en vez del visor', () => {
    abrirVistaPrevia({ blob: pdfDePrueba(), nombreArchivo: 'plan.pdf', titulo: 'X', verEnLinea: false });

    expect(modal().querySelector('object')).toBeNull();
    expect(modal().textContent).toContain('plan.pdf');
    boton('vistaPreviaAbrir').click();
    expect(descargas).toEqual([expect.objectContaining({ nombre: null, target: '_blank', href: 'blob:vista-previa' })]);
    expect(boton('vistaPreviaDescargar')).not.toBeNull();
  });

  it('"Cerrar" quita el modal y libera el PDF de la memoria', () => {
    abrirVistaPrevia({ blob: pdfDePrueba(), nombreArchivo: 'plan.pdf', titulo: 'X', verEnLinea: true });

    boton('vistaPreviaCerrar').click();

    expect(modal()).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:vista-previa');
  });

  it('se cierra con Escape y tocando afuera del recuadro', () => {
    abrirVistaPrevia({ blob: pdfDePrueba(), nombreArchivo: 'plan.pdf', titulo: 'X', verEnLinea: true });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(modal()).toBeNull();

    abrirVistaPrevia({ blob: pdfDePrueba(), nombreArchivo: 'plan.pdf', titulo: 'X', verEnLinea: true });
    modal().click(); // el fondo oscuro
    expect(modal()).toBeNull();
  });

  it('abrir otra vista previa reemplaza la anterior (un solo modal)', () => {
    abrirVistaPrevia({ blob: pdfDePrueba(), nombreArchivo: 'a.pdf', titulo: 'Primero', verEnLinea: true });
    abrirVistaPrevia({ blob: pdfDePrueba(), nombreArchivo: 'b.pdf', titulo: 'Segundo', verEnLinea: true });

    expect(document.querySelectorAll('#pdf-vista-previa')).toHaveLength(1);
    expect(modal().textContent).toContain('Segundo');
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it('el título se muestra como texto', () => {
    abrirVistaPrevia({ blob: pdfDePrueba(), nombreArchivo: 'x.pdf', titulo: '<img src=x>', verEnLinea: true });
    expect(modal().querySelector('img')).toBeNull();
  });
});
