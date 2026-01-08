@echo off
echo Limpiando archivos de debugging...
cd /d "%~dp0js"

for %%f in (*.js) do (
    echo Procesando: %%f
    powershell -Command "(Get-Content '%%f' -Raw) -replace '(?s)// #region agent log.*?// #endregion\s*', '' -replace 'fetch\(''http://127\.0\.0\.1:7242/ingest/[^'']+'',\{[^}]+\}\)\.catch\(\(\)=>\{\}\);?\s*', '' | Set-Content '%%f' -NoNewline"
)

echo.
echo Limpieza completada!
pause

