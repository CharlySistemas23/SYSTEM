// Script para eliminar código de debugging
const fs = require('fs');
const path = require('path');

const jsDir = path.join(__dirname, 'js');
const files = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'));

console.log(`📁 Limpiando ${files.length} archivos en: ${jsDir}`);

files.forEach(file => {
    const filePath = path.join(jsDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    const originalLength = content.length;
    
    // Eliminar bloques de debugging
    content = content.replace(/\/\/ #region agent log[\s\S]*?\/\/ #endregion\s*/g, '');
    content = content.replace(/fetch\('http:\/\/127\.0\.0\.1:7242\/ingest\/[^']+',\{[^}]+\}\)\.catch\(\(\)=>\{\}\);?\s*/g, '');
    
    const newLength = content.length;
    const removed = originalLength - newLength;
    
    if (removed > 0) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`✅ ${file}: Eliminados ${removed} caracteres`);
    }
});

console.log('✅ Limpieza completada');

