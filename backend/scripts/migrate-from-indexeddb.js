import { query } from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Script para migrar datos desde IndexedDB exportado (JSON) a PostgreSQL
 * 
 * Uso:
 * node scripts/migrate-from-indexeddb.js <archivo-json> <branch-id>
 * 
 * Ejemplo:
 * node scripts/migrate-from-indexeddb.js export-vallarta.json vallarta-uuid
 */

async function migrateFromIndexedDB(jsonFile, branchId) {
  try {
    console.log('📦 Iniciando migración desde IndexedDB...');
    console.log(`Archivo: ${jsonFile}`);
    console.log(`Sucursal: ${branchId}`);

    // Leer archivo JSON
    const jsonData = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));

    // Verificar estructura
    if (!jsonData.inventory_items && !jsonData.sales && !jsonData.customers) {
      console.error('❌ El archivo JSON no tiene la estructura esperada');
      return;
    }

    const results = {
      inventory: { success: 0, errors: [] },
      sales: { success: 0, errors: [] },
      customers: { success: 0, errors: [] },
      employees: { success: 0, errors: [] },
      repairs: { success: 0, errors: [] },
      costs: { success: 0, errors: [] }
    };

    // Migrar inventario
    if (jsonData.inventory_items && Array.isArray(jsonData.inventory_items)) {
      console.log(`\n📦 Migrando ${jsonData.inventory_items.length} productos...`);
      for (const item of jsonData.inventory_items) {
        try {
          // Verificar si ya existe
          const existing = await query(
            'SELECT id FROM inventory_items WHERE sku = $1',
            [item.sku]
          );

          if (existing.rows.length > 0) {
            console.log(`  ⚠️  SKU ${item.sku} ya existe, omitiendo...`);
            continue;
          }

          await query(
            `INSERT INTO inventory_items (
              id, sku, barcode, name, description, category, metal, stone_type,
              weight, price, cost, stock_actual, stock_min, stock_max, status,
              branch_id, photos, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
            [
              item.id || null, // Si tiene ID, usarlo; si no, generar nuevo
              item.sku,
              item.barcode || null,
              item.name,
              item.description || null,
              item.category || null,
              item.metal || null,
              item.stone_type || null,
              item.weight || item.weight_g || 0,
              item.price || item.cost || 0,
              item.cost || 0,
              item.stock_actual || 0,
              item.stock_min || 0,
              item.stock_max || 0,
              item.status || 'disponible',
              branchId,
              item.photos || [],
              item.created_at || new Date().toISOString(),
              item.updated_at || new Date().toISOString()
            ]
          );
          results.inventory.success++;
        } catch (error) {
          results.inventory.errors.push({ sku: item.sku, error: error.message });
          console.error(`  ❌ Error migrando ${item.sku}:`, error.message);
        }
      }
    }

    // Migrar ventas
    if (jsonData.sales && Array.isArray(jsonData.sales)) {
      console.log(`\n💰 Migrando ${jsonData.sales.length} ventas...`);
      for (const sale of jsonData.sales) {
        try {
          // Verificar si ya existe
          const existing = await query(
            'SELECT id FROM sales WHERE folio = $1',
            [sale.folio]
          );

          if (existing.rows.length > 0) {
            console.log(`  ⚠️  Folio ${sale.folio} ya existe, omitiendo...`);
            continue;
          }

          const saleResult = await query(
            `INSERT INTO sales (
              id, folio, branch_id, seller_id, agency_id, guide_id, customer_id,
              subtotal, discount_percent, discount_amount, total, status,
              created_by, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING id`,
            [
              sale.id || null,
              sale.folio,
              branchId,
              sale.seller_id || null,
              sale.agency_id || null,
              sale.guide_id || null,
              sale.customer_id || null,
              sale.subtotal || sale.total || 0,
              sale.discount_percent || 0,
              sale.discount_amount || sale.discount || 0,
              sale.total || 0,
              sale.status === 'completada' ? 'completed' : sale.status || 'completed',
              sale.created_by || null,
              sale.created_at || new Date().toISOString(),
              sale.updated_at || new Date().toISOString()
            ]
          );

          const newSaleId = saleResult.rows[0].id;

          // Migrar items de venta si existen
          if (sale.items && Array.isArray(sale.items)) {
            for (const saleItem of sale.items) {
              await query(
                `INSERT INTO sale_items (
                  sale_id, item_id, quantity, price, cost, discount, subtotal
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                  newSaleId,
                  saleItem.item_id || saleItem.id,
                  saleItem.quantity || 1,
                  saleItem.price || 0,
                  saleItem.cost || 0,
                  saleItem.discount || 0,
                  saleItem.subtotal || (saleItem.price || 0) * (saleItem.quantity || 1)
                ]
              );
            }
          }

          results.sales.success++;
        } catch (error) {
          results.sales.errors.push({ folio: sale.folio, error: error.message });
          console.error(`  ❌ Error migrando venta ${sale.folio}:`, error.message);
        }
      }
    }

    // Migrar clientes
    if (jsonData.customers && Array.isArray(jsonData.customers)) {
      console.log(`\n👥 Migrando ${jsonData.customers.length} clientes...`);
      for (const customer of jsonData.customers) {
        try {
          const existing = await query(
            'SELECT id FROM customers WHERE email = $1 OR phone = $2',
            [customer.email || '', customer.phone || '']
          );

          if (existing.rows.length > 0) {
            console.log(`  ⚠️  Cliente ${customer.name} ya existe, omitiendo...`);
            continue;
          }

          await query(
            `INSERT INTO customers (
              id, name, email, phone, address, notes, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              customer.id || null,
              customer.name,
              customer.email || null,
              customer.phone || null,
              customer.address || null,
              customer.notes || null,
              customer.created_at || new Date().toISOString(),
              customer.updated_at || new Date().toISOString()
            ]
          );
          results.customers.success++;
        } catch (error) {
          results.customers.errors.push({ name: customer.name, error: error.message });
          console.error(`  ❌ Error migrando cliente ${customer.name}:`, error.message);
        }
      }
    }

    // Migrar empleados
    if (jsonData.employees && Array.isArray(jsonData.employees)) {
      console.log(`\n👤 Migrando ${jsonData.employees.length} empleados...`);
      for (const employee of jsonData.employees) {
        try {
          const existing = await query(
            'SELECT id FROM employees WHERE code = $1',
            [employee.code || employee.employee_code]
          );

          if (existing.rows.length > 0) {
            console.log(`  ⚠️  Empleado ${employee.code} ya existe, omitiendo...`);
            continue;
          }

          await query(
            `INSERT INTO employees (
              id, code, barcode, name, email, phone, role, branch_id, active,
              created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
              employee.id || null,
              employee.code || employee.employee_code,
              employee.barcode || null,
              employee.name,
              employee.email || null,
              employee.phone || null,
              employee.role || 'employee',
              branchId,
              employee.active !== false,
              employee.created_at || new Date().toISOString(),
              employee.updated_at || new Date().toISOString()
            ]
          );
          results.employees.success++;
        } catch (error) {
          results.employees.errors.push({ code: employee.code, error: error.message });
          console.error(`  ❌ Error migrando empleado ${employee.code}:`, error.message);
        }
      }
    }

    // Resumen
    console.log('\n✅ Migración completada:');
    console.log(`  📦 Productos: ${results.inventory.success} exitosos, ${results.inventory.errors.length} errores`);
    console.log(`  💰 Ventas: ${results.sales.success} exitosas, ${results.sales.errors.length} errores`);
    console.log(`  👥 Clientes: ${results.customers.success} exitosos, ${results.customers.errors.length} errores`);
    console.log(`  👤 Empleados: ${results.employees.success} exitosos, ${results.employees.errors.length} errores`);

    if (results.inventory.errors.length > 0 || results.sales.errors.length > 0) {
      console.log('\n⚠️  Errores encontrados:');
      if (results.inventory.errors.length > 0) {
        console.log('  Productos:', results.inventory.errors.slice(0, 5));
      }
      if (results.sales.errors.length > 0) {
        console.log('  Ventas:', results.sales.errors.slice(0, 5));
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error en migración:', error);
    process.exit(1);
  }
}

// Ejecutar migración
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Uso: node migrate-from-indexeddb.js <archivo-json> <branch-id>');
  process.exit(1);
}

migrateFromIndexedDB(args[0], args[1]);
