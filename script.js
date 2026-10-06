
(function() {
  'use strict';
  
  //  CONSTANTES 
  const STORAGE_KEY = 'cv_data_backup_pro';
  const AUTO_SAVE_INTERVAL = 30000;
  const IMG_MAX_SIZE = 300;      // px (compresión)
  const IMG_QUALITY = 0.8;        // JPEG quality
  const DEBOUNCE_DELAY = 300;     // ms (búsqueda)
  
  let timeoutId = null;
  let hayCambiosSinGuardar = false;
  let cvActualId = null;
  let confirmCallback = null;
  let sortables = [];
  
  //  REFERENCIAS AL DOM 
  const getEl = (id) => document.getElementById(id);
  
  const nombreInput = getEl('nombreInput');
  const telefonoInput = getEl('telefonoInput');
  const emailInput = getEl('emailInput');
  const direccionInput = getEl('direccionInput');
  const nacionalidadInput = getEl('nacionalidadInput');
  const fechaNacInput = getEl('fechaNacInput');
  const resumenInput = getEl('resumenInput');
  const formacionAnio = getEl('formacionAnio');
  const formacionTitulo = getEl('formacionTitulo');
  const fotoInput = getEl('fotoInput');
  const cvActualLabel = getEl('cvActualLabel');
  
  const previewNombre = getEl('previewNombre');
  const previewContacto = getEl('previewContacto');
  const previewDireccion = getEl('previewDireccion');
  const previewEdad = getEl('previewEdad');
  const previewResumen = getEl('previewResumen');
  const previewFormacionAnio = getEl('previewFormacionAnio');
  const previewFormacionTitulo = getEl('previewFormacionTitulo');
  const previewExperienciasDiv = getEl('previewExperiencias');
  const previewIdiomasDiv = getEl('previewIdiomas');
  const previewHabilidadesDiv = getEl('previewHabilidades');
  const previewAptitudesDiv = getEl('previewAptitudes');
  const previewCertificacionesDiv = getEl('previewCertificaciones');
  const previewProyectosDiv = getEl('previewProyectos');
  const avatarInicial = getEl('avatarInicial');
  const avatarImg = getEl('avatarImg');
  const progresoFill = getEl('progressFill');
  const progresoPercent = getEl('progressPercent');
  
  const experienciasContainer = getEl('experienciasContainer');
  const idiomasContainer = getEl('idiomasContainer');
  const habilidadesContainer = getEl('habilidadesContainer');
  const aptitudesContainer = getEl('aptitudesContainer');
  const certificacionesContainer = getEl('certificacionesContainer');
  const proyectosContainer = getEl('proyectosContainer');
  
  const bgColorPicker = getEl('bgColorPicker');
  const textColorPicker = getEl('textColorPicker');
  const borderColorPicker = getEl('borderColorPicker');
  const cvCard = getEl('cv-content-for-pdf');
  
  //  UTILIDADES 
  function mostrarNotificacion(msg, tipo = 'success') {
    Toastify({
      text: msg, duration: 2500, gravity: 'top', position: 'right',
      backgroundColor: tipo === 'success' ? '#6366f1' : (tipo === 'warning' ? '#f59e0b' : '#ef4444'),
      close: true
    }).showToast();
  }
  
  function escapeHtml(text) {
    if (!text) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, m => map[m]);
  }
  
  function calcularEdad(fecha) {
    if (!fecha) return '';
    const hoy = new Date();
    const nac = new Date(fecha);
    let edad = hoy.getFullYear() - nac.getFullYear();
    const mes = hoy.getMonth() - nac.getMonth();
    if (mes < 0 || (mes === 0 && hoy.getDate() < nac.getDate())) edad--;
    return edad > 0 ? `${edad} años` : '';
  }
  
  function mostrarLoading(mostrar = true) {
    let overlay = document.querySelector('.loading-overlay');
    if (mostrar && !overlay) {
      overlay = document.createElement('div');
      overlay.className = 'loading-overlay';
      overlay.innerHTML = '<div class="loading-spinner"></div>';
      document.body.appendChild(overlay);
    } else if (!mostrar && overlay) {
      overlay.remove();
    }
  }
  
  function confirmar(titulo, mensaje, callback) {
    getEl('confirmTitle').textContent = titulo;
    getEl('confirmMessage').textContent = mensaje;
    confirmCallback = callback;
    new bootstrap.Modal(getEl('modalConfirm')).show();
  }
  
  //  MEJORA 4: Función debounce 
  function debounce(func, wait = 300) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }
  
  //  Compresión de imágenes con Canvas 
  function comprimirImagen(file, maxSize = 300, quality = 0.8) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let { width, height } = img;
          
          if (width > height) {
            if (width > maxSize) {
              height = Math.round((height * maxSize) / width);
              width = maxSize;
            }
          } else {
            if (height > maxSize) {
              width = Math.round((width * maxSize) / height);
              height = maxSize;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          
          const base64Comprimido = canvas.toDataURL('image/jpeg', quality);
          console.log(`🖼️ Imagen comprimida: ${width}x${height} (${Math.round(base64Comprimido.length / 1024)} KB)`);
          resolve(base64Comprimido);
        };
        img.onerror = () => reject(new Error('Error al cargar imagen'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('Error al leer archivo'));
      reader.readAsDataURL(file);
    });
  }
  
  // Convertir Base64 a Uint8Array (para ImageRun de docx)
  function base64ToUint8Array(base64) {
    const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }
  
  //  VALIDACIÓN 
  function validarCamposObligatorios() {
    const errores = [];
    if (!nombreInput.value.trim()) errores.push('Nombre completo');
    if (!telefonoInput.value.trim()) errores.push('Teléfono');
    if (!emailInput.value.trim()) {
      errores.push('Correo electrónico');
    } else if (!/^[^\s@]+@([^\s@]+\.)+[^\s@]+$/.test(emailInput.value.trim())) {
      errores.push('Correo electrónico (formato inválido)');
    }
    
    if (errores.length > 0) {
      mostrarNotificacion('⚠️ Campos requeridos: ' + errores.join(', '), 'error');
      [nombreInput, telefonoInput, emailInput].forEach(el => {
        if (!el.value.trim()) {
          el.classList.add('is-invalid');
          setTimeout(() => el.classList.remove('is-invalid'), 3000);
        }
      });
      return false;
    }
    
    [nombreInput, telefonoInput, emailInput].forEach(el => el.classList.remove('is-invalid'));
    return true;
  }
  
  //  CREAR ELEMENTOS DINÁMICOS 
  //   Focus automático 
  function focusFirstInput(container) {
    setTimeout(() => {
      const firstInput = container.querySelector('input, textarea, select');
      if (firstInput) {
        firstInput.focus();
        container.classList.add('newly-added');
        setTimeout(() => container.classList.remove('newly-added'), 600);
      }
    }, 50);
  }
  
  function crearIdiomaItem(data = { idioma: '', nivel: 'Nativo' }) {
    const div = document.createElement('div');
    div.className = 'd-flex gap-2 mb-2 idioma-item align-items-center';
    div.innerHTML = `
      <i class="fas fa-grip-vertical drag-handle" aria-hidden="true" title="Arrastrar para reordenar"></i>
      <input type="text" class="form-control" placeholder="Idioma" style="flex:2" value="${escapeHtml(data.idioma)}" aria-label="Idioma">
      <select class="form-select" style="flex:1" aria-label="Nivel del idioma">
        <option ${data.nivel === 'Nativo' ? 'selected' : ''}>Nativo</option>
        <option ${data.nivel === 'Avanzado' ? 'selected' : ''}>Avanzado</option>
        <option ${data.nivel === 'Intermedio' ? 'selected' : ''}>Intermedio</option>
        <option ${data.nivel === 'Básico' ? 'selected' : ''}>Básico</option>
      </select>
      <button class="btn btn-sm btn-outline-danger rounded-pill remove-idioma" aria-label="Eliminar este idioma" title="Eliminar idioma">✖</button>
    `;
    div.querySelector('.remove-idioma').addEventListener('click', () => {
      div.remove(); actualizarPreview(); marcarCambios();
    });
    return div;
  }
  
  function crearHabilidadItem(data = { nombre: '', nivel: 75 }) {
    const div = document.createElement('div');
    div.className = 'skill-item d-flex align-items-center gap-2 mb-2 habilidad-item';
    div.innerHTML = `
      <i class="fas fa-grip-vertical drag-handle" aria-hidden="true" title="Arrastrar para reordenar"></i>
      <input type="text" class="form-control" placeholder="Habilidad" style="width:40%" value="${escapeHtml(data.nombre)}" aria-label="Nombre de la habilidad">
      <input type="range" class="form-range" min="0" max="100" value="${data.nivel}" style="flex:1" aria-label="Nivel de la habilidad">
      <span class="skill-value fw-semibold" style="width:45px">${data.nivel}%</span>
      <button class="btn btn-sm btn-outline-danger rounded-pill remove-habilidad" aria-label="Eliminar esta habilidad" title="Eliminar habilidad">✖</button>
    `;
    const slider = div.querySelector('input[type="range"]');
    const valueSpan = div.querySelector('.skill-value');
    slider.addEventListener('input', () => {
      valueSpan.textContent = slider.value + '%';
      actualizarPreview(); marcarCambios();
    });
    div.querySelector('.remove-habilidad').addEventListener('click', () => {
      div.remove(); actualizarPreview(); marcarCambios();
    });
    return div;
  }
  
  function crearAptitudItem(texto) {
    const div = document.createElement('div');
    div.className = 'aptitud-item d-flex align-items-center gap-2';
    div.innerHTML = `
      <i class="fas fa-grip-vertical drag-handle" aria-hidden="true" title="Arrastrar para reordenar"></i>
      <span>${escapeHtml(texto)}</span>
      <button class="remove-aptitud btn btn-link text-danger p-0 ms-2" aria-label="Eliminar aptitud ${escapeHtml(texto)}" title="Eliminar aptitud">✖</button>
    `;
    div.querySelector('.remove-aptitud').addEventListener('click', () => {
      div.remove(); actualizarPreview(); marcarCambios();
    });
    return div;
  }
  
  function crearCertificacionItem(data = { nombre: '', anio: '' }) {
    const div = document.createElement('div');
    div.className = 'd-flex gap-2 mb-2 certificacion-item align-items-center';
    div.innerHTML = `
      <i class="fas fa-grip-vertical drag-handle" aria-hidden="true" title="Arrastrar para reordenar"></i>
      <input type="text" class="form-control" placeholder="Certificación" style="flex:2" value="${escapeHtml(data.nombre)}" aria-label="Nombre de la certificación">
      <input type="text" class="form-control" placeholder="Año" style="flex:1" value="${escapeHtml(data.anio)}" aria-label="Año de la certificación">
      <button class="btn btn-sm btn-outline-danger rounded-pill remove-certificacion" aria-label="Eliminar esta certificación" title="Eliminar certificación">✖</button>
    `;
    div.querySelector('.remove-certificacion').addEventListener('click', () => {
      div.remove(); actualizarPreview(); marcarCambios();
    });
    return div;
  }
  
  function crearProyectoItem(data = { nombre: '', descripcion: '' }) {
    const div = document.createElement('div');
    div.className = 'd-flex gap-2 mb-2 proyecto-item align-items-start';
    div.innerHTML = `
      <i class="fas fa-grip-vertical drag-handle mt-3" aria-hidden="true" title="Arrastrar para reordenar"></i>
      <input type="text" class="form-control" placeholder="Proyecto" style="flex:2" value="${escapeHtml(data.nombre)}" aria-label="Nombre del proyecto">
      <textarea class="form-control" placeholder="Descripción" rows="1" style="flex:3" aria-label="Descripción del proyecto">${escapeHtml(data.descripcion)}</textarea>
      <button class="btn btn-sm btn-outline-danger rounded-pill remove-proyecto" aria-label="Eliminar este proyecto" title="Eliminar proyecto">✖</button>
    `;
    div.querySelector('.remove-proyecto').addEventListener('click', () => {
      div.remove(); actualizarPreview(); marcarCambios();
    });
    return div;
  }
  
  function crearExperienciaItem(data = { fecha: '', cargo: '', empresa: '', desc: '' }) {
    const div = document.createElement('div');
    div.className = 'experiencia-item bg-light rounded-4 p-3 mb-3';
    div.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-2">
        <i class="fas fa-grip-vertical drag-handle" aria-hidden="true" title="Arrastrar para reordenar"></i>
        <div class="d-flex gap-2">
          <button class="btn btn-sm btn-outline-secondary rounded-pill clone-experiencia" aria-label="Duplicar esta experiencia" title="Duplicar">
            <i class="fas fa-copy" aria-hidden="true"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger rounded-pill remove-experiencia" aria-label="Eliminar esta experiencia" title="Eliminar">✖</button>
        </div>
      </div>
      <div class="mb-2"><input type="text" class="form-control exp-fecha" placeholder="Fecha (ej: 01/2020 - presente)" value="${escapeHtml(data.fecha)}" aria-label="Fecha de la experiencia"></div>
      <div class="mb-2"><input type="text" class="form-control exp-cargo" placeholder="Cargo" value="${escapeHtml(data.cargo)}" aria-label="Cargo"></div>
      <div class="mb-2"><input type="text" class="form-control exp-empresa" placeholder="Empresa" value="${escapeHtml(data.empresa)}" aria-label="Empresa"></div>
      <textarea class="form-control exp-desc" rows="2" placeholder="Descripción de responsabilidades" aria-label="Descripción de responsabilidades">${escapeHtml(data.desc)}</textarea>
    `;
    div.querySelector('.clone-experiencia').addEventListener('click', () => {
      const clone = crearExperienciaItem({
        fecha: div.querySelector('.exp-fecha').value,
        cargo: div.querySelector('.exp-cargo').value,
        empresa: div.querySelector('.exp-empresa').value,
        desc: div.querySelector('.exp-desc').value
      });
      experienciasContainer.appendChild(clone);
      actualizarPreview(); marcarCambios();
      mostrarNotificacion('Experiencia duplicada', 'success');
    });
    div.querySelector('.remove-experiencia').addEventListener('click', () => {
      div.remove(); actualizarPreview(); marcarCambios();
    });
    return div;
  }
  
  //  ACTUALIZAR PREVIEW 
  function actualizarPreview() {
    const nom = nombreInput.value.trim();
    const tel = telefonoInput.value.trim();
    const email = emailInput.value.trim();
    const dir = direccionInput.value.trim();
    const nac = nacionalidadInput.value.trim();
    const fecha = fechaNacInput.value;
    const fechaFormateada = fecha ? fecha.split('-').reverse().join('/') : '';
    
    previewNombre.textContent = nom || '';
    previewContacto.textContent = tel || email ? `📞 ${tel} · 📧 ${email}` : '';
    previewDireccion.textContent = (dir || nac || fechaFormateada)
      ? `📍 ${dir}${dir && nac ? ' · ' : ''}${nac}${(dir || nac) && fechaFormateada ? ' · ' : ''}${fechaFormateada ? `Nac: ${fechaFormateada}` : ''}` : '';
    previewEdad.textContent = calcularEdad(fecha) ? `🎂 ${calcularEdad(fecha)}` : '';
    previewResumen.textContent = resumenInput.value.trim() || '';
    previewFormacionAnio.textContent = formacionAnio.value.trim() || '';
    previewFormacionTitulo.textContent = formacionTitulo.value.trim() || '';
    
    let aptHtml = '';
    document.querySelectorAll('#aptitudesContainer .aptitud-item').forEach(el => {
      const span = el.querySelector('span');
      const texto = span ? span.textContent.trim() : '';
      if (texto) aptHtml += `<span class="badge bg-light text-dark rounded-pill p-2">${escapeHtml(texto)}</span>`;
    });
    previewAptitudesDiv.innerHTML = aptHtml;
    
    let idiomasHtml = '';
    document.querySelectorAll('#idiomasContainer .idioma-item').forEach(item => {
      const idioma = item.querySelector('input')?.value.trim() || '';
      const nivel = item.querySelector('select')?.value || '';
      if (idioma) idiomasHtml += `<div class="mb-1"><strong>${escapeHtml(idioma)}</strong> - ${nivel}</div>`;
    });
    previewIdiomasDiv.innerHTML = idiomasHtml;
    
    let habHtml = '';
    document.querySelectorAll('#habilidadesContainer .habilidad-item').forEach(item => {
      const hab = item.querySelector('input[type="text"]')?.value.trim() || '';
      const val = item.querySelector('input[type="range"]')?.value || 0;
      if (hab) {
        habHtml += `
          <div class="mb-3 avoid-break">
            <div class="d-flex justify-content-between mb-1">
              <span class="fw-semibold">${escapeHtml(hab)}</span>
              <span class="text-primary">${val}%</span>
            </div>
            <div class="progress" style="height: 8px;">
              <div class="progress-bar" style="width: ${val}%; background: linear-gradient(90deg, #6366f1, #8b5cf6); border-radius: 20px;"></div>
            </div>
          </div>`;
      }
    });
    previewHabilidadesDiv.innerHTML = habHtml;
    
    let certHtml = '';
    document.querySelectorAll('#certificacionesContainer .certificacion-item').forEach(item => {
      const nombre = item.querySelector('input:first-of-type')?.value.trim() || '';
      const anio = item.querySelector('input:last-of-type')?.value.trim() || '';
      if (nombre) certHtml += `<div class="mb-1"><strong>${escapeHtml(nombre)}</strong> ${anio ? `(${escapeHtml(anio)})` : ''}</div>`;
    });
    previewCertificacionesDiv.innerHTML = certHtml;
    
    let proyHtml = '';
    document.querySelectorAll('#proyectosContainer .proyecto-item').forEach(item => {
      const nombre = item.querySelector('input')?.value.trim() || '';
      const desc = item.querySelector('textarea')?.value.trim() || '';
      if (nombre) proyHtml += `<div class="mb-2"><strong>${escapeHtml(nombre)}</strong><br><small class="text-muted">${escapeHtml(desc)}</small></div>`;
    });
    previewProyectosDiv.innerHTML = proyHtml;
    
    let expHtml = '';
    document.querySelectorAll('#experienciasContainer .experiencia-item').forEach(item => {
      const fecha = item.querySelector('.exp-fecha')?.value.trim() || '';
      const cargo = item.querySelector('.exp-cargo')?.value.trim() || '';
      const empresa = item.querySelector('.exp-empresa')?.value.trim() || '';
      const desc = item.querySelector('.exp-desc')?.value.trim() || '';
      if (fecha || cargo || empresa || desc) {
        expHtml += `
          <div class="mb-3 pb-2 border-bottom avoid-break">
            <h5 class="fw-bold mb-1">${escapeHtml(cargo)}${empresa ? ` · ${escapeHtml(empresa)}` : ''}</h5>
            ${fecha ? `<p class="text-muted small mb-2">${escapeHtml(fecha)}</p>` : ''}
            ${desc ? `<p>${escapeHtml(desc)}</p>` : ''}
          </div>`;
      }
    });
    previewExperienciasDiv.innerHTML = expHtml;
    
    let camposLlenos = 0;
    if (nom) camposLlenos++;
    if (tel) camposLlenos++;
    if (email) camposLlenos++;
    if (resumenInput.value.trim()) camposLlenos++;
    const percent = Math.min(camposLlenos * 20, 98);
    progresoFill.style.width = percent + '%';
    progresoPercent.textContent = percent + '%';
    
    if (nom) {
      const iniciales = nom.split(' ').filter(p => p).map(p => p[0]).join('').substring(0, 2).toUpperCase();
      avatarInicial.textContent = iniciales;
    } else {
      avatarInicial.textContent = '';
    }
    
    actualizarRequisitos();
  }
  
  function actualizarRequisitos() {
    const nombre = nombreInput.value.trim();
    const telefono = telefonoInput.value.trim();
    const email = emailInput.value.trim();
    const resumen = resumenInput.value.trim();
    let tieneExp = false;
    document.querySelectorAll('#experienciasContainer .experiencia-item').forEach(exp => {
      if (exp.querySelector('.exp-cargo')?.value.trim() || exp.querySelector('.exp-empresa')?.value.trim()) tieneExp = true;
    });
    
    const reqs = [
      { id: 'nombre', cond: nombre !== '' },
      { id: 'telefono', cond: telefono !== '' },
      { id: 'email', cond: email !== '' },
      { id: 'resumen', cond: resumen !== '' },
      { id: 'experiencia', cond: tieneExp }
    ];
    
    reqs.forEach(req => {
      const el = document.querySelector(`.requisito-item[data-req="${req.id}"]`);
      if (el) {
        const icon = el.querySelector('i');
        if (req.cond) {
          el.classList.add('checked');
          icon.className = 'fas fa-check-circle text-success';
        } else {
          el.classList.remove('checked');
          icon.className = 'far fa-circle';
        }
      }
    });
  }
  
  function actualizarPreviewDebounced() {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(actualizarPreview, 200);
  }
  
  function marcarCambios() { hayCambiosSinGuardar = true; }
  
  //  RECOLECTAR / APLICAR DATOS 
  function recolectarDatosCV() {
    return {
      nombre: nombreInput.value,
      telefono: telefonoInput.value,
      email: emailInput.value,
      direccion: direccionInput.value,
      nacionalidad: nacionalidadInput.value,
      fechaNac: fechaNacInput.value,
      resumen: resumenInput.value,
      formacionAnio: formacionAnio.value,
      formacionTitulo: formacionTitulo.value,
      foto: avatarImg.src && avatarImg.style.display !== 'none' ? avatarImg.src : null,
      idiomas: Array.from(document.querySelectorAll('#idiomasContainer .idioma-item')).map(item => ({
        idioma: item.querySelector('input[type="text"]')?.value || '',
        nivel: item.querySelector('select')?.value || 'Nativo'
      })),
      habilidades: Array.from(document.querySelectorAll('#habilidadesContainer .habilidad-item')).map(item => ({
        nombre: item.querySelector('input[type="text"]')?.value || '',
        nivel: parseInt(item.querySelector('input[type="range"]')?.value) || 0
      })),
      aptitudes: Array.from(document.querySelectorAll('#aptitudesContainer .aptitud-item')).map(item => {
        const span = item.querySelector('span');
        return (span ? span.textContent : '').trim();
      }).filter(a => a),
      certificaciones: Array.from(document.querySelectorAll('#certificacionesContainer .certificacion-item')).map(item => ({
        nombre: item.querySelector('input:first-of-type')?.value || '',
        anio: item.querySelector('input:last-of-type')?.value || ''
      })),
      proyectos: Array.from(document.querySelectorAll('#proyectosContainer .proyecto-item')).map(item => ({
        nombre: item.querySelector('input')?.value || '',
        descripcion: item.querySelector('textarea')?.value || ''
      })),
      experiencias: Array.from(document.querySelectorAll('#experienciasContainer .experiencia-item')).map(item => ({
        fecha: item.querySelector('.exp-fecha')?.value || '',
        cargo: item.querySelector('.exp-cargo')?.value || '',
        empresa: item.querySelector('.exp-empresa')?.value || '',
        desc: item.querySelector('.exp-desc')?.value || ''
      }))
    };
  }
  
  function aplicarDatosCV(data) {
    nombreInput.value = data.nombre || '';
    telefonoInput.value = data.telefono || '';
    emailInput.value = data.email || '';
    direccionInput.value = data.direccion || '';
    nacionalidadInput.value = data.nacionalidad || '';
    fechaNacInput.value = data.fechaNac || '';
    resumenInput.value = data.resumen || '';
    formacionAnio.value = data.formacionAnio || '';
    formacionTitulo.value = data.formacionTitulo || '';
    
    if (data.foto) {
      avatarImg.src = data.foto;
      avatarImg.style.display = 'block';
      avatarInicial.style.display = 'none';
    } else {
      avatarImg.style.display = 'none';
      avatarInicial.style.display = 'block';
    }
    
    idiomasContainer.innerHTML = '';
    (data.idiomas || []).forEach(i => idiomasContainer.appendChild(crearIdiomaItem(i)));
    if (!data.idiomas || data.idiomas.length === 0) idiomasContainer.appendChild(crearIdiomaItem());
    
    habilidadesContainer.innerHTML = '';
    (data.habilidades || []).forEach(h => habilidadesContainer.appendChild(crearHabilidadItem(h)));
    if (!data.habilidades || data.habilidades.length === 0) habilidadesContainer.appendChild(crearHabilidadItem());
    
    aptitudesContainer.innerHTML = '';
    (data.aptitudes || []).forEach(a => aptitudesContainer.appendChild(crearAptitudItem(a)));
    
    certificacionesContainer.innerHTML = '';
    (data.certificaciones || []).forEach(c => certificacionesContainer.appendChild(crearCertificacionItem(c)));
    
    proyectosContainer.innerHTML = '';
    (data.proyectos || []).forEach(p => proyectosContainer.appendChild(crearProyectoItem(p)));
    
    experienciasContainer.innerHTML = '';
    (data.experiencias || []).forEach(e => experienciasContainer.appendChild(crearExperienciaItem(e)));
    if (!data.experiencias || data.experiencias.length === 0) experienciasContainer.appendChild(crearExperienciaItem());
    
    actualizarPreview();
  }
  
  //  GUARDAR / CARGAR 
  function guardarLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(recolectarDatosCV()));
      hayCambiosSinGuardar = false;
    } catch (e) {
      console.error('Error al guardar en localStorage:', e);
    }
  }
  
  function cargarLocal() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return false;
    try {
      aplicarDatosCV(JSON.parse(saved));
      return true;
    } catch (e) {
      console.error('Error al cargar localStorage:', e);
      return false;
    }
  }
  
  //  BASE DE DATOS 
  async function guardarEnBD() {
    if (!validarCamposObligatorios()) return;
    
    mostrarLoading(true);
    try {
      const datos = recolectarDatosCV();
      
      if (cvActualId) {
        await CVDatabase.actualizar(cvActualId, datos);
        mostrarNotificacion('💾 CV actualizado en BD', 'success');
      } else {
        const resultado = await CVDatabase.guardar(datos);
        cvActualId = resultado.id;
        cvActualLabel.textContent = `CV #${resultado.id} - ${datos.nombre || 'Sin nombre'}`;
        mostrarNotificacion('💾 CV guardado en BD (ID: ' + resultado.id + ')', 'success');
      }
      hayCambiosSinGuardar = false;
      guardarLocal();
    } catch (error) {
      console.error(error);
      mostrarNotificacion('Error al guardar en BD', 'error');
    } finally {
      mostrarLoading(false);
    }
  }
  
  async function mostrarMisCVs() {
    mostrarLoading(true);
    try {
      const cvs = await CVDatabase.listar();
      renderizarListaCVs(cvs);
      new bootstrap.Modal(getEl('modalMisCVs')).show();
    } catch (error) {
      console.error(error);
      mostrarNotificacion('Error al cargar la lista', 'error');
    } finally {
      mostrarLoading(false);
    }
  }
  
  function renderizarListaCVs(cvs) {
    const contenedor = getEl('listaCVsContainer');
    
    if (cvs.length === 0) {
      contenedor.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-folder-open" aria-hidden="true"></i>
          <p>No tienes CVs guardados todavía</p>
          <small class="text-muted">Usa el botón "Guardar BD" para guardar tu primer CV</small>
        </div>`;
      return;
    }
    
    contenedor.innerHTML = cvs.map(cv => {
      const esActivo = cvActualId === cv.id;
      return `
      <div class="card cv-card ${esActivo ? 'cv-activo' : ''}" data-id="${cv.id}">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
            <div class="flex-grow-1">
              <h5 class="mb-1">
                ${escapeHtml(cv.nombre || 'Sin nombre')}
                ${esActivo ? '<span class="badge bg-success ms-2">Editando</span>' : ''}
              </h5>
              <p class="text-muted small mb-1">
                <i class="fas fa-envelope me-1" aria-hidden="true"></i>${escapeHtml(cv.email || 'Sin email')}
              </p>
              <p class="text-muted small mb-0">
                <i class="fas fa-clock me-1" aria-hidden="true"></i>
                ${new Date(cv.fechaModificacion || cv.fechaCreacion).toLocaleString()}
              </p>
            </div>
            <div class="d-flex gap-2">
              <button class="btn btn-sm btn-primary-custom cargar-cv-btn" data-id="${cv.id}" 
                      aria-label="Cargar CV ${escapeHtml(cv.nombre)}" title="Cargar">
                <i class="fas fa-upload" aria-hidden="true"></i>
              </button>
              <button class="btn btn-sm btn-outline-danger rounded-pill eliminar-cv-btn" data-id="${cv.id}" 
                      aria-label="Eliminar CV ${escapeHtml(cv.nombre)}" title="Eliminar">
                <i class="fas fa-trash" aria-hidden="true"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    `}).join('');
    
    contenedor.querySelectorAll('.cargar-cv-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.id);
        try {
          const cv = await CVDatabase.obtener(id);
          if (cv) {
            aplicarDatosCV(cv);
            cvActualId = id;
            cvActualLabel.textContent = `CV #${id} - ${cv.nombre || 'Sin nombre'}`;
            bootstrap.Modal.getInstance(getEl('modalMisCVs')).hide();
            initSortables();
            mostrarNotificacion('📂 CV cargado correctamente', 'success');
          }
        } catch (error) {
          console.error(error);
          mostrarNotificacion('Error al cargar CV', 'error');
        }
      });
    });
    
    contenedor.querySelectorAll('.eliminar-cv-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id);
        confirmar('¿Eliminar CV?', 'Esta acción no se puede deshacer.', async () => {
          try {
            await CVDatabase.eliminar(id);
            if (cvActualId === id) {
              cvActualId = null;
              cvActualLabel.textContent = 'Nuevo CV';
            }
            const cvsActualizados = await CVDatabase.listar();
            renderizarListaCVs(cvsActualizados);
            mostrarNotificacion('🗑️ CV eliminado', 'success');
          } catch (error) {
            console.error(error);
            mostrarNotificacion('Error al eliminar', 'error');
          }
        });
      });
    });
  }
  
  //  NUEVO CV 
  function nuevoCV() {
    const ejecutar = () => {
      limpiarFormulario();
      cvActualId = null;
      cvActualLabel.textContent = 'Nuevo CV';
      mostrarNotificacion('📄 Nuevo CV creado', 'success');
    };
    
    if (hayCambiosSinGuardar) {
      confirmar('¿Crear nuevo CV?', 'Tienes cambios sin guardar. ¿Deseas continuar?', ejecutar);
    } else {
      ejecutar();
    }
  }
  
  function limpiarFormulario() {
    document.querySelectorAll('input, textarea, select').forEach(el => {
      if (el.type !== 'color' && el.type !== 'file' && el.type !== 'range') el.value = '';
    });
    
    avatarImg.style.display = 'none';
    avatarInicial.style.display = 'block';
    avatarImg.src = '';
    
    aptitudesContainer.innerHTML = '';
    experienciasContainer.innerHTML = '';
    idiomasContainer.innerHTML = '';
    habilidadesContainer.innerHTML = '';
    certificacionesContainer.innerHTML = '';
    proyectosContainer.innerHTML = '';
    
    aptitudesContainer.appendChild(crearAptitudItem('Liderazgo'));
    aptitudesContainer.appendChild(crearAptitudItem('Comunicación'));
    experienciasContainer.appendChild(crearExperienciaItem());
    idiomasContainer.appendChild(crearIdiomaItem());
    habilidadesContainer.appendChild(crearHabilidadItem());
    
    initSortables();
    actualizarPreview();
    hayCambiosSinGuardar = false;
  }
  
  //  IMPORTAR / EXPORTAR JSON 
  function exportarJSON() {
    const data = {
      fechaExportacion: new Date().toISOString(),
      version: '2.0',
      cv: recolectarDatosCV()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const nombre = (nombreInput.value || 'Mi_CV').replace(/\s+/g, '_');
    saveAs(blob, `CV_${nombre}_${Date.now()}.json`);
    mostrarNotificacion('💾 JSON exportado', 'success');
  }
  
  function importarJSON(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        const cvData = parsed.cv || parsed;
        aplicarDatosCV(cvData);
        cvActualId = null;
        cvActualLabel.textContent = 'CV Importado';
        initSortables();
        mostrarNotificacion('📥 JSON importado correctamente', 'success');
      } catch (error) {
        console.error(error);
        mostrarNotificacion('Archivo JSON inválido', 'error');
      }
    };
    reader.readAsText(file);
  }
  
  //  EXPORTAR A WORD 
  function exportarWord() {
    if (!validarCamposObligatorios()) return;
    
    if (typeof docx === 'undefined') {
      mostrarNotificacion('Error: librería Word no cargada', 'error');
      return;
    }
    
    mostrarLoading(true);
    
    try {
      const { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle, ImageRun } = docx;
      const children = [];
      
      const colorDinamico = borderColorPicker.value.replace('#', '').toUpperCase();
      
      if (avatarImg.src && avatarImg.style.display !== 'none' && avatarImg.src.startsWith('data:')) {
        try {
          const imageBytes = base64ToUint8Array(avatarImg.src);
          children.push(new Paragraph({
            children: [new ImageRun({
              data: imageBytes,
              transformation: { width: 100, height: 100 }
            })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 }
          }));
        } catch (e) {
          console.warn('No se pudo insertar la foto en Word:', e);
        }
      }
      
      children.push(new Paragraph({
        children: [new TextRun({ text: nombreInput.value || 'CV', bold: true, size: 48, color: colorDinamico })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 }
      }));
      
      const contacto = [];
      if (telefonoInput.value.trim()) contacto.push(`Tel: ${telefonoInput.value.trim()}`);
      if (emailInput.value.trim()) contacto.push(`Email: ${emailInput.value.trim()}`);
      if (contacto.length) {
        children.push(new Paragraph({
          children: [new TextRun({ text: contacto.join('  |  '), size: 22 })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 }
        }));
      }
      
      const extras = [];
      if (direccionInput.value.trim()) extras.push(direccionInput.value.trim());
      if (nacionalidadInput.value.trim()) extras.push(nacionalidadInput.value.trim());
      if (fechaNacInput.value) extras.push(`Nacimiento: ${fechaNacInput.value}`);
      if (extras.length) {
        children.push(new Paragraph({
          children: [new TextRun({ text: extras.join('  |  '), size: 20, color: '666666' })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 300 }
        }));
      }
      
      const agregarSeccion = (titulo) => {
        children.push(new Paragraph({
          children: [new TextRun({ text: titulo, bold: true, size: 28, color: colorDinamico })],
          spacing: { before: 300, after: 150 },
          border: { bottom: { color: colorDinamico, space: 1, style: BorderStyle.SINGLE, size: 6 } }
        }));
      };
      
      if (resumenInput.value.trim()) {
        agregarSeccion('RESUMEN PROFESIONAL');
        children.push(new Paragraph({
          children: [new TextRun({ text: resumenInput.value.trim(), size: 22 })],
          spacing: { after: 200 }
        }));
      }
      
      if (formacionAnio.value.trim() || formacionTitulo.value.trim()) {
        agregarSeccion('FORMACIÓN');
        if (formacionAnio.value.trim()) {
          children.push(new Paragraph({
            children: [new TextRun({ text: formacionAnio.value.trim(), bold: true, size: 22 })]
          }));
        }
        if (formacionTitulo.value.trim()) {
          children.push(new Paragraph({
            children: [new TextRun({ text: formacionTitulo.value.trim(), size: 22 })],
            spacing: { after: 200 }
          }));
        }
      }
      
      const aptitudes = Array.from(document.querySelectorAll('#aptitudesContainer .aptitud-item'))
        .map(item => (item.querySelector('span')?.textContent || '').trim())
        .filter(t => t);
      if (aptitudes.length) {
        agregarSeccion('APTITUDES');
        children.push(new Paragraph({
          children: [new TextRun({ text: '• ' + aptitudes.join('  •  '), size: 22 })],
          spacing: { after: 200 }
        }));
      }
      
      const idiomas = [];
      document.querySelectorAll('#idiomasContainer .idioma-item').forEach(item => {
        const idioma = item.querySelector('input')?.value.trim();
        const nivel = item.querySelector('select')?.value;
        if (idioma) idiomas.push(`${idioma} (${nivel})`);
      });
      if (idiomas.length) {
        agregarSeccion('IDIOMAS');
        idiomas.forEach(i => {
          children.push(new Paragraph({ children: [new TextRun({ text: '• ' + i, size: 22 })] }));
        });
      }
      
      const habilidades = [];
      document.querySelectorAll('#habilidadesContainer .habilidad-item').forEach(item => {
        const hab = item.querySelector('input[type="text"]')?.value.trim();
        const nivel = item.querySelector('input[type="range"]')?.value;
        if (hab) habilidades.push(`${hab} - ${nivel}%`);
      });
      if (habilidades.length) {
        agregarSeccion('HABILIDADES TÉCNICAS');
        habilidades.forEach(h => {
          children.push(new Paragraph({ children: [new TextRun({ text: '• ' + h, size: 22 })] }));
        });
      }
      
      const certificaciones = [];
      document.querySelectorAll('#certificacionesContainer .certificacion-item').forEach(item => {
        const nombre = item.querySelector('input:first-of-type')?.value.trim();
        const anio = item.querySelector('input:last-of-type')?.value.trim();
        if (nombre) certificaciones.push(anio ? `${nombre} (${anio})` : nombre);
      });
      if (certificaciones.length) {
        agregarSeccion('CERTIFICACIONES');
        certificaciones.forEach(c => {
          children.push(new Paragraph({ children: [new TextRun({ text: '• ' + c, size: 22 })] }));
        });
      }
      
      const proyectos = [];
      document.querySelectorAll('#proyectosContainer .proyecto-item').forEach(item => {
        const nombre = item.querySelector('input')?.value.trim();
        const desc = item.querySelector('textarea')?.value.trim();
        if (nombre) proyectos.push({ nombre, desc });
      });
      if (proyectos.length) {
        agregarSeccion('PROYECTOS DESTACADOS');
        proyectos.forEach(p => {
          children.push(new Paragraph({
            children: [new TextRun({ text: p.nombre, bold: true, size: 22 })]
          }));
          if (p.desc) {
            children.push(new Paragraph({
              children: [new TextRun({ text: p.desc, size: 20, color: '555555' })],
              spacing: { after: 100 }
            }));
          }
        });
      }
      
      const experiencias = [];
      document.querySelectorAll('#experienciasContainer .experiencia-item').forEach(item => {
        const fecha = item.querySelector('.exp-fecha')?.value.trim();
        const cargo = item.querySelector('.exp-cargo')?.value.trim();
        const empresa = item.querySelector('.exp-empresa')?.value.trim();
        const desc = item.querySelector('.exp-desc')?.value.trim();
        if (cargo || empresa || desc) experiencias.push({ fecha, cargo, empresa, desc });
      });
      if (experiencias.length) {
        agregarSeccion('EXPERIENCIA LABORAL');
        experiencias.forEach(e => {
          const titulo = [e.cargo, e.empresa].filter(Boolean).join(' · ');
          children.push(new Paragraph({
            children: [new TextRun({ text: titulo, bold: true, size: 22 })],
            spacing: { before: 100 }
          }));
          if (e.fecha) {
            children.push(new Paragraph({
              children: [new TextRun({ text: e.fecha, italics: true, size: 20, color: '666666' })]
            }));
          }
          if (e.desc) {
            children.push(new Paragraph({
              children: [new TextRun({ text: e.desc, size: 22 })],
              spacing: { after: 150 }
            }));
          }
        });
      }
      
      const doc = new Document({
        sections: [{
          properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
          children
        }]
      });
      
      Packer.toBlob(doc).then(blob => {
        saveAs(blob, `CV_${(nombreInput.value || 'Mi_CV').replace(/\s+/g, '_')}.docx`);
        mostrarNotificacion('📄 Word (.docx) generado correctamente', 'success');
      }).finally(() => mostrarLoading(false));
      
    } catch (error) {
      console.error(error);
      mostrarLoading(false);
      mostrarNotificacion('Error al generar Word', 'error');
    }
  }
  
  //  GENERAR PDF 
  function generarPDF() {
    if (!validarCamposObligatorios()) return;
    
    actualizarPreview();
    const element = cvCard;
    const nombre = (previewNombre.textContent || 'CV').replace(/\s+/g, '_');
    const btn = getEl('generarPdfBtn');
    const original = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-pulse" aria-hidden="true"></i> Generando...';
    btn.disabled = true;
    
    const opt = {
      margin: [0.4, 0.4, 0.4, 0.4],
      filename: `CV_${nombre}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true },
      jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'], avoid: '.avoid-break' }
    };
    
    html2pdf().from(element).set(opt).save()
      .then(() => mostrarNotificacion('📄 PDF generado correctamente', 'success'))
      .catch(err => {
        console.error(err);
        mostrarNotificacion('Error al generar PDF', 'error');
      })
      .finally(() => {
        btn.innerHTML = original;
        btn.disabled = false;
      });
  }
  
  //  IMPRIMIR 
  function imprimirCV() {
    actualizarPreview();
    const contenido = cvCard.cloneNode(true);
    const ventana = window.open('', '_blank');
    ventana.document.write(`
      <!DOCTYPE html><html><head><meta charset="UTF-8"><title>CV</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .avoid-break { page-break-inside: avoid; }
        .progress-bar { background: #6366f1 !important; }
      </style>
      </head><body>${contenido.innerHTML}</body></html>
    `);
    ventana.document.close();
    setTimeout(() => ventana.print(), 500);
  }
  
  //  COLORES Y PLANTILLAS 
  function resetColores() {
    bgColorPicker.value = '#ffffff';
    textColorPicker.value = '#000000';
    borderColorPicker.value = '#6366f1';
    cvCard.style.backgroundColor = '#ffffff';
    cvCard.style.color = '#000000';
    cvCard.style.borderColor = '#6366f1';
    mostrarNotificacion('🎨 Colores restaurados', 'success');
  }
  
  function aplicarPlantilla(tipo) {
    cvCard.style.borderRadius = '24px';
    cvCard.style.border = '1px solid #e2e8f0';
    cvCard.style.boxShadow = 'none';
    cvCard.style.fontWeight = 'normal';
    cvCard.style.backgroundColor = bgColorPicker.value;
    
    switch (tipo) {
      case 'modern':
        cvCard.style.borderRadius = '24px 8px 24px 8px';
        cvCard.style.boxShadow = '0 20px 25px -5px rgba(0,0,0,0.1)';
        break;
      case 'minimal':
        cvCard.style.borderRadius = '8px';
        cvCard.style.border = '2px solid #e2e8f0';
        break;
      case 'elegant':
        cvCard.style.fontFamily = "'Playfair Display', serif";
        cvCard.style.borderRadius = '20px 0 20px 0';
        cvCard.style.border = '2px solid #cbd5e1';
        break;
      case 'corp':
        cvCard.style.borderRadius = '12px';
        cvCard.style.border = '3px solid #6366f1';
        break;
      case 'bold':
        cvCard.style.borderRadius = '40px 8px 40px 8px';
        cvCard.style.fontWeight = '700';
        cvCard.style.border = '4px solid #1e293b';
        break;
      case 'pastel':
        cvCard.style.borderRadius = '40px';
        cvCard.style.fontFamily = "'Lato', sans-serif";
        cvCard.style.border = '2px solid #fbcfe8';
        cvCard.style.backgroundColor = '#fdf2f8';
        break;
    }
  }
  
  //  CARGAR EJEMPLO 
  function cargarEjemplo() {
    aplicarDatosCV({
      nombre: 'Ana María Rodríguez García',
      telefono: '612 345 678',
      email: 'ana.rodriguez@email.com',
      direccion: 'Av. Principal 123, Madrid',
      nacionalidad: 'Española',
      fechaNac: '1985-06-15',
      resumen: 'Directora ejecutiva de operaciones con más de 12 años de experiencia liderando equipos multidisciplinarios. Especialista en transformación digital y optimización de procesos.',
      formacionAnio: '2010 · Universidad Complutense de Madrid',
      formacionTitulo: 'MBA en Dirección de Empresas',
      idiomas: [
        { idioma: 'Español', nivel: 'Nativo' },
        { idioma: 'Inglés', nivel: 'Avanzado' },
        { idioma: 'Francés', nivel: 'Intermedio' }
      ],
      habilidades: [
        { nombre: 'Liderazgo', nivel: 95 },
        { nombre: 'Gestión de equipos', nivel: 90 },
        { nombre: 'Transformación digital', nivel: 85 }
      ],
      aptitudes: ['Liderazgo', 'Comunicación', 'Trabajo en equipo', 'Pensamiento estratégico'],
      certificaciones: [
        { nombre: 'Scrum Master', anio: '2020' },
        { nombre: 'PMP', anio: '2019' }
      ],
      proyectos: [
        { nombre: 'Transformación digital 2023', descripcion: 'Lideré la migración completa a la nube' }
      ],
      experiencias: [
        {
          fecha: '01/2018 - presente',
          cargo: 'Directora de Operaciones',
          empresa: 'Tech Solutions S.L.',
          desc: 'Gestión de 5 departamentos y 120 empleados. Reduje costos operativos en un 25% y aumenté la productividad un 40%.'
        },
        {
          fecha: '06/2012 - 12/2017',
          cargo: 'Gerente de Proyectos',
          empresa: 'Consulting Group',
          desc: 'Dirección de proyectos de transformación digital para clientes Fortune 500.'
        }
      ]
    });
    cvActualId = null;
    cvActualLabel.textContent = 'CV de Ejemplo';
    initSortables();
    mostrarNotificacion('📋 CV de ejemplo cargado', 'success');
  }
  
  //  MEJORA 3: Inicializar Sortable 
  function initSortables() {
    sortables.forEach(s => {
      try { s.destroy(); } catch (e) {}
    });
    sortables = [];
    
    if (typeof Sortable === 'undefined') {
      console.warn('SortableJS no está cargado');
      return;
    }
    
    const config = {
      animation: 200,
      handle: '.drag-handle',
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      dragClass: 'sortable-drag',
      onEnd: () => {
        actualizarPreview();
        marcarCambios();
      }
    };
    
    const containers = [
      experienciasContainer,
      aptitudesContainer,
      habilidadesContainer,
      idiomasContainer,
      certificacionesContainer,
      proyectosContainer
    ];
    
    containers.forEach(container => {
      if (container) {
        try {
          sortables.push(new Sortable(container, config));
        } catch (e) {
          console.warn('Error al inicializar Sortable:', e);
        }
      }
    });
    
    console.log('✅ Drag & Drop inicializado en', sortables.length, 'contenedores');
  }
  
  //  EVENTOS 
  function init() {
    getEl('btnEmpezar').addEventListener('click', () => {
      getEl('welcomeScreen').classList.add('hide');
      setTimeout(() => {
        getEl('welcomeScreen').style.display = 'none';
        getEl('mainContent').style.display = 'block';
      }, 500);
    });
    getEl('btnCargarEjemplo').addEventListener('click', cargarEjemplo);
    
    // MEJORA 1: Foto con compresión
    fotoInput.addEventListener('change', async function(e) {
      const file = e.target.files[0];
      if (!file) return;
      
      if (file.size > 2 * 1024 * 1024) {
        mostrarNotificacion('La imagen debe pesar menos de 2MB', 'error');
        return;
      }
      
      mostrarLoading(true);
      try {
        const base64Comprimido = await comprimirImagen(file, IMG_MAX_SIZE, IMG_QUALITY);
        avatarImg.src = base64Comprimido;
        avatarImg.style.display = 'block';
        avatarInicial.style.display = 'none';
        marcarCambios();
        mostrarNotificacion('🖼️ Foto comprimida y cargada', 'success');
      } catch (error) {
        console.error(error);
        mostrarNotificacion('Error al procesar la imagen', 'error');
      } finally {
        mostrarLoading(false);
      }
    });
    
    // Focus automático
    getEl('agregarIdiomaBtn').addEventListener('click', () => {
      const nuevo = crearIdiomaItem();
      idiomasContainer.appendChild(nuevo);
      actualizarPreview(); marcarCambios();
      focusFirstInput(nuevo);
    });
    
    getEl('agregarHabilidadBtn').addEventListener('click', () => {
      const nuevo = crearHabilidadItem();
      habilidadesContainer.appendChild(nuevo);
      actualizarPreview(); marcarCambios();
      focusFirstInput(nuevo);
    });
    
    getEl('agregarAptitudBtn').addEventListener('click', () => {
      const txt = getEl('nuevaAptitud').value.trim();
      if (!txt) { mostrarNotificacion('Escribe una aptitud', 'error'); return; }
      aptitudesContainer.appendChild(crearAptitudItem(txt));
      getEl('nuevaAptitud').value = '';
      actualizarPreview(); marcarCambios();
      getEl('nuevaAptitud').focus();
    });
    
    getEl('nuevaAptitud').addEventListener('keypress', e => {
      if (e.key === 'Enter') getEl('agregarAptitudBtn').click();
    });
    
    getEl('agregarCertificacionBtn').addEventListener('click', () => {
      const nuevo = crearCertificacionItem();
      certificacionesContainer.appendChild(nuevo);
      actualizarPreview(); marcarCambios();
      focusFirstInput(nuevo);
    });
    
    getEl('agregarProyectoBtn').addEventListener('click', () => {
      const nuevo = crearProyectoItem();
      proyectosContainer.appendChild(nuevo);
      actualizarPreview(); marcarCambios();
      focusFirstInput(nuevo);
    });
    
    getEl('agregarExperienciaBtn').addEventListener('click', () => {
      const nuevo = crearExperienciaItem();
      experienciasContainer.appendChild(nuevo);
      actualizarPreview(); marcarCambios();
      focusFirstInput(nuevo);
    });
    
    getEl('btnLimpiar').addEventListener('click', () => {
      confirmar('¿Limpiar campos?', 'Se borrarán todos los datos actuales.', () => {
        limpiarFormulario();
        mostrarNotificacion('🗑️ Campos limpiados', 'success');
      });
    });
    
    getEl('btnNuevoCV').addEventListener('click', nuevoCV);
    getEl('btnGuardarBD').addEventListener('click', guardarEnBD);
    getEl('btnMisCVs').addEventListener('click', mostrarMisCVs);
    getEl('btnResetColores').addEventListener('click', resetColores);
    
    getEl('btnExportarJson').addEventListener('click', exportarJSON);
    getEl('btnImportarJson').addEventListener('click', () => {
      getEl('inputImportarJson').click();
    });
    getEl('inputImportarJson').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) importarJSON(file);
      e.target.value = '';
    });
    
    getEl('btnExportarWord').addEventListener('click', exportarWord);
    getEl('generarPdfBtn').addEventListener('click', generarPDF);
    getEl('btnImprimir').addEventListener('click', imprimirCV);
    
    bgColorPicker.addEventListener('input', e => cvCard.style.backgroundColor = e.target.value);
    textColorPicker.addEventListener('input', e => cvCard.style.color = e.target.value);
    borderColorPicker.addEventListener('input', e => cvCard.style.borderColor = e.target.value);
    
    document.querySelectorAll('.font-option').forEach(opt => {
      opt.addEventListener('click', function() {
        document.querySelectorAll('.font-option').forEach(o => o.classList.remove('active'));
        this.classList.add('active');
        cvCard.style.fontFamily = `'${this.dataset.font}', sans-serif`;
      });
    });
    
    document.querySelectorAll('.template-option').forEach(opt => {
      opt.addEventListener('click', function() {
        document.querySelectorAll('.template-option').forEach(o => o.classList.remove('active'));
        this.classList.add('active');
        aplicarPlantilla(this.dataset.template);
      });
    });
    
    // Debounce en la búsqueda
    const buscarInput = getEl('buscarCVInput');
    if (buscarInput) {
      buscarInput.addEventListener('input', debounce(async (e) => {
        const termino = e.target.value;
        try {
          const cvs = await CVDatabase.buscar(termino);
          renderizarListaCVs(cvs);
        } catch (error) {
          console.error(error);
        }
      }, DEBOUNCE_DELAY));
    }
    
    getEl('btnBorrarTodoBD').addEventListener('click', () => {
      confirmar('¿Borrar TODOS los CVs?', 'Esta acción eliminará todos los CVs guardados permanentemente.', async () => {
        try {
          await CVDatabase.limpiarTodo();
          const cvs = await CVDatabase.listar();
          renderizarListaCVs(cvs);
          cvActualId = null;
          cvActualLabel.textContent = 'Nuevo CV';
          mostrarNotificacion('🗑️ Todos los CVs eliminados', 'success');
        } catch (error) {
          console.error(error);
          mostrarNotificacion('Error al borrar', 'error');
        }
      });
    });
    
    getEl('confirmBtn').addEventListener('click', () => {
      if (confirmCallback) confirmCallback();
      bootstrap.Modal.getInstance(getEl('modalConfirm')).hide();
      confirmCallback = null;
    });
    
    const inputs = [nombreInput, telefonoInput, emailInput, direccionInput, nacionalidadInput,
                    fechaNacInput, resumenInput, formacionAnio, formacionTitulo];
    inputs.forEach(el => el?.addEventListener('input', () => { actualizarPreviewDebounced(); marcarCambios(); }));
    
    [experienciasContainer, idiomasContainer, habilidadesContainer,
     certificacionesContainer, proyectosContainer].forEach(c => {
      c.addEventListener('input', () => { actualizarPreviewDebounced(); marcarCambios(); });
    });
    
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        guardarEnBD();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        nuevoCV();
      }
    });
    
    window.addEventListener('beforeunload', e => {
      if (hayCambiosSinGuardar) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
    
    setInterval(() => { if (hayCambiosSinGuardar) guardarLocal(); }, AUTO_SAVE_INTERVAL);
    
    CVDatabase.init().then(() => {
      console.log('✅ Base de datos lista para usar');
      CVDatabase.contar().then(count => {
        if (count > 0) {
          mostrarNotificacion(`📁 Tienes ${count} CV(s) guardado(s)`, 'success');
        }
      });
    }).catch(err => {
      console.error('❌ Error BD:', err);
      mostrarNotificacion('Error al iniciar la base de datos', 'error');
    });
    
    aptitudesContainer.appendChild(crearAptitudItem('Liderazgo'));
    aptitudesContainer.appendChild(crearAptitudItem('Comunicación'));
    experienciasContainer.appendChild(crearExperienciaItem());
    idiomasContainer.appendChild(crearIdiomaItem());
    habilidadesContainer.appendChild(crearHabilidadItem());
    
    initSortables();
    
    if (localStorage.getItem(STORAGE_KEY)) {
      if (confirm('¿Deseas cargar el borrador guardado anteriormente?')) {
        cargarLocal();
        initSortables();
      }
    }
    
    actualizarPreview();
    aplicarPlantilla('modern');
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
})();