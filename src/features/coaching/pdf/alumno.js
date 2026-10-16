// Cómo se nombra al alumno en los PDF (contenido, título y nombre del archivo).

/**
 * El nombre del alumno o, si no tiene (vacío o solo espacios), su correo; "Alumno" si no hay ninguno.
 * @param {{ name?: string | null, email?: string | null }} alumno
 */
export function nombreDelAlumno(alumno) {
  return alumno.name?.trim() || alumno.email?.trim() || 'Alumno';
}
