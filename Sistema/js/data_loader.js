/**
 * DataLoader - Servicio Cache-First reutilizable
 * Encapsula el patrón: leer IndexedDB → mostrar UI → sincronizar API en background
 */
const DataLoader = {
    async load(storeName, config) {
        let cached = await DB.getAll(storeName, null, null, config.dbOptions || {}) || [];
        if (config.filter) cached = config.filter(cached);
        if (config.onCached) config.onCached(cached);
        if (config.api && typeof API !== 'undefined' && API.baseURL) {
            this._fetchInBackground(storeName, config).catch(e => console.warn('Background sync:', e));
        }
        return cached;
    },
    async _fetchInBackground(storeName, config) {
        const fresh = await config.api();
        const arr = Array.isArray(fresh) ? fresh : (fresh?.items || []);
        if (config.saveToStore && arr.length > 0) {
            for (const item of arr) {
                try {
                    await DB.put(storeName, { ...item, server_id: item.id, sync_status: 'synced' }, { autoBranchId: false });
                } catch (e) { /* ignore */ }
            }
        }
        if (config.onFresh) config.onFresh(arr);
    }
};
