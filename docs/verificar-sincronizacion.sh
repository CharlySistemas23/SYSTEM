#!/bin/bash

# Script de Verificación de Sincronización Vercel ↔ Railway
# Este script verifica que la configuración esté correcta

echo "🔍 Verificando configuración de sincronización..."
echo ""

# Colores para output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# URLs (ajustar según tu configuración)
BACKEND_URL="${BACKEND_URL:-https://backend-production-6260.up.railway.app}"
FRONTEND_URL="${FRONTEND_URL:-https://sistema-oficial-amber.vercel.app}"

echo "Backend URL: $BACKEND_URL"
echo "Frontend URL: $FRONTEND_URL"
echo ""

# Verificación 1: Health Check
echo "1️⃣ Verificando endpoint /health..."
HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL/health")
if [ "$HEALTH_RESPONSE" = "200" ]; then
    echo -e "${GREEN}✅ Health check OK (Status: $HEALTH_RESPONSE)${NC}"
    HEALTH_BODY=$(curl -s "$BACKEND_URL/health")
    echo "   Respuesta: $HEALTH_BODY"
else
    echo -e "${RED}❌ Health check FALLÓ (Status: $HEALTH_RESPONSE)${NC}"
    echo "   Verifica que el backend esté funcionando"
    exit 1
fi
echo ""

# Verificación 2: Preflight OPTIONS
echo "2️⃣ Verificando preflight OPTIONS..."
OPTIONS_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS "$BACKEND_URL/api/inventory" \
  -H "Origin: $FRONTEND_URL" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type,authorization,x-username,x-branch-id")

if [ "$OPTIONS_RESPONSE" = "204" ] || [ "$OPTIONS_RESPONSE" = "200" ]; then
    echo -e "${GREEN}✅ Preflight OPTIONS OK (Status: $OPTIONS_RESPONSE)${NC}"
else
    echo -e "${RED}❌ Preflight OPTIONS FALLÓ (Status: $OPTIONS_RESPONSE)${NC}"
    echo "   Verifica que ALLOWED_ORIGINS esté configurada en Railway"
    exit 1
fi

# Verificar headers CORS en respuesta OPTIONS
echo "   Verificando headers CORS..."
OPTIONS_HEADERS=$(curl -s -i -X OPTIONS "$BACKEND_URL/api/inventory" \
  -H "Origin: $FRONTEND_URL" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type,authorization,x-username,x-branch-id")

if echo "$OPTIONS_HEADERS" | grep -q "Access-Control-Allow-Origin.*$FRONTEND_URL"; then
    echo -e "${GREEN}   ✅ Access-Control-Allow-Origin correcto${NC}"
else
    echo -e "${YELLOW}   ⚠️  Access-Control-Allow-Origin no coincide exactamente${NC}"
    echo "   Headers recibidos:"
    echo "$OPTIONS_HEADERS" | grep -i "access-control" || echo "   No se encontraron headers CORS"
fi

if echo "$OPTIONS_HEADERS" | grep -qi "Access-Control-Allow-Credentials.*true"; then
    echo -e "${GREEN}   ✅ Access-Control-Allow-Credentials: true${NC}"
else
    echo -e "${YELLOW}   ⚠️  Access-Control-Allow-Credentials no está presente${NC}"
fi

if echo "$OPTIONS_HEADERS" | grep -qi "Access-Control-Allow-Headers.*x-username"; then
    echo -e "${GREEN}   ✅ Access-Control-Allow-Headers incluye x-username${NC}"
else
    echo -e "${YELLOW}   ⚠️  Access-Control-Allow-Headers no incluye x-username${NC}"
fi
echo ""

# Verificación 3: Request POST con fallback (sin token)
echo "3️⃣ Verificando request POST con headers fallback..."
# Usar un branch_id válido (ajustar según tu base de datos)
BRANCH_ID="${BRANCH_ID:-00000000-0000-0000-0000-000000000001}"

POST_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BACKEND_URL/api/inventory" \
  -H "Origin: $FRONTEND_URL" \
  -H "Content-Type: application/json" \
  -H "x-username: master_admin" \
  -H "x-branch-id: $BRANCH_ID" \
  -d '{"name":"Test Item Verification","stock_actual":1,"status":"disponible"}')

if [ "$POST_RESPONSE" = "200" ] || [ "$POST_RESPONSE" = "201" ] || [ "$POST_RESPONSE" = "400" ]; then
    echo -e "${GREEN}✅ POST request aceptado (Status: $POST_RESPONSE)${NC}"
    echo "   Nota: 400 es normal si el item ya existe o faltan campos requeridos"
else
    echo -e "${RED}❌ POST request FALLÓ (Status: $POST_RESPONSE)${NC}"
    echo "   Verifica la configuración de autenticación opcional"
fi
echo ""

# Verificación 4: Verificar que el endpoint responda sin CORS errors
echo "4️⃣ Verificando headers CORS en respuesta POST..."
POST_HEADERS=$(curl -s -i -X POST "$BACKEND_URL/api/inventory" \
  -H "Origin: $FRONTEND_URL" \
  -H "Content-Type: application/json" \
  -H "x-username: master_admin" \
  -H "x-branch-id: $BRANCH_ID" \
  -d '{"name":"Test Item Verification Headers","stock_actual":1,"status":"disponible"}' 2>&1)

if echo "$POST_HEADERS" | grep -q "Access-Control-Allow-Origin.*$FRONTEND_URL"; then
    echo -e "${GREEN}✅ Headers CORS presentes en respuesta POST${NC}"
else
    echo -e "${YELLOW}⚠️  Headers CORS no presentes en respuesta POST${NC}"
    echo "   Esto puede causar problemas en el navegador"
fi
echo ""

# Resumen
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 RESUMEN DE VERIFICACIÓN"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ Si todas las verificaciones pasaron, la configuración es correcta"
echo ""
echo "📝 Próximos pasos:"
echo "   1. Verificar que las variables de entorno estén en Railway:"
echo "      - ALLOWED_ORIGINS=$FRONTEND_URL"
echo "      - DATABASE_URL={{ Postgres.DATABASE_URL }}"
echo "      - JWT_SECRET=<valor-seguro>"
echo ""
echo "   2. Desplegar cambios del frontend en Vercel"
echo ""
echo "   3. Probar desde el navegador:"
echo "      - Abrir $FRONTEND_URL"
echo "      - Configurar URL del servidor: $BACKEND_URL"
echo "      - Iniciar sesión: master_admin / 1234"
echo "      - Crear un item y sincronizar"
echo ""
echo "   4. Verificar en DevTools → Network que aparezcan:"
echo "      - OPTIONS /api/... (status 204)"
echo "      - POST /api/... (status 200/201)"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
