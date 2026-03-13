// Script de inicio para Railway
// Este script cambia al directorio backend y ejecuta server.js

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { chdir } from 'process';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Intentar encontrar el directorio backend
const backendPath = join(__dirname, 'backend');
const serverPath = join(backendPath, 'server.js');

if (existsSync(serverPath)) {
    console.log('✅ Encontrado backend/server.js, cambiando al directorio backend...');
    chdir(backendPath);
    console.log('✅ Directorio actual:', process.cwd());
    // Importar y ejecutar server.js
    import(serverPath);
} else {
    console.error('❌ Error: No se encontró backend/server.js');
    console.error('   Directorio actual:', __dirname);
    console.error('   Buscando en:', serverPath);
    process.exit(1);
}
