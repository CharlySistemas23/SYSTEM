@echo off
echo ========================================
echo SUBIENDO CAMBIOS A GITHUB Y VERCEL
echo ========================================
echo.

REM Verificar que Git está instalado
where git >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Git no está instalado o no está en el PATH
    echo Por favor instala Git desde https://git-scm.com/
    pause
    exit /b 1
)

echo [1/5] Verificando estado de Git...
git status
echo.

echo [2/5] Agregando archivos modificados...
git add package.json vercel.json build.js index.html js/pos.js
echo.

echo [3/5] Verificando qué archivos se van a subir...
git status
echo.

echo [4/5] Creando commit...
git commit -m "Fix Vercel: agregar build script para crear directorio public"
echo.

echo [5/5] Subiendo a GitHub...
git push origin main
echo.

echo ========================================
echo COMPLETADO
echo ========================================
echo.
echo Los cambios se han subido a GitHub.
echo Vercel detectará automáticamente los cambios y creará un nuevo deployment.
echo.
echo Espera 1-2 minutos y verifica en:
echo https://vercel.com/dashboard
echo.
pause

