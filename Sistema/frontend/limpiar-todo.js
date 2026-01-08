const fs = require('fs');
const path = require('path');

const jsDir = path.join(__dirname, 'js');
const files = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'));

console.log(`📁 Limpiando ${files.length} archivos en: ${jsDir}\n`);

let totalRemoved = 0;

files.forEach(file => {
    const filePath = path.join(jsDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    const originalLength = content.length;
    
    // Eliminar bloques de debugging con diferentes patrones
    // Patrón 1: // #region agent log ... // #endregion (multilínea)
    content = content.replace(/\/\/ #region agent log[\s\S]*?\/\/ #endregion\s*/g, '');
    
    // Patrón 2: fetch a 127.0.0.1:7242 que puedan quedar sueltos
    content = content.replace(/fetch\('http:\/\/127\.0\.0\.1:7242\/ingest\/[^']+',\{[^}]+\}\)\.catch\(\(\)=>\{\}\);?\s*/g, '');
    
    // Patrón 3: Líneas que solo contengan fetch a 127.0.0.1:7242
    content = content.replace(/^\s*fetch\('http:\/\/127\.0\.0\.1:7242\/[^']+',\{[^}]+\}\)\.catch\(\(\)=>\{\}\);?\s*$/gm, '');
    
    const newLength = content.length;
    const removed = originalLength - newLength;
    
    if (removed > 0) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`✅ ${file}: Eliminados ${removed} caracteres`);
        totalRemoved += removed;
    }
});

console.log(`\n✅ Limpieza completada! Total eliminado: ${totalRemoved} caracteres`);

