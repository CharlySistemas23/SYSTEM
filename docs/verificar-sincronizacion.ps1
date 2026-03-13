# Script de Verificación de Sincronización Vercel ↔ Railway (PowerShell)
# Este script verifica que la configuración esté correcta

Write-Host "🔍 Verificando configuración de sincronización..." -ForegroundColor Cyan
Write-Host ""

# URLs (ajustar según tu configuración)
$BACKEND_URL = if ($env:BACKEND_URL) { $env:BACKEND_URL } else { "https://backend-production-6260.up.railway.app" }
$FRONTEND_URL = if ($env:FRONTEND_URL) { $env:FRONTEND_URL } else { "https://sistema-oficial-amber.vercel.app" }

Write-Host "Backend URL: $BACKEND_URL"
Write-Host "Frontend URL: $FRONTEND_URL"
Write-Host ""

# Verificación 1: Health Check
Write-Host "1️⃣ Verificando endpoint /health..." -ForegroundColor Yellow
try {
    $healthResponse = Invoke-WebRequest -Uri "$BACKEND_URL/health" -Method GET -UseBasicParsing -ErrorAction Stop
    if ($healthResponse.StatusCode -eq 200) {
        Write-Host "✅ Health check OK (Status: $($healthResponse.StatusCode))" -ForegroundColor Green
        Write-Host "   Respuesta: $($healthResponse.Content)"
    } else {
        Write-Host "❌ Health check FALLÓ (Status: $($healthResponse.StatusCode))" -ForegroundColor Red
        Write-Host "   Verifica que el backend esté funcionando" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Error en health check: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Verificación 2: Preflight OPTIONS
Write-Host "2️⃣ Verificando preflight OPTIONS..." -ForegroundColor Yellow
try {
    $optionsHeaders = @{
        "Origin" = $FRONTEND_URL
        "Access-Control-Request-Method" = "POST"
        "Access-Control-Request-Headers" = "content-type,authorization,x-username,x-branch-id"
    }
    
    $optionsResponse = Invoke-WebRequest -Uri "$BACKEND_URL/api/inventory" -Method OPTIONS -Headers $optionsHeaders -UseBasicParsing -ErrorAction Stop
    
    if ($optionsResponse.StatusCode -eq 204 -or $optionsResponse.StatusCode -eq 200) {
        Write-Host "✅ Preflight OPTIONS OK (Status: $($optionsResponse.StatusCode))" -ForegroundColor Green
    } else {
        Write-Host "❌ Preflight OPTIONS FALLÓ (Status: $($optionsResponse.StatusCode))" -ForegroundColor Red
        Write-Host "   Verifica que ALLOWED_ORIGINS esté configurada en Railway" -ForegroundColor Red
        exit 1
    }
    
    # Verificar headers CORS
    Write-Host "   Verificando headers CORS..." -ForegroundColor Gray
    $corsHeaders = $optionsResponse.Headers
    
    if ($corsHeaders["Access-Control-Allow-Origin"] -and $corsHeaders["Access-Control-Allow-Origin"].Contains($FRONTEND_URL)) {
        Write-Host "   ✅ Access-Control-Allow-Origin correcto" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Access-Control-Allow-Origin no coincide exactamente" -ForegroundColor Yellow
        Write-Host "   Valor recibido: $($corsHeaders['Access-Control-Allow-Origin'])"
    }
    
    if ($corsHeaders["Access-Control-Allow-Credentials"] -eq "true") {
        Write-Host "   ✅ Access-Control-Allow-Credentials: true" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Access-Control-Allow-Credentials no está presente" -ForegroundColor Yellow
    }
    
    $allowedHeaders = $corsHeaders["Access-Control-Allow-Headers"]
    if ($allowedHeaders -and $allowedHeaders.Contains("x-username")) {
        Write-Host "   ✅ Access-Control-Allow-Headers incluye x-username" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Access-Control-Allow-Headers no incluye x-username" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Error en preflight OPTIONS: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   Verifica que ALLOWED_ORIGINS esté configurada en Railway" -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# Verificación 3: Request POST con fallback (sin token)
Write-Host "3️⃣ Verificando request POST con headers fallback..." -ForegroundColor Yellow
$BRANCH_ID = if ($env:BRANCH_ID) { $env:BRANCH_ID } else { "00000000-0000-0000-0000-000000000001" }

try {
    $postHeaders = @{
        "Origin" = $FRONTEND_URL
        "Content-Type" = "application/json"
        "x-username" = "master_admin"
        "x-branch-id" = $BRANCH_ID
    }
    
    $postBody = @{
        name = "Test Item Verification"
        stock_actual = 1
        status = "disponible"
    } | ConvertTo-Json
    
    $postResponse = Invoke-WebRequest -Uri "$BACKEND_URL/api/inventory" -Method POST -Headers $postHeaders -Body $postBody -UseBasicParsing -ErrorAction Stop
    
    if ($postResponse.StatusCode -eq 200 -or $postResponse.StatusCode -eq 201 -or $postResponse.StatusCode -eq 400) {
        Write-Host "✅ POST request aceptado (Status: $($postResponse.StatusCode))" -ForegroundColor Green
        Write-Host "   Nota: 400 es normal si el item ya existe o faltan campos requeridos" -ForegroundColor Gray
    } else {
        Write-Host "❌ POST request FALLÓ (Status: $($postResponse.StatusCode))" -ForegroundColor Red
    }
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 400 -or $statusCode -eq 401 -or $statusCode -eq 403) {
        Write-Host "⚠️  POST request recibido pero con error (Status: $statusCode)" -ForegroundColor Yellow
        Write-Host "   Esto puede ser normal si faltan campos requeridos o hay problemas de autenticación" -ForegroundColor Gray
    } else {
        Write-Host "❌ Error en POST request: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "   Verifica la configuración de autenticación opcional" -ForegroundColor Yellow
    }
}
Write-Host ""

# Resumen
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "📊 RESUMEN DE VERIFICACIÓN" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""
Write-Host "✅ Si todas las verificaciones pasaron, la configuración es correcta" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Próximos pasos:" -ForegroundColor Yellow
Write-Host "   1. Verificar que las variables de entorno estén en Railway:"
Write-Host "      - ALLOWED_ORIGINS=$FRONTEND_URL"
Write-Host "      - DATABASE_URL={{ Postgres.DATABASE_URL }}"
Write-Host "      - JWT_SECRET=<valor-seguro>"
Write-Host ""
Write-Host "   2. Desplegar cambios del frontend en Vercel"
Write-Host ""
Write-Host "   3. Probar desde el navegador:"
Write-Host "      - Abrir $FRONTEND_URL"
Write-Host "      - Configurar URL del servidor: $BACKEND_URL"
Write-Host "      - Iniciar sesión: master_admin / 1234"
Write-Host "      - Crear un item y sincronizar"
Write-Host ""
Write-Host "   4. Verificar en DevTools → Network que aparezcan:"
Write-Host "      - OPTIONS /api/... (status 204)"
Write-Host "      - POST /api/... (status 200/201)"
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
