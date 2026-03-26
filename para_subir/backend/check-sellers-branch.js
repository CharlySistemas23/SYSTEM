#!/usr/bin/env node

/**
 * Script de Diagnóstico: Problema de Vendedores en POS - Malecón
 * 
 * Uso: node check-sellers-branch.js
 * 
 * Este script verifica:
 * 1. Si VANESSA, GUILLERMINA, LUIS, ITZEL tienen branch_id asignado
 * 2. Si GUIA FERREIRA existe y tiene branch_id
 * 3. Cuál es el branch_id de Malecón
 * 4. Proporciona SQL para fixes si es necesario
 */

import { query } from './config/database.js';

async function diagnosticCheck() {
  try {
    console.log('\n🔍 DIAGNÓSTICO: Vendedores/Guías en Malecón\n');
    console.log('='.repeat(60));

    // 1. Obtener ID de Malecón
    console.log('\n📍 Paso 1: Buscando sucursal "Malecón"...\n');
    const branchResult = await query(
      `SELECT id, name, code FROM branches 
       WHERE LOWER(name) LIKE LOWER('%malecón%') 
          OR LOWER(name) LIKE LOWER('%malecon%')
          OR LOWER(code) LIKE LOWER('%malecón%')
          OR LOWER(code) LIKE LOWER('%malecon%')
       LIMIT 1`
    );

    if (branchResult.rows.length === 0) {
      console.log('❌ No se encontró sucursal "Malecón"');
      console.log('   Listando todas las sucursales:\n');
      const allBranches = await query('SELECT id, name, code FROM branches ORDER BY name');
      allBranches.rows.forEach(b => {
        console.log(`   - ID: ${b.id}\n     Name: ${b.name}\n     Code: ${b.code}`);
      });
      return;
    }

    const maleconBranch = branchResult.rows[0];
    console.log(`✅ Sucursal encontrada:`);
    console.log(`   ID: ${maleconBranch.id}`);
    console.log(`   Nombre: ${maleconBranch.name}`);
    console.log(`   Código: ${maleconBranch.code}`);

    // 2. Revisar vendedores
    console.log('\n' + '='.repeat(60));
    console.log('\n📊 Paso 2: Estado de Vendedores\n');

    const sellersResult = await query(
      `SELECT id, name, code, branch_id, barcode, active 
       FROM catalog_sellers 
       WHERE LOWER(name) IN (LOWER('VANESSA'), LOWER('GUILLERMINA'), LOWER('LUIS'), LOWER('ITZEL'))
       ORDER BY name`
    );

    const problemSellers = [];
    if (sellersResult.rows.length === 0) {
      console.log('❌ PROBLEMA: Ninguno de los vendedores listados existe en BD');
      console.log('   Buscando vendedores activos para listar:\n');
      const allSellers = await query('SELECT id, name, code, branch_id FROM catalog_sellers WHERE active = true ORDER BY name LIMIT 10');
      allSellers.rows.forEach(s => {
        console.log(`   - ${s.name} (branch_id: ${s.branch_id || 'NULL'})`);
      });
    } else {
      console.log(`✅ Se encontraron ${sellersResult.rows.length} vendedores:\n`);
      sellersResult.rows.forEach(seller => {
        const branchMatch = seller.branch_id === maleconBranch.id;
        const hasBranch = seller.branch_id !== null;
        const status = branchMatch ? '✅' : (hasBranch ? '⚠️' : '❌');
        
        console.log(`${status} ${seller.name}`);
        console.log(`   ID: ${seller.id}`);
        console.log(`   Branch ID: ${seller.branch_id || 'NULL'}`);
        console.log(`   Barcode: ${seller.barcode || 'NULL'}`);
        console.log(`   Active: ${seller.active}`);
        
        if (!hasBranch) {
          problemSellers.push({
            name: seller.name,
            id: seller.id,
            issue: 'NO_BRANCH_ID'
          });
        } else if (!branchMatch) {
          problemSellers.push({
            name: seller.name,
            id: seller.id,
            issue: 'WRONG_BRANCH_ID',
            currentBranch: seller.branch_id
          });
        }
        console.log('');
      });
    }

    // 3. Revisar guías
    console.log('='.repeat(60));
    console.log('\n📊 Paso 3: Estado de Guías\n');

    const guidesResult = await query(
      `SELECT id, name, code, branch_id, barcode, agency_id, active 
       FROM catalog_guides 
       WHERE LOWER(name) LIKE LOWER('%ferreira%')
       ORDER BY name`
    );

    if (guidesResult.rows.length === 0) {
      console.log('❌ PROBLEMA: No se encontró "GUIA FERREIRA"');
      console.log('   Buscando guías activas para listar:\n');
      const allGuides = await query('SELECT id, name, code, branch_id FROM catalog_guides WHERE active = true ORDER BY name LIMIT 10');
      allGuides.rows.forEach(g => {
        console.log(`   - ${g.name} (branch_id: ${g.branch_id || 'NULL'})`);
      });
    } else {
      console.log(`✅ Se encontraron ${guidesResult.rows.length} guía(s):\n`);
      guidesResult.rows.forEach(guide => {
        const branchMatch = guide.branch_id === maleconBranch.id;
        const hasBranch = guide.branch_id !== null;
        const status = branchMatch ? '✅' : (hasBranch ? '⚠️' : '❌');
        
        console.log(`${status} ${guide.name}`);
        console.log(`   ID: ${guide.id}`);
        console.log(`   Branch ID: ${guide.branch_id || 'NULL'}`);
        console.log(`   Agency ID: ${guide.agency_id || 'NULL'}`);
        console.log(`   Barcode: ${guide.barcode || 'NULL'}`);
        console.log('');

        if (!hasBranch) {
          problemSellers.push({
            name: guide.name,
            id: guide.id,
            issue: 'NO_BRANCH_ID',
            type: 'guide'
          });
        } else if (!branchMatch) {
          problemSellers.push({
            name: guide.name,
            id: guide.id,
            issue: 'WRONG_BRANCH_ID',
            type: 'guide',
            currentBranch: guide.branch_id
          });
        }
      });
    }

    // 4. Generar SQL fix si es necesario
    if (problemSellers.length > 0) {
      console.log('='.repeat(60));
      console.log('\n🔧 FIX RECOMENDADO\n');
      console.log('Ejecuta el siguiente SQL en la BD:\n');

      const sqlStatements = [];
      problemSellers.forEach(ps => {
        if (ps.type === 'guide') {
          sqlStatements.push(
            `UPDATE catalog_guides SET branch_id = '${maleconBranch.id}' WHERE id = '${ps.id}';`
          );
        } else {
          sqlStatements.push(
            `UPDATE catalog_sellers SET branch_id = '${maleconBranch.id}' WHERE id = '${ps.id}';`
          );
        }
      });

      sqlStatements.forEach(sql => console.log(sql));
      console.log('\n');

      // Generar también el SQL alternativo para limpiar todos de esa sucursal
      console.log('O, si todos estos vendedores/guías pertenecen SOLO a Malecón, ejecuta:');
      console.log(`
UPDATE catalog_sellers 
SET branch_id = '${maleconBranch.id}' 
WHERE name IN ('VANESSA', 'GUILLERMINA', 'LUIS', 'ITZEL') 
  AND branch_id IS NULL;

UPDATE catalog_guides 
SET branch_id = '${maleconBranch.id}' 
WHERE LOWER(name) LIKE LOWER('%ferreira%') 
  AND branch_id IS NULL;
`);
    } else {
      console.log('\n✅ Todos los vendedores/guías tienen branch_id correcto asignado a Malecón');
      console.log('   El problema podría estar en el sincronopsia o cache del frontend');
      console.log('   Intenta limpiar IndexedDB en el navegador (F12 > Application > IndexedDB)');
    }

    console.log('\n' + '='.repeat(60) + '\n');

  } catch (error) {
    console.error('\n❌ Error durante diagnóstico:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Ejecutar
diagnosticCheck().then(() => {
  console.log('✅ Diagnóstico completado');
  process.exit(0);
}).catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
