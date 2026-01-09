// Script para copiar frontend durante el build en Railway
import { cpSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sourcePath = join(__dirname, '..', 'frontend');
const destPath = join(__dirname, 'frontend');

console.log('📦 Verificando frontend para copiar...');
console.log(`   Origen: ${sourcePath}`);
console.log(`   Destino: ${destPath}`);

if (existsSync(sourcePath)) {
    if (existsSync(join(sourcePath, 'index.html'))) {
        try {
            cpSync(sourcePath, destPath, { recursive: true, force: false });
            console.log('✅ Frontend copiado exitosamente a servidor-railway/frontend');
        } catch (error) {
            if (error.code === 'EEXIST') {
                console.log('ℹ️  Frontend ya existe en destino, omitiendo copia');
            } else {
                console.error('❌ Error copiando frontend:', error.message);
                process.exit(1);
            }
        }
    } else {
        console.warn('⚠️  No se encontró index.html en la carpeta frontend');
    }
} else {
    console.warn(`⚠️  No se encontró la carpeta frontend en: ${sourcePath}`);
    console.warn('   El frontend puede no estar disponible en Railway');
}

