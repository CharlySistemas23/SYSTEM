// Sistema de Backups Automáticos
// Realiza backups cada 10 minutos automáticamente

const BackupManager = {
    intervalId: null,
    isRunning: false,
    backupInterval: 10 * 60 * 1000, // 10 minutos en milisegundos
    maxBackups: 50, // Mantener máximo 50 backups
    
    async init() {
        if (this.isRunning) return;
        
        // Realizar primer backup inmediatamente
        await this.createBackup();
        
        // Configurar intervalo para backups automáticos
        this.intervalId = setInterval(async () => {
            await this.createBackup();
        }, this.backupInterval);
        
        this.isRunning = true;
        console.log('Sistema de backups automáticos iniciado (cada 10 minutos)');
        
        // Limpiar backups antiguos
        this.cleanOldBackups();
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
            
            // Notificar al usuario de forma discreta (solo en consola para no molestar)
            // Utils.showNotification('Backup automático creado', 'success');
            
        } catch (error) {
            console.error('Error creando backup automático:', error);
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
            'settings', 'device', 'audit_log',
            'sync_queue'
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
                    console.warn(`Store ${store} no existe, saltando...`);
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
            
            const stores = backup.data.stores || {};
            
            // Restaurar cada store
            for (const [storeName, items] of Object.entries(stores)) {
                try {
                    // Limpiar store existente
                    await DB.clear(storeName);
                    
                    // Restaurar items
                    for (const item of items) {
                        await DB.put(storeName, item);
                    }
                } catch (error) {
                    console.error(`Error restaurando store ${storeName}:`, error);
                }
            }
            
            Utils.showNotification('Backup restaurado correctamente', 'success');
            return true;
        } catch (error) {
            console.error('Error restaurando backup:', error);
            Utils.showNotification('Error al restaurar backup', 'error');
            return false;
        }
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
            
            Utils.showNotification('Backup descargado', 'success');
        } catch (error) {
            console.error('Error descargando backup:', error);
            Utils.showNotification('Error al descargar backup', 'error');
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

