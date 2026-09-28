/* ================================================================
 *  BASE DE DATOS LOCAL - IndexedDB
 *  Módulo para gestionar múltiples CVs con estructura JSON
 * ================================================================ */

const CVDatabase = (function() {
  'use strict';
  
  const DB_NAME = 'CVProDB';
  const DB_VERSION = 1;
  const STORE_NAME = 'curriculums';
  let db = null;
  let isReady = false;
  
  // ========== INICIALIZAR LA BASE DE DATOS ==========
  function init() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject('Tu navegador no soporta IndexedDB');
        return;
      }
      
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = () => {
        console.error('❌ Error al abrir IndexedDB:', request.error);
        reject(request.error);
      };
      
      request.onsuccess = () => {
        db = request.result;
        isReady = true;
        console.log('✅ Base de datos lista');
        resolve(db);
      };
      
      request.onupgradeneeded = (event) => {
        const database = event.target.result;
        console.log('🔧 Creando estructura de BD...');
        
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, {
            keyPath: 'id',
            autoIncrement: true
          });
          
          store.createIndex('nombre', 'nombre', { unique: false });
          store.createIndex('email', 'email', { unique: false });
          store.createIndex('fechaModificacion', 'fechaModificacion', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          
          console.log('✅ Estructura de BD creada');
        }
      };
    });
  }
  
  // ========== GUARDAR NUEVO CV ==========
  function guardar(cvData) {
    return new Promise((resolve, reject) => {
      if (!isReady) { reject('BD no inicializada'); return; }
      
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      const data = {
        ...cvData,
        fechaCreacion: new Date().toISOString(),
        fechaModificacion: new Date().toISOString(),
        timestamp: Date.now()
      };
      
      const request = store.add(data);
      
      request.onsuccess = () => {
        console.log('💾 CV guardado con ID:', request.result);
        resolve({ id: request.result, ...data });
      };
      
      request.onerror = () => {
        console.error('❌ Error al guardar:', request.error);
        reject(request.error);
      };
    });
  }
  
  // ========== LISTAR TODOS LOS CVs ==========
  function listar() {
    return new Promise((resolve, reject) => {
      if (!isReady) { reject('BD no inicializada'); return; }
      
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      
      request.onsuccess = () => {
        const cvs = request.result.sort((a, b) => {
          const fechaA = new Date(a.fechaModificacion || a.fechaCreacion).getTime();
          const fechaB = new Date(b.fechaModificacion || b.fechaCreacion).getTime();
          return fechaB - fechaA;
        });
        resolve(cvs);
      };
      
      request.onerror = () => reject(request.error);
    });
  }
  
  // ========== OBTENER UN CV POR ID ==========
  function obtener(id) {
    return new Promise((resolve, reject) => {
      if (!isReady) { reject('BD no inicializada'); return; }
      
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  
  // ========== ACTUALIZAR CV EXISTENTE ==========
  function actualizar(id, cvData) {
    return new Promise((resolve, reject) => {
      if (!isReady) { reject('BD no inicializada'); return; }
      
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      const data = {
        ...cvData,
        id: id,
        fechaModificacion: new Date().toISOString(),
        timestamp: Date.now()
      };
      
      const request = store.put(data);
      
      request.onsuccess = () => {
        console.log('✏️ CV actualizado ID:', id);
        resolve(data);
      };
      
      request.onerror = () => reject(request.error);
    });
  }
  
  // ========== ELIMINAR CV ==========
  function eliminar(id) {
    return new Promise((resolve, reject) => {
      if (!isReady) { reject('BD no inicializada'); return; }
      
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);
      
      request.onsuccess = () => {
        console.log('🗑️ CV eliminado ID:', id);
        resolve();
      };
      
      request.onerror = () => reject(request.error);
    });
  }
  
  // ========== BUSCAR POR NOMBRE O EMAIL ==========
  function buscar(termino) {
    return new Promise((resolve, reject) => {
      if (!isReady) { reject('BD no inicializada'); return; }
      
      listar().then(cvs => {
        const terminoLower = termino.toLowerCase().trim();
        if (!terminoLower) { resolve(cvs); return; }
        
        const filtrados = cvs.filter(cv =>
          (cv.nombre || '').toLowerCase().includes(terminoLower) ||
          (cv.email || '').toLowerCase().includes(terminoLower)
        );
        resolve(filtrados);
      }).catch(reject);
    });
  }
  
  // ========== CONTAR CVs ==========
  function contar() {
    return new Promise((resolve, reject) => {
      if (!isReady) { reject('BD no inicializada'); return; }
      
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.count();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  
  // ========== LIMPIAR TODA LA BASE DE DATOS ==========
  function limpiarTodo() {
    return new Promise((resolve, reject) => {
      if (!isReady) { reject('BD no inicializada'); return; }
      
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();
      
      request.onsuccess = () => {
        console.log('🗑️ Base de datos limpiada');
        resolve();
      };
      
      request.onerror = () => reject(request.error);
    });
  }
  
  // ========== API PÚBLICA ==========
  return {
    init,
    guardar,
    listar,
    obtener,
    actualizar,
    eliminar,
    buscar,
    contar,
    limpiarTodo,
    isReady: () => isReady
  };
})();