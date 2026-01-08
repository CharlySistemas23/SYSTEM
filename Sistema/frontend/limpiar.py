import os
import re

js_dir = os.path.join(os.path.dirname(__file__), 'js')
files = [f for f in os.listdir(js_dir) if f.endswith('.js')]

print(f'📁 Limpiando {len(files)} archivos en: {js_dir}')

for file in files:
    file_path = os.path.join(js_dir, file)
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original_length = len(content)
    
    # Eliminar bloques de debugging
    content = re.sub(r'// #region agent log.*?// #endregion\s*', '', content, flags=re.DOTALL)
    content = re.sub(r"fetch\('http://127\.0\.0\.1:7242/ingest/[^']+',\{[^}]+\}\)\.catch\(\(\)=>\{\}\);?\s*", '', content)
    
    new_length = len(content)
    removed = original_length - new_length
    
    if removed > 0:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f'✅ {file}: Eliminados {removed} caracteres')

print('✅ Limpieza completada')

