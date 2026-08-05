// Renderizado dinámico de secciones
function switchTab(tab) {
  const content = document.getElementById('app-content');
  
  if (tab === 'perfil') {
    content.innerHTML = `
      <div class="space-y-6">
        <h2 class="text-2xl font-bold text-red-500">Mi Perfil & Evolución</h2>
        
        <!-- Datos Personales -->
        <div class="bg-gray-900 p-4 rounded-xl border border-gray-800">
          <h3 class="font-semibold text-lg mb-2">Datos Personales</h3>
          <p class="text-sm text-gray-400">Email: <span id="user-email" class="text-white">usuario@mail.com</span></p>
          <button class="mt-3 text-xs bg-gray-800 hover:bg-gray-700 text-white px-3 py-1.5 rounded-lg border border-gray-700">Modificar Contraseña</button>
        </div>

        <!-- Registro de Registro de Evolución -->
        <div class="bg-gray-900 p-4 rounded-xl border border-gray-800">
          <h3 class="font-semibold text-lg mb-4">Registrar Progreso</h3>
          <form id="evolution-form" class="grid grid-cols-2 gap-3 text-sm">
            <div>
              <label class="block text-gray-400">Peso (kg)</label>
              <input type="number" step="0.1" class="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white" required />
            </div>
            <div>
              <label class="block text-gray-400">Sentadilla (kg)</label>
              <input type="number" class="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white" />
            </div>
            <div>
              <label class="block text-gray-400">Banco Plano (kg)</label>
              <input type="number" class="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white" />
            </div>
            <div>
              <label class="block text-gray-400">Peso Muerto (kg)</label>
              <input type="number" class="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white" />
            </div>
            <div class="col-span-2 mt-2">
              <button type="submit" class="w-full bg-red-600 hover:bg-red-700 font-semibold py-2 rounded-lg transition">Guardar Registro</button>
            </div>
          </form>
        </div>
      </div>
    `;
  } else if (tab === 'entrenamiento') {
    content.innerHTML = `
      <div class="space-y-6">
        <!-- BOTÓN GIGANTE A PLANILLA -->
        <a href="https://docs.google.com/spreadsheets/d/TU_SHEET_ID" target="_blank" 
           class="block w-full text-center bg-red-600 hover:bg-red-700 text-white font-black text-xl py-5 rounded-2xl shadow-lg transition transform active:scale-95 border-2 border-red-500">
           <i class="fa-solid fa-file-excel mr-2"></i> ABRIR PLANILLA
        </a>

        <!-- 5 Bloques de Entrada en Calor / Anotaciones -->
        <h3 class="font-bold text-xl text-gray-200">Bloques de Entrada en Calor</h3>
        <div class="space-y-3">
          ${[1, 2, 3, 4, 5].map(i => `
            <div class="bg-gray-900 p-4 rounded-xl border border-gray-800">
              <h4 class="font-bold text-red-400 mb-2">Día ${i} - Calentamiento</h4>
              <textarea placeholder="Anotaciones de ejercicios, series y repeticiones..." class="w-full bg-gray-800 border border-gray-700 rounded p-2 text-sm text-gray-200 h-20"></textarea>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } else if (tab === 'alimentacion') {
    content.innerHTML = `
      <div class="space-y-6">
        <h2 class="text-2xl font-bold text-red-500">Plan de Alimentación</h2>
        
        <!-- Plan Personal PDF -->
        <div class="bg-gray-900 p-4 rounded-xl border border-gray-800 text-center">
          <i class="fa-solid fa-file-pdf text-4xl text-red-500 mb-2"></i>
          <h3 class="font-semibold text-lg">Tu Plan Personalizado</h3>
          <a href="#" class="inline-block mt-3 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium px-4 py-2 rounded-lg border border-gray-700">Ver / Descargar PDF</a>
        </div>

        <!-- Archivos Precargados de Educación -->
        <div class="bg-gray-900 p-4 rounded-xl border border-gray-800">
          <h3 class="font-semibold text-lg mb-3">Guías de Nutrición Precargadas</h3>
          <ul class="space-y-2 text-sm text-gray-300">
            <li class="flex justify-between items-center bg-gray-800 p-2 rounded">
              <span>Guía de Proteínas y Macronutrientes</span>
              <a href="#" class="text-red-400 hover:underline"><i class="fa-solid fa-download"></i></a>
            </li>
            <li class="flex justify-between items-center bg-gray-800 p-2 rounded">
              <span>Estrategias de Suplementación</span>
              <a href="#" class="text-red-400 hover:underline"><i class="fa-solid fa-download"></i></a>
            </li>
          </ul>
        </div>
      </div>
    `;
  } else if (tab === 'videoteca') {
    content.innerHTML = `
      <div class="space-y-6">
        <h2 class="text-2xl font-bold text-red-500">Videoteca de Ejercicios</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- Video Card -->
          <div class="bg-gray-900 rounded-xl overflow-hidden border border-gray-800">
            <div class="aspect-video bg-gray-800 flex items-center justify-center">
              <iframe class="w-full h-full" src="https://www.youtube.com/embed/dQw4w9WgXcQ" frameborder="0" allowfullscreen></iframe>
            </div>
            <div class="p-3">
              <h4 class="font-bold text-sm">Técnica de Sentadilla Trasera</h4>
              <p class="text-xs text-gray-400 mt-1">Puntos clave de apoyo y profundidad.</p>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

// Cargar pestaña por defecto al iniciar
switchTab('perfil');