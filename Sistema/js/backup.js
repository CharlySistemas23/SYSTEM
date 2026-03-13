// Sistema de Backups Automáticos
// Realiza backups cada 5 minutos automáticamente

const BackupManager = {
    intervalId: null,
    isRunning: false,
    backupInterval: 5 * 60 * 1000, // 5 minutos en milisegundos
    maxBackups: 50, // Mantener máximo 50 backups
    backupDirectoryHandle: null, // Handle del directorio de backups (File System Access API)
    backupDirectoryPath: null, // Ruta del directorio (para mostrar en UI)
    
    async init() {
        if (this.isRunning) return;
        
        // Cargar directorio de backups guardado
        await this.loadBackupDirectory();
        
        // Realizar primer backup inmediatamente
        await this.createBackup();
        
        // Configurar intervalo para backups automáticos
        this.intervalId = setInterval(async () => {
            await this.createBackup();
        }, this.backupInterval);
        
            this.isRunning = true;
            console.log('Sistema de backups automáticos iniciado (cada 5 minutos)');
        
        // Limpiar backups antiguos
        this.cleanOldBackups();
    },
    
    // Verificar si File System Access API está disponible
    isFileSystemAccessAvailable() {
        return 'showDirectoryPicker' in window;
    },
    
    // Cargar el directorio de backups desde localStorage e IndexedDB
    async loadBackupDirectory() {
        try {
            if (!this.isFileSystemAccessAvailable()) {
                console.log('File System Access API no está disponible en este navegador');
                return;
            }
            
            // Intentar cargar desde IndexedDB primero (más persistente)
            try {
                const settingsRecord = await DB.get('settings', 'backup_directory_info');
                if (settingsRecord && settingsRecord.value) {
                    const info = settingsRecord.value;
                    this.backupDirectoryPath = info.path || null;
                    console.log('Información del directorio de backups cargada desde IndexedDB:', this.backupDirectoryPath);
                    
                    // IMPORTANTE: Los FileSystemDirectoryHandle no se pueden restaurar automáticamente
                    // sin interacción del usuario por razones de seguridad del navegador.
                    // Sin embargo, Chrome/Edge pueden mantener permisos persistentes si el usuario
                    // los otorga explícitamente. Cuando el usuario vuelve a seleccionar la carpeta
                    // con el mismo ID, el navegador puede recordar la selección anterior.
                    // 
                    // Por ahora, guardamos la información y cuando el usuario necesite usar la carpeta,
                    // intentaremos restaurarla automáticamente en saveBackupToDirectory().
                    console.log('Información del directorio cargada. El handle se restaurará automáticamente cuando sea necesario.');
                }
            } catch (error) {
                console.warn('Error cargando desde IndexedDB, intentando localStorage:', error);
                
                // Fallback a localStorage
                try {
                    const savedData = localStorage.getItem('backup_directory_info');
                    if (savedData) {
                        const info = JSON.parse(savedData);
                        this.backupDirectoryPath = info.path || null;
                        console.log('Información del directorio de backups cargada desde localStorage:', this.backupDirectoryPath);
                        
                        // Migrar a IndexedDB para mejor persistencia
                        if (this.backupDirectoryPath) {
                            await DB.put('settings', {
                                key: 'backup_directory_info',
                                value: {
                                    path: this.backupDirectoryPath,
                                    selectedAt: info.selectedAt || new Date().toISOString(),
                                    available: true,
                                    handleName: info.handleName || null,
                                    handleId: info.handleId || null
                                }
                            });
                        }
                    }
                } catch (error2) {
                    console.warn('Error cargando información del directorio de backups:', error2);
                }
            }
        } catch (error) {
            console.error('Error en loadBackupDirectory:', error);
        }
    },
    
    // Seleccionar y guardar directorio de backups
    // Alias para compatibilidad
    async requestDirectoryAccess() {
        return await this.selectBackupDirectory();
    },
    
    async selectBackupDirectory() {
        try {
            if (!this.isFileSystemAccessAvailable()) {
                Utils.showNotification('File System Access API no está disponible en este navegador. Usa Chrome, Edge o Opera.', 'warning');
                return false;
            }
            
            // Abrir diálogo para seleccionar directorio
            // IMPORTANTE: Usar id para permitir que el navegador recuerde la selección
            const handle = await window.showDirectoryPicker({
                mode: 'readwrite',
                startIn: 'documents',
                id: 'backup-directory' // ID persistente para que el navegador recuerde la selección
            });
            
            // Guardar el handle
            this.backupDirectoryHandle = handle;
            
            // Intentar obtener el nombre del directorio
            let directoryPath = 'Directorio seleccionado';
            try {
                // En algunos navegadores podemos obtener el nombre
                if (handle.name) {
                    directoryPath = handle.name;
                }
            } catch (e) {
                // Si no podemos obtener el nombre, usar un valor genérico
                directoryPath = 'Directorio de backups';
            }
            
            this.backupDirectoryPath = directoryPath;
            
            // Solicitar permisos persistentes explícitamente
            // Esto permite que el navegador recuerde la selección incluso después de recargar
            try {
                const permissionStatus = await handle.requestPermission({ mode: 'readwrite' });
                if (permissionStatus === 'granted') {
                    console.log('✅ Permisos persistentes otorgados para el directorio de backups');
                }
            } catch (e) {
                console.warn('No se pudieron obtener permisos persistentes:', e);
            }
            
            // Guardar metadata en IndexedDB (más persistente) y localStorage (fallback)
            // IMPORTANTE: Con el ID persistente y permisos persistentes, el navegador puede
            // restaurar automáticamente el handle después de recargar la página
            try {
                // Intentar obtener un ID único del handle si está disponible
                let handleId = null;
                try {
                    // Algunos navegadores exponen un ID único del handle
                    if (handle.id) {
                        handleId = handle.id;
                    }
                } catch (e) {
                    // El ID no está disponible, usar el ID que pasamos a showDirectoryPicker
                    handleId = 'backup-directory';
                }
                
                const directoryInfo = {
                    path: directoryPath,
                    selectedAt: new Date().toISOString(),
                    available: true,
                    handleName: handle.name || null,
                    handleId: handleId || 'backup-directory',
                    // Guardar también el nombre completo del directorio para referencia
                    fullPath: directoryPath,
                    // Marcar que los permisos fueron otorgados
                    permissionsGranted: true
                };
                
                // Guardar en IndexedDB (más persistente)
                await DB.put('settings', {
                    key: 'backup_directory_info',
                    value: directoryInfo
                });
                
                // También guardar en localStorage como fallback
                localStorage.setItem('backup_directory_info', JSON.stringify(directoryInfo));
                
                console.log('✅ Información del directorio guardada en IndexedDB y localStorage:', directoryInfo);
            } catch (error) {
                console.warn('Error guardando información del directorio:', error);
            }
            
            Utils.showNotification(`Carpeta de backups seleccionada: ${directoryPath}`, 'success');
            console.log('Directorio de backups seleccionado:', directoryPath);
            
            return true;
        } catch (error) {
            if (error.name === 'AbortError') {
                // Usuario canceló
                return false;
            }
            console.error('Error seleccionando directorio:', error);
            Utils.showNotification('Error al seleccionar carpeta: ' + error.message, 'error');
            return false;
        }
    },
    
    // Intentar restaurar el handle automáticamente usando el ID persistente
    async restoreDirectoryHandle() {
        try {
            // Cargar información guardada
            const settingsRecord = await DB.get('settings', 'backup_directory_info');
            if (!settingsRecord || !settingsRecord.value) {
                return false;
            }
            
            const info = settingsRecord.value;
            if (!info.handleId || !info.permissionsGranted) {
                return false;
            }
            
            // Intentar restaurar usando showDirectoryPicker con el mismo ID
            // Si los permisos son persistentes, Chrome/Edge restaurarán automáticamente
            // sin mostrar el diálogo (o mostrando uno mínimo)
            try {
                const restoredHandle = await window.showDirectoryPicker({
                    mode: 'readwrite',
                    id: info.handleId // Usar el mismo ID para restaurar
                });
                
                if (restoredHandle) {
                    const permissionStatus = await restoredHandle.requestPermission({ mode: 'readwrite' });
                    if (permissionStatus === 'granted') {
                        this.backupDirectoryHandle = restoredHandle;
                        this.backupDirectoryPath = restoredHandle.name || info.path;
                        console.log('✅ Handle del directorio restaurado automáticamente');
                        return true;
                    }
                }
            } catch (e) {
                if (e.name === 'AbortError') {
                    console.log('Usuario canceló la restauración del handle');
                } else {
                    console.log('No se pudo restaurar el handle:', e);
                }
                return false;
            }
            
            return false;
        } catch (error) {
            console.warn('Error restaurando handle:', error);
            return false;
        }
    },
    
    // Guardar backup en el directorio seleccionado
    async saveBackupToDirectory(backupKey, backupContent) {
        try {
            // Si no hay handle pero hay información guardada, intentar restaurar automáticamente
            if (!this.backupDirectoryHandle) {
                const restored = await this.restoreDirectoryHandle();
                if (!restored) {
                    console.log('No se pudo restaurar el handle automáticamente. El backup se guardó solo en localStorage.');
                    return false; // No se pudo restaurar
                }
            }
            
            // Verificar permisos
            const permissionStatus = await this.backupDirectoryHandle.requestPermission({ mode: 'readwrite' });
            if (permissionStatus !== 'granted') {
                console.warn('Permisos de escritura no otorgados para el directorio de backups');
                return false;
            }
            
            // Crear archivo en el directorio
            const fileName = `${backupKey}.json`;
            const fileHandle = await this.backupDirectoryHandle.getFileHandle(fileName, { create: true });
            
            // Escribir contenido
            const writable = await fileHandle.createWritable();
            await writable.write(backupContent);
            await writable.close();
            
            console.log(`Backup guardado en directorio: ${fileName}`);
            return true;
        } catch (error) {
            console.error('Error guardando backup en directorio:', error);
            return false;
        }
    },
    
    // Obtener información del directorio de backups
    getBackupDirectoryInfo() {
        return {
            available: this.isFileSystemAccessAvailable(),
            selected: this.backupDirectoryHandle !== null,
            path: this.backupDirectoryPath || null
        };
    },
    
    // Limpiar directorio de backups seleccionado
    async clearBackupDirectory() {
        try {
            this.backupDirectoryHandle = null;
            this.backupDirectoryPath = null;
            
            // Eliminar de ambos lugares
            localStorage.removeItem('backup_directory_info');
            try {
                await DB.delete('settings', 'backup_directory_info');
            } catch (e) {
                // Ignorar si no existe
            }
            
            Utils.showNotification('Carpeta de backups deseleccionada', 'success');
            return true;
        } catch (error) {
            console.error('Error limpiando directorio de backups:', error);
            Utils.showNotification('Error al deseleccionar carpeta', 'error');
            return false;
        }
    },
    
    async createBackup() {
        try {
            const timestamp = Utils.formatDate(new Date(), 'YYYYMMDD_HHmmss');
            const backupData = await this.exportAllData();
            
            // Guardar backup en localStorage con timestamp
            const backupKey = `backup_${timestamp}`;
            localStorage.setItem(backupKey, JSON.stringify({
                timestamp: new Date().toISOString(),
                data: backupData,
                version: DB.version
            }));
            
            // Guardar metadata del backup
            this.saveBackupMetadata(backupKey, timestamp);
            
            console.log(`Backup automático creado: ${backupKey}`);
            
            // Guardar en directorio seleccionado (si está disponible)
            const savedToDirectory = await this.saveBackupToDirectory(backupKey, JSON.stringify({
                timestamp: new Date().toISOString(),
                data: backupData,
                version: DB.version
            }));
            
            // NO descargar automáticamente si no hay directorio seleccionado
            // El usuario debe seleccionar una carpeta primero
            if (!savedToDirectory && !this.backupDirectoryHandle) {
                console.log('No hay carpeta de backups seleccionada. El backup se guardó solo en localStorage.');
            }
            
        } catch (error) {
            // Si es QuotaExceededError, limpiar backups antiguos y reintentar una vez (sin recursión)
            if ((error.name === 'QuotaExceededError' || error.message.includes('quota')) && !this._backupRetrying) {
                this._backupRetrying = true;
                try {
                    this.cleanOldBackups();
                    const metadata = JSON.parse(localStorage.getItem('backup_metadata') || '[]');
                    if (metadata.length > 5) {
                        const toRemove = metadata.slice(0, metadata.length - 5);
                        toRemove.forEach(b => { try { localStorage.removeItem(b.key); } catch (e) {} });
                        localStorage.setItem('backup_metadata', JSON.stringify(metadata.slice(-5)));
                    }
                    const timestamp = Utils.formatDate(new Date(), 'YYYYMMDD_HHmmss');
                    const backupData = await this.exportAllData();
                    const backupKey = `backup_${timestamp}`;
                    localStorage.setItem(backupKey, JSON.stringify({ timestamp: new Date().toISOString(), data: backupData, version: DB.version }));
                    this.saveBackupMetadata(backupKey, timestamp);
                } catch (retryErr) {
                    console.warn('⚠️ No se pudo crear backup automático: almacenamiento lleno. Usa Configuración para limpiar backups o descarga manual.');
                }
                this._backupRetrying = false;
            } else if (!(error.name === 'QuotaExceededError' || error.message.includes('quota'))) {
                console.error('Error creando backup automático:', error);
            } else {
                console.warn('⚠️ No se pudo crear backup automático: almacenamiento lleno.');
            }
        }
    },
    
    async exportAllData() {
        const stores = [
            'sales', 'sale_items', 'payments',
            'inventory_items', 'inventory_logs', // Corregido: inventory_log -> inventory_logs
            'customers', 'repairs', 'cost_entries',
            'employees', 'users',
            'catalog_agencies', 'catalog_guides', 'catalog_sellers', 'catalog_branches',
            'tourist_reports', 'tourist_report_lines', // Corregido: tourist_lines -> tourist_report_lines
            'agency_arrivals', 'temp_quick_captures', 'archived_quick_captures', // Capturas rápidas y llegadas
            'settings', 'device', 'audit_log',
            'sync_queue', 'commission_rules', 'arrival_rules', // Reglas de comisiones y llegadas
            'exchange_rates_daily' // Tipos de cambio diarios
        ];
        
        const exportData = {
            version: DB.version,
            timestamp: new Date().toISOString(),
            stores: {}
        };
        
        // Verificar qué stores existen realmente
        const existingStores = [];
        if (DB.db && DB.db.objectStoreNames) {
            for (let i = 0; i < DB.db.objectStoreNames.length; i++) {
                existingStores.push(DB.db.objectStoreNames[i]);
            }
        }
        
        for (const store of stores) {
            try {
                // Verificar que el store existe antes de intentar acceder
                if (!DB.db || !DB.db.objectStoreNames.contains(store)) {
                    // No mostrar warning para stores opcionales como arrival_rules
                    if (store !== 'arrival_rules') {
                        console.warn(`Store ${store} no existe, saltando...`);
                    }
                    exportData.stores[store] = [];
                    continue;
                }
                
                exportData.stores[store] = await DB.getAll(store);
            } catch (error) {
                console.warn(`No se pudo exportar store ${store}:`, error);
                exportData.stores[store] = [];
            }
        }
        
        return exportData;
    },
    
    saveBackupMetadata(backupKey, timestamp) {
        let metadata = JSON.parse(localStorage.getItem('backup_metadata') || '[]');
        
        metadata.push({
            key: backupKey,
            timestamp: timestamp,
            date: new Date().toISOString(),
            size: this.getBackupSize(backupKey)
        });
        
        // Mantener solo los últimos maxBackups
        if (metadata.length > this.maxBackups) {
            const toRemove = metadata.slice(0, metadata.length - this.maxBackups);
            toRemove.forEach(backup => {
                localStorage.removeItem(backup.key);
            });
            metadata = metadata.slice(-this.maxBackups);
        }
        
        localStorage.setItem('backup_metadata', JSON.stringify(metadata));
    },
    
    getBackupSize(backupKey) {
        const backup = localStorage.getItem(backupKey);
        return backup ? new Blob([backup]).size : 0;
    },
    
    cleanOldBackups() {
        const metadata = JSON.parse(localStorage.getItem('backup_metadata') || '[]');
        
        if (metadata.length > this.maxBackups) {
            const toRemove = metadata.slice(0, metadata.length - this.maxBackups);
            toRemove.forEach(backup => {
                localStorage.removeItem(backup.key);
            });
            
            const remaining = metadata.slice(-this.maxBackups);
            localStorage.setItem('backup_metadata', JSON.stringify(remaining));
        }
    },
    
    getBackupList() {
        const metadata = JSON.parse(localStorage.getItem('backup_metadata') || '[]');
        return metadata.sort((a, b) => new Date(b.date) - new Date(a.date));
    },
    
    async restoreBackup(backupKey) {
        try {
            const backup = JSON.parse(localStorage.getItem(backupKey));
            if (!backup) {
                throw new Error('Backup no encontrado');
            }
            
            return await this.restoreBackupData(backup);
        } catch (error) {
            console.error('Error restaurando backup:', error);
            Utils.showNotification('Error al restaurar backup', 'error');
            return false;
        }
    },
    
    async restoreBackupData(backup) {
        try {
            // Validar estructura del backup
            if (!backup || !backup.data || !backup.data.stores) {
                throw new Error('Formato de backup inválido. El archivo debe contener data.stores');
            }
            
            const stores = backup.data.stores || {};
            let restoredCount = 0;
            let errorCount = 0;
            
            // Confirmar antes de restaurar (ya que va a limpiar datos existentes)
            const confirm = await Utils.confirm(
                `¿Estás seguro de restaurar este backup?\n\n` +
                `Esto reemplazará TODOS los datos actuales con los del backup.\n` +
                `Esta acción NO se puede deshacer.\n\n` +
                `Fecha del backup: ${backup.timestamp ? new Date(backup.timestamp).toLocaleString('es-MX') : 'N/A'}\n` +
                `Versión: ${backup.version || 'N/A'}`,
                'Restaurar Backup'
            );
            
            if (!confirm) {
                Utils.showNotification('Restauración cancelada', 'info');
                return false;
            }
            
            // Restaurar cada store
            for (const [storeName, items] of Object.entries(stores)) {
                try {
                    // Verificar que el store existe
                    if (!DB.db || !DB.db.objectStoreNames.contains(storeName)) {
                        console.warn(`Store ${storeName} no existe, saltando...`);
                        continue;
                    }
                    
                    // Limpiar store existente
                    await DB.clear(storeName);
                    
                    // Restaurar items
                    if (Array.isArray(items)) {
                        for (const item of items) {
                            try {
                                await DB.put(storeName, item);
                                restoredCount++;
                            } catch (itemError) {
                                console.error(`Error restaurando item en ${storeName}:`, itemError);
                                errorCount++;
                            }
                        }
                    }
                } catch (error) {
                    console.error(`Error restaurando store ${storeName}:`, error);
                    errorCount++;
                }
            }
            
            const message = `Backup restaurado correctamente. ${restoredCount} elementos restaurados${errorCount > 0 ? `, ${errorCount} errores` : ''}`;
            Utils.showNotification(message, errorCount > 0 ? 'warning' : 'success');
            
            // Recargar la página para actualizar todos los módulos
            setTimeout(() => {
                if (confirm('¿Deseas recargar la página para ver los cambios?')) {
                    window.location.reload();
                }
            }, 2000);
            
            return true;
        } catch (error) {
            console.error('Error restaurando backup:', error);
            Utils.showNotification('Error al restaurar backup: ' + error.message, 'error');
            return false;
        }
    },
    
    async importBackupFromFile() {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.style.display = 'none';
            
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) {
                    resolve(false);
                    return;
                }
                
                try {
                    const fileContent = await this.readFileAsText(file);
                    const backup = JSON.parse(fileContent);
                    
                    // Validar que sea un backup válido
                    if (!backup.data || !backup.data.stores) {
                        throw new Error('El archivo no es un backup válido. Debe contener data.stores');
                    }
                    
                    // Restaurar directamente desde el archivo
                    const success = await this.restoreBackupData(backup);
                    resolve(success);
                } catch (error) {
                    console.error('Error importando backup:', error);
                    Utils.showNotification('Error al importar backup: ' + error.message, 'error');
                    resolve(false);
                } finally {
                    document.body.removeChild(input);
                }
            };
            
            document.body.appendChild(input);
            input.click();
        });
    },
    
    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error('Error leyendo archivo'));
            reader.readAsText(file);
        });
    },
    
    async downloadBackup(backupKey) {
        try {
            const backup = localStorage.getItem(backupKey);
            if (!backup) {
                throw new Error('Backup no encontrado');
            }
            
            const blob = new Blob([backup], { type: 'application/json' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `${backupKey}.json`;
            link.click();
            
            // Limpiar el objeto URL después de un momento para liberar memoria
            setTimeout(() => URL.revokeObjectURL(link.href), 100);
            
            Utils.showNotification('Backup descargado', 'success');
        } catch (error) {
            console.error('Error descargando backup:', error);
            Utils.showNotification('Error al descargar backup', 'error');
        }
    },
    
    async downloadBackupAutomatic(backupKey) {
        try {
            const backup = localStorage.getItem(backupKey);
            if (!backup) {
                console.warn(`Backup ${backupKey} no encontrado para descarga automática`);
                return;
            }
            
            const blob = new Blob([backup], { type: 'application/json' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `${backupKey}.json`;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Limpiar el objeto URL después de un momento para liberar memoria
            setTimeout(() => URL.revokeObjectURL(link.href), 100);
            
            console.log(`Backup ${backupKey} descargado automáticamente`);
        } catch (error) {
            console.error('Error en descarga automática de backup:', error);
            // No mostrar notificación al usuario para no molestar
        }
    },
    
    deleteBackup(backupKey) {
        try {
            localStorage.removeItem(backupKey);
            
            // Actualizar metadata
            let metadata = JSON.parse(localStorage.getItem('backup_metadata') || '[]');
            metadata = metadata.filter(b => b.key !== backupKey);
            localStorage.setItem('backup_metadata', JSON.stringify(metadata));
            
            Utils.showNotification('Backup eliminado', 'success');
            return true;
        } catch (error) {
            console.error('Error eliminando backup:', error);
            Utils.showNotification('Error al eliminar backup', 'error');
            return false;
        }
    },
    
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            this.isRunning = false;
            console.log('Sistema de backups automáticos detenido');
        }
    },
    
    getStorageUsage() {
        let totalSize = 0;
        const metadata = this.getBackupList();
        
        metadata.forEach(backup => {
            totalSize += backup.size || 0;
        });
        
        return {
            count: metadata.length,
            totalSize: totalSize,
            totalSizeMB: (totalSize / 1024 / 1024).toFixed(2)
        };
    }
};

// El sistema de backups se inicializa desde app.js después de que DB esté lista

