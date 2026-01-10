// Script de Limpieza de Sucursales Duplicadas
// Identifica y elimina duplicados, migrando datos asociados
import { query, queryOne, update, remove } from '../config/database.js';

/**
 * Identifica duplicados por nombre (case-insensitive)
 */
async function findDuplicateBranches() {
    const duplicates = await query(`
        SELECT 
            LOWER(TRIM(name)) as normalized_name,
            COUNT(*) as count,
            array_agg(id ORDER BY created_at DESC) as branch_ids,
            array_agg(name ORDER BY created_at DESC) as branch_names,
            array_agg(created_at ORDER BY created_at DESC) as created_dates
        FROM catalog_branches
        GROUP BY LOWER(TRIM(name))
        HAVING COUNT(*) > 1
    `);
    
    return duplicates;
}

/**
 * Decide qué sucursal conservar (criterio: más reciente, más datos)
 */
function chooseBranchToKeep(branches) {
    // Ordenar por: más reciente primero, luego por cantidad de datos
    return branches.sort((a, b) => {
        // Primero por fecha de creación (más reciente primero)
        const dateA = new Date(a.created_at || 0);
        const dateB = new Date(b.created_at || 0);
        if (dateB.getTime() !== dateA.getTime()) {
            return dateB.getTime() - dateA.getTime();
        }
        // Si tienen la misma fecha, priorizar la que tiene más datos
        const dataA = (a.address ? 1 : 0) + (a.phone ? 1 : 0) + (a.email ? 1 : 0);
        const dataB = (b.address ? 1 : 0) + (b.phone ? 1 : 0) + (b.email ? 1 : 0);
        return dataB - dataA;
    })[0]; // Retornar la primera (la mejor)
}

/**
 * Migra datos asociados de una sucursal a otra
 */
async function migrateBranchData(fromBranchId, toBranchId) {
    const tablesToMigrate = [
        'users',
        'employees',
        'customers',
        'inventory_items',
        'sales',
        'cost_entries',
        'cash_sessions',
        'arrival_rate_rules',
        'agency_arrivals',
        'repairs',
        'tourist_reports',
        'inventory_transfers',
        'budget_entries',
        'daily_profit_reports',
        'catalog_sellers',
        'catalog_guides',
        'catalog_agencies',
        'commission_rules'
    ];
    
    const migrations = [];
    
    for (const table of tablesToMigrate) {
        try {
            // Verificar si la tabla tiene branch_id
            const hasBranchId = await query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = $1 AND column_name = 'branch_id'
            `, [table]);
            
            if (hasBranchId.length === 0) {
                continue; // Esta tabla no tiene branch_id, saltar
            }
            
            // Migrar datos
            const result = await query(`
                UPDATE ${table}
                SET branch_id = $1
                WHERE branch_id = $2
            `, [toBranchId, fromBranchId]);
            
            migrations.push({
                table,
                migrated: result.rowCount || 0
            });
        } catch (error) {
            console.error(`Error migrando datos de ${table}:`, error.message);
            migrations.push({
                table,
                error: error.message
            });
        }
    }
    
    return migrations;
}

/**
 * Limpia duplicados de sucursales
 */
export async function fixDuplicateBranches() {
    console.log('');
    console.log('🔍 Buscando sucursales duplicadas...');
    console.log('');
    
    try {
        const duplicates = await findDuplicateBranches();
        
        if (duplicates.length === 0) {
            console.log('✅ No se encontraron duplicados');
            return {
                success: true,
                duplicatesFound: 0,
                duplicatesFixed: 0,
                migrations: []
            };
        }
        
        console.log(`⚠️  Se encontraron ${duplicates.length} grupos de duplicados`);
        console.log('');
        
        const report = {
            success: true,
            duplicatesFound: duplicates.length,
            duplicatesFixed: 0,
            migrations: [],
            errors: []
        };
        
        for (const dup of duplicates) {
            const branchIds = dup.branch_ids;
            const branchNames = dup.branch_names;
            
            console.log(`📋 Procesando duplicados de "${branchNames[0]}":`);
            console.log(`   IDs encontrados: ${branchIds.join(', ')}`);
            
            // Obtener información completa de cada sucursal
            const branches = [];
            for (const id of branchIds) {
                const branch = await queryOne(
                    'SELECT * FROM catalog_branches WHERE id = $1',
                    [id]
                );
                if (branch) {
                    branches.push(branch);
                }
            }
            
            // Elegir cuál conservar
            const branchToKeep = chooseBranchToKeep(branches);
            const branchesToRemove = branches.filter(b => b.id !== branchToKeep.id);
            
            console.log(`   ✅ Conservando: ${branchToKeep.id} (${branchToKeep.name})`);
            console.log(`   ❌ Eliminando: ${branchesToRemove.map(b => `${b.id} (${b.name})`).join(', ')}`);
            
            // Migrar datos de las sucursales a eliminar
            for (const branchToRemove of branchesToRemove) {
                console.log(`   🔄 Migrando datos de ${branchToRemove.id} a ${branchToKeep.id}...`);
                
                try {
                    const migrations = await migrateBranchData(branchToRemove.id, branchToKeep.id);
                    report.migrations.push({
                        from: branchToRemove.id,
                        to: branchToKeep.id,
                        tables: migrations
                    });
                    
                    // Eliminar la sucursal duplicada
                    await remove('catalog_branches', branchToRemove.id);
                    report.duplicatesFixed++;
                    console.log(`   ✅ Sucursal ${branchToRemove.id} eliminada`);
                } catch (error) {
                    console.error(`   ❌ Error procesando ${branchToRemove.id}:`, error.message);
                    report.errors.push({
                        branch: branchToRemove.id,
                        error: error.message
                    });
                }
            }
            
            console.log('');
        }
        
        console.log('═══════════════════════════════════════════');
        console.log('✅ LIMPIEZA DE DUPLICADOS COMPLETADA');
        console.log('═══════════════════════════════════════════');
        console.log(`   Duplicados encontrados: ${report.duplicatesFound}`);
        console.log(`   Duplicados eliminados: ${report.duplicatesFixed}`);
        if (report.errors.length > 0) {
            console.log(`   Errores: ${report.errors.length}`);
        }
        console.log('═══════════════════════════════════════════');
        console.log('');
        
        return report;
    } catch (error) {
        console.error('❌ Error en limpieza de duplicados:', error);
        throw error;
    }
}

// Si se ejecuta directamente
if (import.meta.url === `file://${process.argv[1]}`) {
    fixDuplicateBranches()
        .then(report => {
            console.log('Reporte:', JSON.stringify(report, null, 2));
            process.exit(0);
        })
        .catch(error => {
            console.error('Error:', error);
            process.exit(1);
        });
}
