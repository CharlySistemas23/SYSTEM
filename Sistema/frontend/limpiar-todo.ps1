# Script PowerShell para limpiar todos los archivos JS de código de debugging
$jsDir = Join-Path $PSScriptRoot "js"
$files = Get-ChildItem -Path $jsDir -Filter "*.js"

Write-Host "📁 Limpiando $($files.Count) archivos en: $jsDir" -ForegroundColor Cyan

foreach ($file in $files) {
    $filePath = $file.FullName
    $content = Get-Content $filePath -Raw -Encoding UTF8
    $originalLength = $content.Length
    
    # Eliminar bloques completos de debugging
    $content = $content -replace '(?s)// #region agent log.*?// #endregion\s*', ''
    $content = $content -replace "(?s)// ELIMINADO.*?// #endregion\s*", ''
    $content = $content -replace "fetch\('http://127\.0\.0\.1:7242/ingest/[^']+',\{[^}]+\}\)\.catch\(\(\)=>\{\}\);?\s*", ''
    $content = $content -replace "// #endregion\s*", ''
    $content = $content -replace "// ELIMINADO.*?\n", ''
    $content = $content -replace "'[^']*\.js:\d+',message:[^}]+\}\)\.catch\(\(\)=>\{\}\);?\s*", ''
    
    $newLength = $content.Length
    $removed = $originalLength - $newLength
    
    if ($removed -gt 0) {
        Set-Content -Path $filePath -Value $content -NoNewline -Encoding UTF8
        Write-Host "✅ $($file.Name): Eliminados $removed caracteres" -ForegroundColor Green
    } else {
        Write-Host "⏭️  $($file.Name): Sin cambios" -ForegroundColor Gray
    }
}

Write-Host "`n✅ Limpieza completada!" -ForegroundColor Green
Read-Host "Presiona Enter para continuar"

