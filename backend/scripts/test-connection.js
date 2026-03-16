// Script para probar conexión a la base de datos y servicios externos
import { query } from '../config/database.js';
import cloudinary from '../config/cloudinary.js';
import dotenv from 'dotenv';

dotenv.config();

async function testConnection() {
  console.log('🔍 Iniciando pruebas de conexión...\n');

  // Test 1: Base de datos
  console.log('1️⃣ Probando conexión a PostgreSQL...');
  try {
    const result = await query('SELECT NOW() as current_time, version() as version');
    console.log('✅ PostgreSQL conectado');
    console.log(`   Hora del servidor: ${result.rows[0].current_time}`);
    console.log(`   Versión: ${result.rows[0].version.split(' ')[0]} ${result.rows[0].version.split(' ')[1]}\n`);
  } catch (error) {
    console.error('❌ Error conectando a PostgreSQL:', error.message);
    process.exit(1);
  }

  // Test 2: Cloudinary
  console.log('2️⃣ Probando conexión a Cloudinary...');
  try {
    const result = await cloudinary.api.ping();
    if (result.status === 'ok') {
      console.log('✅ Cloudinary conectado');
      console.log(`   Cloud Name: ${process.env.CLOUDINARY_CLOUD_NAME}\n`);
    } else {
      throw new Error('Cloudinary no responde correctamente');
    }
  } catch (error) {
    console.error('❌ Error conectando a Cloudinary:', error.message);
    console.warn('⚠️  Cloudinary no está configurado o hay un error. Las imágenes no funcionarán.\n');
  }

  // Test 3: Verificar tablas principales
  console.log('3️⃣ Verificando estructura de base de datos...');
  try {
    const tables = [
      'branches', 'users', 'employees', 'inventory_items', 
      'sales', 'customers', 'repairs'
    ];
    
    for (const table of tables) {
      const result = await query(
        `SELECT COUNT(*) as count FROM ${table}`
      );
      console.log(`   ✅ ${table}: ${result.rows[0].count} registros`);
    }
    console.log('');
  } catch (error) {
    console.error('❌ Error verificando tablas:', error.message);
    console.warn('⚠️  Ejecuta las migraciones primero: npm run migrate\n');
  }

  // Test 4: Verificar variables de entorno críticas
  console.log('4️⃣ Verificando variables de entorno...');
  const requiredVars = ['DATABASE_URL', 'JWT_SECRET'];
  const optionalVars = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
  
  let allRequired = true;
  for (const varName of requiredVars) {
    if (process.env[varName]) {
      console.log(`   ✅ ${varName}: Configurada`);
    } else {
      console.error(`   ❌ ${varName}: NO configurada`);
      allRequired = false;
    }
  }
  
  for (const varName of optionalVars) {
    if (process.env[varName]) {
      console.log(`   ✅ ${varName}: Configurada`);
    } else {
      console.warn(`   ⚠️  ${varName}: NO configurada (opcional)`);
    }
  }
  console.log('');

  if (!allRequired) {
    console.error('❌ Faltan variables de entorno requeridas');
    process.exit(1);
  }

  console.log('✅ Todas las pruebas de conexión completadas exitosamente');
  process.exit(0);
}

testConnection();
