#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para eliminar todas las llamadas fetch a 127.0.0.1:7242 (debugging)
"""

import re
import os
import sys

def clean_fetch_calls(file_path):
    """Elimina todas las llamadas fetch a 127.0.0.1:7242 del archivo"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        original_content = content
        
        # Patrón 1: Líneas completas de fetch a 127.0.0.1:7242 (pueden estar en múltiples líneas)
        # Eliminar líneas que contengan el fetch completo
        pattern1 = r"^\s*fetch\('http://127\.0\.0\.1:7242[^']*',\{[^}]+\}\)\.catch\(\(\)=>\{\}\);?\s*$\n?"
        content = re.sub(pattern1, '', content, flags=re.MULTILINE)
        
        # Patrón 2: Fetch que puede estar en una sola línea muy larga
        pattern2 = r"fetch\('http://127\.0\.0\.1:7242/[^']+',\{[^}]+\}\)\.catch\(\(\)=>\{\}\);?\s*"
        content = re.sub(pattern2, '', content)
        
        # Limpiar líneas vacías múltiples (dejar máximo 2 consecutivas)
        content = re.sub(r'\n{3,}', '\n\n', content)
        
        if content != original_content:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"✓ Limpiado: {file_path}")
            return True
        else:
            print(f"○ Sin cambios: {file_path}")
            return False
    except Exception as e:
        print(f"✗ Error procesando {file_path}: {e}")
        return False

def main():
    """Procesa todos los archivos JS en el directorio"""
    js_dir = os.path.join(os.path.dirname(__file__), 'js')
    
    files_to_clean = [
        'transfers.js',
        'arrival_rules.js',
        'barcodes.js',
        'qa.js'
    ]
    
    cleaned_count = 0
    for filename in files_to_clean:
        file_path = os.path.join(js_dir, filename)
        if os.path.exists(file_path):
            if clean_fetch_calls(file_path):
                cleaned_count += 1
        else:
            print(f"⚠ No encontrado: {file_path}")
    
    print(f"\n✓ Proceso completado. {cleaned_count} archivo(s) limpiado(s).")

if __name__ == '__main__':
    main()

