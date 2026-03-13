// Script para eliminar bloques de logging de debug
const fs = require('fs');
const path = require('path');

const jsDir = path.join(__dirname, 'js');
const files = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'));

files.forEach(file => {
    const filePath = path.join(jsDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Eliminar bloques de agent log
    const regex = /\/\/\s*#region\s+agent\s+log[\s\S]*?\/\/\s*#endregion/g;
    const originalLength = content.length;
    content = content.replace(regex, '');
    const removed = originalLength - content.length;
    
    if (removed > 0) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`✅ ${file}: Eliminados ${removed} caracteres de logging`);
    }
});

console.log('✅ Limpieza completada');
