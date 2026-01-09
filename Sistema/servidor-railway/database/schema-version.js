// Sistema de Versionado de Esquema
// Permite rastrear la versión del esquema y aplicar migraciones incrementales

export const SCHEMA_VERSION = '1.1.0'; // Incrementar cuando haya cambios en el esquema

export async function getCurrentSchemaVersion() {
    try {
        const { queryOne } = await import('../config/database.js');
        const version = await queryOne(
            'SELECT value FROM settings WHERE key = $1',
            ['schema_version']
        );
        return version?.value || '1.0.0';
    } catch (error) {
        // Si no existe la tabla settings o el registro, retornar versión inicial
        return '1.0.0';
    }
}

export async function setSchemaVersion(version) {
    try {
        const { queryOne, insert, update } = await import('../config/database.js');
        
        // Verificar si existe
        const existing = await queryOne(
            'SELECT * FROM settings WHERE key = $1',
            ['schema_version']
        );
        
        if (existing) {
            await update('settings', existing.id, {
                value: version,
                updated_at: new Date().toISOString()
            });
        } else {
            await insert('settings', {
                id: 'schema_version',
                key: 'schema_version',
                value: version,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
        }
        
        console.log(`✅ Versión de esquema actualizada a: ${version}`);
    } catch (error) {
        console.error('Error actualizando versión de esquema:', error);
        throw error;
    }
}

export async function checkSchemaVersion() {
    const currentVersion = await getCurrentSchemaVersion();
    const expectedVersion = SCHEMA_VERSION;
    
    if (currentVersion !== expectedVersion) {
        console.log(`⚠️ Versión de esquema desactualizada: ${currentVersion} → ${expectedVersion}`);
        return {
            needsUpdate: true,
            current: currentVersion,
            expected: expectedVersion
        };
    }
    
    return {
        needsUpdate: false,
        current: currentVersion,
        expected: expectedVersion
    };
}
