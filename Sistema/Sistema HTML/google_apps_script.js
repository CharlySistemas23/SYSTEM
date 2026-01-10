/**
 * Google Apps Script Web App para sincronización Opal & Co POS
 * 
 * INSTRUCCIONES DE DEPLOY:
 * 1. Abre Google Sheets
 * 2. Ve a Extensiones → Apps Script
 * 3. Pega este código completo
 * 4. Guarda el proyecto (Ctrl+S)
 * 5. Ve a Implementar → Nueva implementación
 * 6. Tipo: Aplicación web
 * 7. Ejecutar como: Yo
 * 8. Quién tiene acceso: Cualquiera
 * 9. Click en Implementar
 * 10. Copia la URL de la aplicación web
 * 11. Genera un TOKEN seguro (puedes usar: Utilities.getUuid() en la consola)
 * 12. Configura la URL y TOKEN en el sistema POS
 */

// CONFIGURACIÓN
const CONFIG = {
  TOKEN: 'opal-co-sync-8f3k9m2x7p4w1n6v', // Token configurado
  SPREADSHEET_ID: null // Ya no se usa directamente, se guarda en PropertiesService
};

// Nombres de hojas
const SHEETS = {
  SALES: 'SALES',
  ITEMS: 'ITEMS',
  PAYMENTS: 'PAYMENTS',
  INVENTORY: 'INVENTORY',
  INVENTORY_LOG: 'INVENTORY_LOG',
  EMPLOYEES: 'EMPLOYEES',
  USERS: 'USERS',
  REPAIRS: 'REPAIRS',
  COSTS: 'COSTS',
  AUDIT_LOG: 'AUDIT_LOG',
  TOURIST_DAILY_REPORTS: 'TOURIST_DAILY_REPORTS',
  TOURIST_DAILY_LINES: 'TOURIST_DAILY_LINES',
  ARRIVAL_RATE_RULES: 'ARRIVAL_RATE_RULES',
  AGENCY_ARRIVALS: 'AGENCY_ARRIVALS',
  DAILY_PROFIT_REPORTS: 'DAILY_PROFIT_REPORTS',
  EXCHANGE_RATES_DAILY: 'EXCHANGE_RATES_DAILY',
  INVENTORY_TRANSFERS: 'INVENTORY_TRANSFERS',
  INVENTORY_TRANSFER_ITEMS: 'INVENTORY_TRANSFER_ITEMS',
  CATALOG_BRANCHES: 'CATALOG_BRANCHES',
  CATALOG_AGENCIES: 'CATALOG_AGENCIES',
  CATALOG_SELLERS: 'CATALOG_SELLERS',
  CATALOG_GUIDES: 'CATALOG_GUIDES',
  CUSTOMERS: 'CUSTOMERS'
};

// Configuración multisucursal
const MULTI_BRANCH_CONFIG = {
  SEPARATE_SHEETS: true, // true = hojas separadas por sucursal, false = una hoja con columna branch_id
  BRANCH_SHEET_SUFFIX: '_BRANCH_' // Sufijo para hojas por sucursal
};

/**
 * Obtener o crear hoja por sucursal
 * @param {Spreadsheet} ss - Spreadsheet
 * @param {string} baseSheetName - Nombre base de la hoja
 * @param {string} branchId - ID de la sucursal
 * @param {string} branchName - Nombre de la sucursal (opcional)
 * @returns {Sheet} Hoja correspondiente
 */
function getOrCreateBranchSheet(ss, baseSheetName, branchId, branchName = null) {
  // Validar que ss no sea undefined
  if (!ss) {
    throw new Error('Spreadsheet (ss) es undefined. Asegúrate de obtener el spreadsheet primero.');
  }
  
  if (!MULTI_BRANCH_CONFIG.SEPARATE_SHEETS) {
    // Si no se separan hojas, usar la hoja base
    return getOrCreateSheet(ss, baseSheetName);
  }
  
  // Crear nombre de hoja con sufijo de sucursal
  const branchDisplayName = branchName || branchId || 'UNKNOWN';
  const sheetName = baseSheetName + MULTI_BRANCH_CONFIG.BRANCH_SHEET_SUFFIX + branchDisplayName;
  
  // Limitar longitud del nombre (Google Sheets tiene límite de 100 caracteres)
  const maxLength = 100 - MULTI_BRANCH_CONFIG.BRANCH_SHEET_SUFFIX.length;
  const safeSheetName = sheetName.length > maxLength 
    ? baseSheetName + MULTI_BRANCH_CONFIG.BRANCH_SHEET_SUFFIX + branchId.substring(0, 20)
    : sheetName;
  
  return getOrCreateSheet(ss, safeSheetName);
}

/**
 * Obtener o crear hoja
 * @param {Spreadsheet} ss - Spreadsheet
 * @param {string} sheetName - Nombre de la hoja
 * @returns {Sheet} Hoja
 */
function getOrCreateSheet(ss, sheetName) {
  // Validar que ss no sea undefined
  if (!ss) {
    throw new Error('Spreadsheet (ss) es undefined. Asegúrate de llamar getOrCreateSpreadsheet() primero.');
  }
  
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    // Agregar headers si es una hoja base conocida
    const baseSheetName = Object.values(SHEETS).find(base => sheetName.startsWith(base));
    if (baseSheetName) {
      addHeaders(sheet, baseSheetName);
    }
  }
  return sheet;
}

/**
 * Función para manejar peticiones GET (pruebas de conexión)
 */
function doGet(e) {
  // Respuesta simple para pruebas de conexión
  const response = {
    success: true,
    message: 'Google Apps Script funcionando correctamente',
    timestamp: new Date().toISOString(),
    version: '1.0'
  };
  
  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON)
    .setHeaders({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
}

/**
 * FUNCIÓN DE PRUEBA - Ejecutar esta función desde el editor para probar el script
 * Selecciona esta función en el menú desplegable y click en "Ejecutar"
 */
function testScript() {
  try {
    Logger.log('=== INICIANDO PRUEBA DEL SCRIPT ===');
    
    // 1. Probar que el spreadsheet se puede crear/abrir
    Logger.log('1. Probando getOrCreateSpreadsheet()...');
    const ss = getOrCreateSpreadsheet();
    Logger.log('✓ Spreadsheet obtenido/creado: ' + ss.getName());
    Logger.log('✓ Spreadsheet ID: ' + ss.getId());
    Logger.log('✓ URL: ' + ss.getUrl());
    
    // 2. Probar que las hojas se crean correctamente
    Logger.log('2. Probando createAllSheets()...');
    createAllSheets(ss);
    const sheetNames = ss.getSheets().map(s => s.getName());
    Logger.log('✓ Hojas creadas: ' + sheetNames.join(', '));
    
    // 3. Probar doGet (simular petición GET)
    Logger.log('3. Probando doGet()...');
    const getResult = doGet({});
    Logger.log('✓ doGet ejecutado correctamente');
    
    // 4. Probar doPost con datos de prueba
    Logger.log('4. Probando doPost() con datos de prueba...');
    const testPostData = {
      postData: {
        contents: JSON.stringify({
          token: CONFIG.TOKEN,
          entity_type: 'sale',
          records: [{
            id: 'test-1',
            created_at: new Date().toISOString(),
            total: 100,
            status: 'completada',
            branch_id: 'test-branch'
          }],
          device_id: 'test-device',
          timestamp: new Date().toISOString()
        })
      }
    };
    
    const postResult = doPost(testPostData);
    Logger.log('✓ doPost ejecutado correctamente');
    
    // 5. Verificar que los datos se guardaron
    Logger.log('5. Verificando que los datos se guardaron...');
    const salesSheet = getOrCreateSheet(ss, SHEETS.SALES);
    const lastRow = salesSheet.getLastRow();
    Logger.log('✓ Última fila en SALES: ' + lastRow);
    
    if (lastRow > 1) {
      const testData = salesSheet.getRange(lastRow, 1, 1, 5).getValues()[0];
      Logger.log('✓ Datos encontrados en la última fila: ' + JSON.stringify(testData));
    }
    
    Logger.log('=== PRUEBA COMPLETADA EXITOSAMENTE ===');
    Logger.log('✓ El script está funcionando correctamente');
    Logger.log('✓ Puedes desplegar el script como aplicación web');
    Logger.log('✓ URL del Spreadsheet: ' + ss.getUrl());
    Logger.log('✓ IMPORTANTE: El ID del spreadsheet está guardado en PropertiesService');
    Logger.log('✓ Todas las futuras ejecuciones usarán ESTE MISMO spreadsheet');
    Logger.log('✓ NO se crearán spreadsheets adicionales');
    
    return {
      success: true,
      message: 'Prueba completada exitosamente',
      spreadsheetUrl: ss.getUrl(),
      spreadsheetId: ss.getId(),
      sheetsCreated: sheetNames
    };
    
  } catch (error) {
    Logger.log('=== ERROR EN LA PRUEBA ===');
    Logger.log('Error: ' + error.toString());
    Logger.log('Stack: ' + error.stack);
    throw error;
  }
}

/**
 * Función para manejar CORS (OPTIONS request)
 * CRÍTICO: Esta función debe existir para manejar preflight requests
 */
function doOptions(e) {
  Logger.log('doOptions llamado - Preflight request recibido');
  return ContentService.createTextOutput('')
    .setMimeType(ContentService.MimeType.JSON)
    .setHeaders({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '3600'
    });
}

/**
 * Función principal que recibe las peticiones POST
 */
function doPost(e) {
  try {
    // Configurar headers CORS
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };
    // Validar que hay datos POST
    if (!e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'No se recibieron datos'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Parsear datos (puede venir como JSON o text/plain con JSON dentro)
    let data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseError) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'Error parseando JSON: ' + parseError.message
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Validar token
    if (!data.token || data.token !== CONFIG.TOKEN) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'Token inválido o no proporcionado'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const entityType = data.entity_type;
    const records = data.records || [];
    const deletes = data.deletes || []; // Eliminaciones separadas
    const deviceId = data.device_id || 'unknown';
    
    // Obtener o crear spreadsheet
    const ss = getOrCreateSpreadsheet();
    
    // Procesar según tipo de entidad
    let result;
    switch (entityType) {
      case 'sale':
        result = processSales(ss, records);
        break;
      case 'inventory_item':
        result = processInventory(ss, records, deletes);
        break;
      case 'employee':
        result = processEmployees(ss, records);
        break;
      case 'repair':
        result = processRepairs(ss, records);
        break;
      case 'cost_entry':
        result = processCosts(ss, records);
        break;
      case 'tourist_report':
        result = processTouristReports(ss, records);
        break;
      case 'arrival_rate_rule':
        result = processArrivalRateRules(ss, records);
        break;
      case 'agency_arrival':
        result = processAgencyArrivals(ss, records);
        break;
      case 'daily_profit_report':
        result = processDailyProfitReports(ss, records);
        break;
      case 'inventory_transfer':
        result = processInventoryTransfers(ss, records);
        break;
      case 'catalog_branch':
        result = processCatalogBranches(ss, records);
        break;
      case 'catalog_agency':
        result = processCatalogAgencies(ss, records);
        break;
      case 'catalog_seller':
        result = processCatalogSellers(ss, records);
        break;
      case 'catalog_guide':
        result = processCatalogGuides(ss, records);
        break;
      case 'customer':
        result = processCustomers(ss, records);
        break;
      case 'user':
        result = processUsers(ss, records);
        break;
      case 'exchange_rate_daily':
        result = processExchangeRatesDaily(ss, records);
        break;
      case 'payment':
        result = processPayments(ss, records);
        break;
      case 'cash_session':
        result = processCashSessions(ss, records);
        break;
      case 'cash_movement':
        result = processCashMovements(ss, records);
        break;
      case 'inventory_log':
        result = processInventoryLogs(ss, records);
        break;
      case 'audit_log':
        result = processAuditLogs(ss, records);
        break;
      default:
        result = { success: false, error: 'Tipo de entidad no reconocido: ' + entityType };
    }
    
    // Actualizar índice después de procesar
    try {
      updateIndexSheet(ss);
    } catch (indexError) {
      Logger.log('⚠ Error actualizando índice: ' + indexError.message);
    }
    
    // Asegurar que los headers CORS estén en todas las respuestas
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON)
      .setHeaders({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      
  } catch (error) {
    // Asegurar headers CORS incluso en errores
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString(),
      stack: error.stack
    })).setMimeType(ContentService.MimeType.JSON)
      .setHeaders({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
  }
}

/**
 * Obtener o crear el spreadsheet (SIEMPRE usa el mismo, no crea múltiples)
 */
function getOrCreateSpreadsheet() {
  const SPREADSHEET_NAME = 'Opal & Co - Sincronización POS';
  const PROPERTIES_KEY = 'OPAL_POS_SPREADSHEET_ID';
  
  // 1. Intentar obtener ID guardado en PropertiesService
  const properties = PropertiesService.getScriptProperties();
  let savedId = properties.getProperty(PROPERTIES_KEY);
  
  // 2. Si hay ID guardado, intentar abrirlo
  if (savedId) {
    try {
      const ss = SpreadsheetApp.openById(savedId);
      // Verificar que el spreadsheet sigue existiendo y es accesible
      const name = ss.getName();
      Logger.log('✓ Spreadsheet encontrado por ID guardado: ' + name);
      return ss;
    } catch (e) {
      Logger.log('⚠ Spreadsheet guardado no encontrado, buscando por nombre...');
      // Si falla, eliminar el ID guardado y buscar por nombre
      properties.deleteProperty(PROPERTIES_KEY);
      savedId = null;
    }
  }
  
  // 3. Si no hay ID guardado o falló, buscar por nombre en el Drive
  try {
    const files = DriveApp.getFilesByName(SPREADSHEET_NAME);
    if (files.hasNext()) {
      const file = files.next();
      const ss = SpreadsheetApp.openById(file.getId());
      const ssId = file.getId();
      
      // Guardar el ID para futuras ejecuciones
      properties.setProperty(PROPERTIES_KEY, ssId);
      
      Logger.log('✓ Spreadsheet existente encontrado por nombre: ' + ss.getName());
      Logger.log('✓ ID guardado para futuras ejecuciones: ' + ssId);
      
      // Asegurar que tiene todas las hojas necesarias
      createAllSheets(ss);
      
      return ss;
    }
  } catch (e) {
    Logger.log('⚠ Error buscando spreadsheet por nombre: ' + e.message);
  }
  
  // 4. Si no existe ninguno, crear uno nuevo SOLO UNA VEZ
  Logger.log('ℹ Creando nuevo spreadsheet (esto solo debería pasar la primera vez)');
  const ss = SpreadsheetApp.create(SPREADSHEET_NAME);
  const ssId = ss.getId();
  
  // Crear todas las hojas
  createAllSheets(ss);
  
  // Guardar el ID en PropertiesService para futuras ejecuciones
  properties.setProperty(PROPERTIES_KEY, ssId);
  
  Logger.log('✓ Nuevo spreadsheet creado: ' + ss.getName());
  Logger.log('✓ Spreadsheet ID: ' + ssId);
  Logger.log('✓ URL: ' + ss.getUrl());
  Logger.log('✓ ID guardado en PropertiesService para futuras ejecuciones');
  
  return ss;
}

/**
 * Crear todas las hojas necesarias con formato bonito
 */
function createAllSheets(ss) {
  const sheetNames = Object.values(SHEETS);
  
  sheetNames.forEach(sheetName => {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      // Agregar headers según la hoja (esto también aplica el formato)
      addHeaders(sheet, sheetName);
    } else {
      // Si la hoja ya existe, asegurar que tenga formato
      const numColumns = sheet.getLastColumn() || 1;
      if (numColumns > 0) {
        applySheetFormatting(sheet, sheetName, numColumns);
      }
    }
  });
  
  // Eliminar hoja por defecto si existe
  const defaultSheet = ss.getSheetByName('Hoja 1');
  if (defaultSheet && sheetNames.length > 0) {
    ss.deleteSheet(defaultSheet);
  }
  
  // Crear hoja de índice/dashboard (opcional)
  createIndexSheet(ss);
}

/**
 * Crear hoja índice con información del sistema
 */
function createIndexSheet(ss) {
  let indexSheet = ss.getSheetByName('📊 ÍNDICE');
  if (!indexSheet) {
    indexSheet = ss.insertSheet('📊 ÍNDICE', 0); // Insertar al inicio
    
    const title = 'OPAL & CO - SISTEMA POS';
    const subtitle = 'Panel de Control y Sincronización';
    
    // Título principal
    indexSheet.getRange(1, 1).setValue(title);
    indexSheet.getRange(1, 1).setFontSize(24);
    indexSheet.getRange(1, 1).setFontWeight('bold');
    indexSheet.getRange(1, 1).setFontColor('#1a1a1a');
    indexSheet.getRange(1, 1, 1, 3).merge();
    indexSheet.setRowHeight(1, 40);
    
    // Subtítulo
    indexSheet.getRange(2, 1).setValue(subtitle);
    indexSheet.getRange(2, 1).setFontSize(14);
    indexSheet.getRange(2, 1).setFontColor('#6c757d');
    indexSheet.getRange(2, 1, 1, 3).merge();
    indexSheet.setRowHeight(2, 30);
    
    // Información de hojas
    indexSheet.getRange(4, 1).setValue('HOJAS DISPONIBLES');
    indexSheet.getRange(4, 1).setFontSize(16);
    indexSheet.getRange(4, 1).setFontWeight('bold');
    indexSheet.getRange(4, 1, 1, 3).merge();
    indexSheet.setRowHeight(4, 35);
    
    // Lista de hojas con descripciones
    const sheetsInfo = [
      ['SALES', 'Ventas realizadas en el sistema POS'],
      ['ITEMS', 'Detalle de productos vendidos en cada venta'],
      ['PAYMENTS', 'Pagos realizados en cada venta (métodos, bancos, comisiones)'],
      ['INVENTORY', 'Catálogo completo de productos en inventario'],
      ['INVENTORY_LOG', 'Historial de movimientos de inventario'],
      ['EMPLOYEES', 'Lista de empleados del sistema'],
      ['USERS', 'Usuarios con acceso al sistema POS'],
      ['REPAIRS', 'Registro de reparaciones realizadas'],
      ['COSTS', 'Registro de costos fijos y variables'],
      ['AUDIT_LOG', 'Log de auditoría de acciones del sistema'],
      ['TOURIST_DAILY_REPORTS', 'Reportes diarios de ventas a turistas'],
      ['TOURIST_DAILY_LINES', 'Líneas detalladas de reportes turistas'],
      ['ARRIVAL_RATE_RULES', 'Tabulador maestro de tarifas de llegadas por agencia'],
      ['AGENCY_ARRIVALS', 'Registro de llegadas de pasajeros por agencia'],
      ['DAILY_PROFIT_REPORTS', 'Reportes de utilidad diaria antes de impuestos'],
      ['EXCHANGE_RATES_DAILY', 'Tipos de cambio diarios (USD, CAD)'],
      ['INVENTORY_TRANSFERS', 'Transferencias de inventario entre sucursales'],
      ['INVENTORY_TRANSFER_ITEMS', 'Items incluidos en cada transferencia'],
      ['CATALOG_BRANCHES', 'Catálogo de sucursales (incluye datos empresariales por sucursal)'],
      ['CATALOG_AGENCIES', 'Catálogo de agencias'],
      ['CATALOG_SELLERS', 'Catálogo de vendedores'],
      ['CATALOG_GUIDES', 'Catálogo de guías'],
      ['CUSTOMERS', 'Catálogo de clientes']
    ];
    
    // Headers de la tabla
    indexSheet.getRange(5, 1).setValue('Hoja');
    indexSheet.getRange(5, 2).setValue('Descripción');
    indexSheet.getRange(5, 3).setValue('Total Registros');
    
    const headerRange = indexSheet.getRange(5, 1, 1, 3);
    headerRange.setBackground('#4285F4');
    headerRange.setFontColor('#FFFFFF');
    headerRange.setFontWeight('bold');
    headerRange.setHorizontalAlignment('center');
    headerRange.setBorder(true, true, true, true, true, true);
    
    // Datos de las hojas
    sheetsInfo.forEach((info, index) => {
      const row = index + 6;
      indexSheet.getRange(row, 1).setValue(info[0]);
      indexSheet.getRange(row, 2).setValue(info[1]);
      
      // Contar registros en cada hoja
      const targetSheet = ss.getSheetByName(info[0]);
      if (targetSheet) {
        const rowCount = Math.max(0, targetSheet.getLastRow() - 1); // -1 por el header
        indexSheet.getRange(row, 3).setValue(rowCount);
        indexSheet.getRange(row, 3).setNumberFormat('#,##0');
      } else {
        indexSheet.getRange(row, 3).setValue(0);
      }
      
      // Formato alternado de filas
      const rowRange = indexSheet.getRange(row, 1, 1, 3);
      if (index % 2 === 0) {
        rowRange.setBackground('#F8F9FA');
      } else {
        rowRange.setBackground('#FFFFFF');
      }
      rowRange.setBorder(null, null, null, null, null, true, '#E0E0E0', SpreadsheetApp.BorderStyle.SOLID);
    });
    
    // Ajustar anchos de columna
    indexSheet.setColumnWidth(1, 200);
    indexSheet.setColumnWidth(2, 400);
    indexSheet.setColumnWidth(3, 120);
    
    // Información adicional
    const infoRow = sheetsInfo.length + 8;
    indexSheet.getRange(infoRow, 1).setValue('📌 NOTA:');
    indexSheet.getRange(infoRow, 1).setFontWeight('bold');
    indexSheet.getRange(infoRow, 2).setValue('Las hojas se actualizan automáticamente cuando se sincroniza el sistema POS.');
    indexSheet.getRange(infoRow, 2, 1, 2).merge();
    indexSheet.setRowHeight(infoRow, 30);
    
    // Congelar filas superiores
    indexSheet.setFrozenRows(5);
  }
}

/**
 * Actualizar hoja índice con conteos actualizados
 */
function updateIndexSheet(ss) {
  try {
    let indexSheet = ss.getSheetByName('📊 ÍNDICE');
    if (!indexSheet) {
      // Si no existe, crearla
      createIndexSheet(ss);
      indexSheet = ss.getSheetByName('📊 ÍNDICE');
      if (!indexSheet) return;
    }
    
    // Lista de hojas con sus nombres (mismo orden que en createIndexSheet)
    const sheetsInfo = [
      ['SALES', 'Ventas realizadas en el sistema POS'],
      ['ITEMS', 'Detalle de productos vendidos en cada venta'],
      ['PAYMENTS', 'Pagos realizados en cada venta (métodos, bancos, comisiones)'],
      ['INVENTORY', 'Catálogo completo de productos en inventario'],
      ['INVENTORY_LOG', 'Historial de movimientos de inventario'],
      ['EMPLOYEES', 'Lista de empleados del sistema'],
      ['USERS', 'Usuarios con acceso al sistema POS'],
      ['REPAIRS', 'Registro de reparaciones realizadas'],
      ['COSTS', 'Registro de costos fijos y variables'],
      ['AUDIT_LOG', 'Log de auditoría de acciones del sistema'],
      ['TOURIST_DAILY_REPORTS', 'Reportes diarios de ventas a turistas'],
      ['TOURIST_DAILY_LINES', 'Líneas detalladas de reportes turistas'],
      ['ARRIVAL_RATE_RULES', 'Tabulador maestro de tarifas de llegadas por agencia'],
      ['AGENCY_ARRIVALS', 'Registro de llegadas de pasajeros por agencia'],
      ['DAILY_PROFIT_REPORTS', 'Reportes de utilidad diaria antes de impuestos'],
      ['EXCHANGE_RATES_DAILY', 'Tipos de cambio diarios (USD, CAD)'],
      ['INVENTORY_TRANSFERS', 'Transferencias de inventario entre sucursales'],
      ['INVENTORY_TRANSFER_ITEMS', 'Items incluidos en cada transferencia'],
      ['CATALOG_BRANCHES', 'Catálogo de sucursales (incluye datos empresariales por sucursal)'],
      ['CATALOG_AGENCIES', 'Catálogo de agencias'],
      ['CATALOG_SELLERS', 'Catálogo de vendedores'],
      ['CATALOG_GUIDES', 'Catálogo de guías'],
      ['CUSTOMERS', 'Catálogo de clientes']
    ];
    
    // Actualizar conteos
    sheetsInfo.forEach((info, index) => {
      const row = index + 6; // Fila 6 en adelante
      const sheetName = info[0];
      
      // Contar registros - incluir hojas por sucursal si existen
      let totalCount = 0;
      
      // Primero contar en la hoja principal
      const mainSheet = ss.getSheetByName(sheetName);
      if (mainSheet && mainSheet.getLastRow() > 1) {
        totalCount += Math.max(0, mainSheet.getLastRow() - 1); // -1 por el header
      }
      
      // Luego contar en todas las hojas por sucursal (ej: SALES_BRANCH_test-branch)
      const allSheets = ss.getSheets();
      allSheets.forEach(sheet => {
        const sheetName_lower = sheet.getName().toUpperCase();
        const prefix_lower = sheetName.toUpperCase() + MULTI_BRANCH_CONFIG.BRANCH_SHEET_SUFFIX.toUpperCase();
        if (sheetName_lower.startsWith(prefix_lower) && sheet.getLastRow() > 1) {
          totalCount += Math.max(0, sheet.getLastRow() - 1); // -1 por el header
        }
      });
      
      // Actualizar el valor en la columna 3 (Total Registros)
      indexSheet.getRange(row, 3).setValue(totalCount);
      indexSheet.getRange(row, 3).setNumberFormat('#,##0');
    });
    
  } catch (error) {
    Logger.log('⚠ Error actualizando índice: ' + error.message);
  }
}

/**
 * Agregar headers a cada hoja con formato bonito
 */
function addHeaders(sheet, sheetName) {
  let headers = [];
  
  switch (sheetName) {
    case SHEETS.SALES:
      headers = ['ID', 'Folio', 'Sucursal', 'Vendedor', 'Agencia', 'Guía', 'Cliente', 'Pasajeros', 
                'Moneda', 'Tipo Cambio', 'Subtotal', 'Descuento', 'Total', 'Comisión Vendedor', 
                'Comisión Guía', 'Estado', 'Notas', 'Fecha Creación', 'Fecha Actualización', 'Dispositivo', 'Sincronizado'];
      break;
    case SHEETS.ITEMS:
      headers = ['ID', 'ID Venta', 'ID Producto', 'Cantidad', 'Precio', 'Costo', 'Descuento', 'Subtotal', 'Comisión', 'Fecha Creación'];
      break;
    case SHEETS.PAYMENTS:
      headers = ['ID', 'ID Venta', 'Método Pago', 'Monto', 'Moneda', 'Banco', 'Tipo Pago', 'Comisión Banco', 'Fecha Creación'];
      break;
    case SHEETS.INVENTORY:
      headers = ['ID', 'SKU', 'Código Barras', 'Nombre', 'Metal', 'Piedra', 'Talla', 'Peso (g)', 
                'Medidas', 'Costo', 'Precio', 'Ubicación', 'Estado', 'Sucursal', 
                'Fecha Creación', 'Fecha Actualización', 'Dispositivo', 'Sincronizado'];
      break;
    case SHEETS.INVENTORY_LOG:
      headers = ['ID', 'ID Producto', 'Acción', 'Cantidad', 'Notas', 'Fecha'];
      break;
    case SHEETS.EMPLOYEES:
      headers = ['ID', 'Nombre', 'Rol', 'Sucursal', 'Activo', 'Código Barras', 'Fecha Creación'];
      break;
    case SHEETS.USERS:
      headers = ['ID', 'Usuario', 'ID Empleado', 'Rol', 'Activo', 'Fecha Creación'];
      break;
    case SHEETS.REPAIRS:
      headers = ['ID', 'Folio', 'ID Cliente', 'ID Pieza', 'Descripción', 'Estado', 
                'Costo', 'Fecha Creación', 'Fecha Actualización', 'Dispositivo', 'Sincronizado'];
      break;
    case SHEETS.COSTS:
      headers = ['ID', 'Tipo', 'Categoría', 'Monto', 'Sucursal', 'Fecha', 'Notas', 
                'Fecha Creación', 'Dispositivo', 'Sincronizado'];
      break;
    case SHEETS.AUDIT_LOG:
      headers = ['ID', 'ID Usuario', 'Acción', 'Tipo Entidad', 'ID Entidad', 'Detalles', 'Fecha'];
      break;
    case SHEETS.TOURIST_DAILY_REPORTS:
      headers = ['ID', 'Fecha', 'Sucursal', 'Tipo Cambio', 'Estado', 'Observaciones',
                'Total Cash USD', 'Total Cash MXN', 'Subtotal', 'Adicional', 'Total',
                'Fecha Creación', 'Fecha Actualización', 'Dispositivo', 'Sincronizado'];
      break;
    case SHEETS.TOURIST_DAILY_LINES:
      headers = ['ID', 'ID Reporte', 'ID Venta', 'Identificación', 'Vendedor', 'Guía', 
                'Agencia', 'Cantidad', 'Peso (g)', 'Productos', 'Tipo Cambio',
                'Cash EUR', 'Cash CAD', 'Cash USD', 'Cash MXN', 'TPV Visa/MC', 'TPV Amex',
                'Total', 'Fecha Creación'];
      break;
    case SHEETS.ARRIVAL_RATE_RULES:
      headers = ['ID', 'ID Agencia', 'ID Sucursal', 'Pasajeros Mín', 'Pasajeros Máx', 
                'Tipo Unidad', 'Tarifa por PAX', 'Vigencia Desde', 'Vigencia Hasta', 
                'Notas', 'Fecha Creación', 'Fecha Actualización', 'Estado Sync', 'Sincronizado'];
      break;
    case SHEETS.AGENCY_ARRIVALS:
      headers = ['ID', 'Fecha', 'ID Sucursal', 'ID Agencia', 'Pasajeros', 'Tipo Unidad', 
                'Costo Llegada', 'Notas', 'Fecha Creación', 'Fecha Actualización', 
                'Estado Sync', 'Sincronizado'];
      break;
    case SHEETS.DAILY_PROFIT_REPORTS:
      headers = ['ID', 'Fecha', 'ID Sucursal', 'Revenue Ventas', 'COGS Total', 'Comisiones Vendedores', 
                'Comisiones Guías', 'Costos Llegadas', 'Costos Fijos Diarios', 'Costos Variables Diarios', 
                'Utilidad Antes Impuestos', 'Margen %', 'Total Pasajeros', 'Tipo Cambio', 
                'Fecha Creación', 'Fecha Actualización', 'Estado Sync', 'Sincronizado'];
      break;
    case SHEETS.EXCHANGE_RATES_DAILY:
      headers = ['Fecha', 'USD', 'CAD', 'Fuente', 'Fecha Creación', 'Fecha Actualización', 'Sincronizado'];
      break;
    case SHEETS.INVENTORY_TRANSFERS:
      headers = ['ID', 'Folio', 'Sucursal Origen', 'Sucursal Destino', 'Estado', 'Cantidad Items', 
                'Notas', 'Fecha Creación', 'Fecha Actualización', 'Fecha Completado', 'Creado Por', 
                'Estado Sync', 'Sincronizado'];
      break;
    case SHEETS.INVENTORY_TRANSFER_ITEMS:
      headers = ['ID', 'ID Transferencia', 'ID Producto', 'Cantidad', 'Estado', 'Notas', 'Fecha Creación'];
      break;
    case SHEETS.CATALOG_BRANCHES:
      headers = ['ID', 'Nombre', 'Dirección', 'Teléfono', 'Activa', 
                'Nombre Comercial', 'Dirección Fiscal', 'Teléfono Contacto', 'Email', 'RFC', 
                'Pie de Página', 'Logo', 'Fecha Creación', 'Fecha Actualización', 'Sincronizado'];
      break;
    case SHEETS.CATALOG_AGENCIES:
      headers = ['ID', 'Nombre', 'Activa', 'Fecha Creación', 'Fecha Actualización', 'Sincronizado'];
      break;
    case SHEETS.CATALOG_SELLERS:
      headers = ['ID', 'Nombre', 'Código Barras', 'Regla Comisión', 'Activo', 'Fecha Creación', 'Fecha Actualización', 'Sincronizado'];
      break;
    case SHEETS.CATALOG_GUIDES:
      headers = ['ID', 'Nombre', 'ID Agencia', 'Código Barras', 'Regla Comisión', 'Activo', 'Fecha Creación', 'Fecha Actualización', 'Sincronizado'];
      break;
    case SHEETS.CUSTOMERS:
      headers = ['ID', 'Nombre', 'Email', 'Teléfono', 'Dirección', 'Notas', 'Fecha Creación', 'Fecha Actualización', 'Sincronizado'];
      break;
    case SHEETS.USERS:
      headers = ['ID', 'Usuario', 'Rol', 'ID Empleado', 'Permisos', 'Activo', 'Fecha Creación', 'Fecha Actualización', 'Sincronizado'];
      break;
  }
  
  if (headers.length > 0) {
    // Agregar headers
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    
    // Aplicar formato bonito
    applySheetFormatting(sheet, sheetName, headers.length);
  }
}

/**
 * Aplicar formato bonito a las hojas
 */
function applySheetFormatting(sheet, sheetName, numColumns) {
  // Formato del header (fila 1)
  const headerRange = sheet.getRange(1, 1, 1, numColumns);
  
  // Colores según el tipo de hoja
  let headerColor = '#4285F4'; // Azul por defecto
  let headerTextColor = '#FFFFFF';
  
  switch (sheetName) {
    case SHEETS.SALES:
      headerColor = '#34A853'; // Verde para ventas
      break;
    case SHEETS.ITEMS:
      headerColor = '#EA4335'; // Rojo para items
      break;
    case SHEETS.PAYMENTS:
      headerColor = '#9C27B0'; // Morado para pagos
      break;
    case SHEETS.INVENTORY:
      headerColor = '#FBBC04'; // Amarillo para inventario
      break;
    case SHEETS.INVENTORY_LOG:
      headerColor = '#FF9800'; // Naranja para logs
      break;
    case SHEETS.EMPLOYEES:
      headerColor = '#9C27B0'; // Morado para empleados
      break;
    case SHEETS.USERS:
      headerColor = '#673AB7'; // Morado oscuro para usuarios
      break;
    case SHEETS.REPAIRS:
      headerColor = '#F44336'; // Rojo para reparaciones
      break;
    case SHEETS.COSTS:
      headerColor = '#FF5722'; // Rojo oscuro para costos
      break;
    case SHEETS.AUDIT_LOG:
      headerColor = '#607D8B'; // Gris azulado para auditoría
      break;
    case SHEETS.TOURIST_DAILY_REPORTS:
      headerColor = '#00BCD4'; // Cyan para reportes turistas
      break;
    case SHEETS.TOURIST_DAILY_LINES:
      headerColor = '#009688'; // Verde azulado para líneas
      break;
  }
  
  // Estilo del header
  headerRange.setBackground(headerColor);
  headerRange.setFontColor(headerTextColor);
  headerRange.setFontWeight('bold');
  headerRange.setFontSize(11);
  headerRange.setHorizontalAlignment('center');
  headerRange.setVerticalAlignment('middle');
  headerRange.setWrap(true);
  
  // Bordes del header (blanco, pero no crítico ya que el fondo es de color)
  try {
    // Intentar establecer bordes con color (API moderna)
  headerRange.setBorder(true, true, true, true, true, true);
    // El color del borde por defecto está bien, no es necesario cambiarlo
  } catch (e) {
    // Si falla, solo establecer bordes básicos
    headerRange.setBorder(true, true, true, true, true, true);
  }
  
  // Congelar primera fila
  sheet.setFrozenRows(1);
  
  // Ajustar ancho de columnas según el tipo de dato
  adjustColumnWidths(sheet, sheetName, numColumns);
  
  // Formato de columnas numéricas y fechas
  applyDataFormatting(sheet, sheetName, numColumns);
  
  // Alternar colores de filas para mejor legibilidad
  const dataRange = sheet.getRange(2, 1, 1000, numColumns);
  const conditionalFormatRules = sheet.getConditionalFormatRules();
  
  // Regla: filas pares con fondo claro
  conditionalFormatRules.push(
    SpreadsheetApp.newConditionalFormatRule()
      .setRanges([dataRange])
      .whenFormulaSatisfied('=MOD(ROW(),2)=0')
      .setBackground('#F8F9FA')
      .build()
  );
  
  // Regla: filas impares sin fondo especial (blanco)
  conditionalFormatRules.push(
    SpreadsheetApp.newConditionalFormatRule()
      .setRanges([dataRange])
      .whenFormulaSatisfied('=MOD(ROW(),2)=1')
      .setBackground('#FFFFFF')
      .build()
  );
  
  sheet.setConditionalFormatRules(conditionalFormatRules);
  
  // Proteger header (opcional, comentado por ahora)
  // const protection = headerRange.protect().setDescription('Header protegido');
  // protection.removeEditors(protection.getEditors());
  // if (protection.canDomainEdit()) {
  //   protection.setDomainEdit(false);
  // }
}

/**
 * Ajustar anchos de columnas según el tipo de dato
 */
function adjustColumnWidths(sheet, sheetName, numColumns) {
  const defaultWidth = 100;
  let widths = [];
  
  switch (sheetName) {
    case SHEETS.SALES:
      widths = [80, 120, 100, 120, 120, 100, 120, 80, 80, 100, 100, 100, 100, 100, 100, 100, 200, 150, 150, 100, 150];
      break;
    case SHEETS.ITEMS:
      widths = [80, 100, 100, 80, 100, 100, 100, 100, 100, 150];
      break;
    case SHEETS.PAYMENTS:
      widths = [80, 100, 120, 100, 80, 100, 100, 100, 150];
      break;
    case SHEETS.INVENTORY:
      widths = [80, 100, 120, 200, 100, 100, 80, 80, 150, 100, 100, 100, 100, 100, 150, 150, 100, 150];
      break;
    case SHEETS.INVENTORY_LOG:
      widths = [80, 100, 120, 80, 200, 150];
      break;
    case SHEETS.EMPLOYEES:
      widths = [80, 200, 120, 100, 80, 120, 150];
      break;
    case SHEETS.USERS:
      widths = [80, 150, 100, 120, 80, 150];
      break;
    case SHEETS.REPAIRS:
      widths = [80, 120, 100, 100, 300, 100, 100, 150, 150, 100, 150];
      break;
    case SHEETS.COSTS:
      widths = [80, 100, 150, 100, 100, 100, 200, 150, 100, 150];
      break;
    case SHEETS.AUDIT_LOG:
      widths = [80, 100, 150, 120, 100, 300, 150];
      break;
    case SHEETS.DAILY_PROFIT_REPORTS:
      widths = [80, 100, 100, 120, 120, 120, 120, 120, 120, 120, 120, 100, 100, 100, 150, 150, 100, 150];
      break;
    case SHEETS.TOURIST_DAILY_REPORTS:
      widths = [80, 100, 100, 100, 100, 300, 120, 120, 100, 100, 100, 150, 150, 100, 150];
      break;
    case SHEETS.TOURIST_DAILY_LINES:
      widths = [80, 100, 100, 120, 120, 100, 120, 80, 80, 200, 100, 100, 100, 100, 100, 100, 100, 100, 150];
      break;
    case SHEETS.CATALOG_BRANCHES:
      widths = [80, 150, 200, 120, 80, 200, 250, 120, 180, 120, 200, 80, 150, 150, 150];
      break;
    default:
      // Ancho por defecto para todas las columnas
      for (let i = 0; i < numColumns; i++) {
        widths.push(defaultWidth);
      }
  }
  
  // Aplicar anchos
  for (let i = 0; i < Math.min(widths.length, numColumns); i++) {
    sheet.setColumnWidth(i + 1, widths[i]);
  }
  
  // Si hay más columnas que anchos definidos, usar ancho por defecto
  for (let i = widths.length; i < numColumns; i++) {
    sheet.setColumnWidth(i + 1, defaultWidth);
  }
}

/**
 * Aplicar formato a columnas de datos (números, fechas, etc.)
 */
function applyDataFormatting(sheet, sheetName, numColumns) {
  // Obtener headers para identificar columnas
  const headers = sheet.getRange(1, 1, 1, numColumns).getValues()[0];
  
  headers.forEach((header, index) => {
    const colIndex = index + 1;
    const headerLower = header.toString().toLowerCase();
    
    // Columnas de moneda (precio, costo, total, monto, etc.)
    if (headerLower.includes('precio') || headerLower.includes('costo') || 
        headerLower.includes('total') || headerLower.includes('monto') ||
        headerLower.includes('subtotal') || headerLower.includes('descuento') ||
        headerLower.includes('cash') || headerLower.includes('tpv')) {
      const dataRange = sheet.getRange(2, colIndex, 10000, 1);
      dataRange.setNumberFormat('$#,##0.00');
    }
    
    // Columnas de porcentaje
    if (headerLower.includes('tipo cambio') || headerLower.includes('exchange_rate')) {
      const dataRange = sheet.getRange(2, colIndex, 10000, 1);
      dataRange.setNumberFormat('#,##0.00');
    }
    
    // Columnas de cantidad
    if (headerLower.includes('cantidad') || headerLower.includes('quantity') ||
        headerLower.includes('pasajeros') || headerLower.includes('passengers')) {
      const dataRange = sheet.getRange(2, colIndex, 10000, 1);
      dataRange.setNumberFormat('#,##0');
    }
    
    // Columnas de peso
    if (headerLower.includes('peso') || headerLower.includes('weight')) {
      const dataRange = sheet.getRange(2, colIndex, 10000, 1);
      dataRange.setNumberFormat('#,##0.00" g"');
    }
    
    // Columnas de fecha
    if (headerLower.includes('fecha') || headerLower.includes('date') ||
        headerLower.includes('created_at') || headerLower.includes('updated_at') ||
        headerLower.includes('sincronizado') || headerLower.includes('sync_at')) {
      const dataRange = sheet.getRange(2, colIndex, 10000, 1);
      // Formato de fecha y hora
      dataRange.setNumberFormat('yyyy-mm-dd hh:mm:ss');
    }
    
    // Columnas booleanas (activo/inactivo)
    if (headerLower.includes('activo') || headerLower.includes('active')) {
      const dataRange = sheet.getRange(2, colIndex, 10000, 1);
      dataRange.setNumberFormat('"Sí";"No"');
    }
  });
  
  // Formato general para todas las celdas de datos
  const dataRange = sheet.getRange(2, 1, 10000, numColumns);
  dataRange.setFontSize(10);
  dataRange.setVerticalAlignment('middle');
  dataRange.setWrap(false);
  
  // Bordes sutiles para datos
  dataRange.setBorder(null, null, null, null, null, true, '#E0E0E0', SpreadsheetApp.BorderStyle.SOLID);
}

/**
 * Procesar ventas
 */
function processSales(ss, records) {
  // Agrupar registros por sucursal si se usan hojas separadas
  const recordsByBranch = {};
  
  records.forEach(record => {
    const branchId = record.branch_id || 'UNKNOWN';
    if (!recordsByBranch[branchId]) {
      recordsByBranch[branchId] = [];
    }
    recordsByBranch[branchId].push(record);
  });
  
  let totalAdded = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  
  // También obtener hojas principales (además de las por sucursal)
  const mainSheet = getOrCreateSheet(ss, SHEETS.SALES);
  const mainItemsSheet = getOrCreateSheet(ss, SHEETS.ITEMS);
  const mainPaymentsSheet = getOrCreateSheet(ss, SHEETS.PAYMENTS);
  
  // Procesar cada sucursal
  for (const branchId in recordsByBranch) {
    const branchRecords = recordsByBranch[branchId];
    const sheet = getOrCreateBranchSheet(ss, SHEETS.SALES, branchId);
    const itemsSheet = getOrCreateBranchSheet(ss, SHEETS.ITEMS, branchId);
    const paymentsSheet = getOrCreateBranchSheet(ss, SHEETS.PAYMENTS, branchId);
  
  if (!sheet || !itemsSheet || !paymentsSheet || !mainSheet || !mainItemsSheet || !mainPaymentsSheet) {
      continue;
  }
  
  let added = 0;
  let updated = 0;
  let skipped = 0;
  
    branchRecords.forEach(record => {
    // Verificar si ya existe (por folio)
    const folioCol = getColumnIndex(sheet, 'folio');
    const existingRow = findRowByValue(sheet, folioCol, record.folio);
    
    const rowData = [
      record.id,
      record.folio,
      record.branch_id || '',
      record.seller_id || '',
      record.agency_id || '',
      record.guide_id || '',
      record.customer_id || '',
      record.passengers || 1,
      record.currency || 'MXN',
      record.exchange_rate || 1,
      record.subtotal || 0,
      record.discount || 0,
      record.total || 0,
      record.seller_commission || 0,
      record.guide_commission || 0,
      record.status || 'completada',
      record.notes || '',
      record.created_at || '',
      record.updated_at || '',
      record.device_id || 'unknown',
      new Date().toISOString()
    ];
    
    if (existingRow > 0) {
      // Actualizar venta existente
      sheet.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
      updated++;
      
      // Eliminar items antiguos de esta venta antes de agregar los nuevos (para evitar duplicados)
      const saleIdCol = getColumnIndex(itemsSheet, 'ID Venta');
      if (saleIdCol > 0 && itemsSheet.getLastRow() > 1) {
        let itemRowIndex = itemsSheet.getLastRow();
        while (itemRowIndex > 1) { // Empezar desde la última fila (excluir header)
          const saleIdValue = itemsSheet.getRange(itemRowIndex, saleIdCol).getValue();
          if (saleIdValue === record.id) {
            itemsSheet.deleteRow(itemRowIndex);
          }
          itemRowIndex--;
        }
      }
    } else {
      // Agregar nueva venta en hoja de sucursal
      sheet.appendRow(rowData);
      added++;
      
      // También agregar en hoja principal
      const mainExistingRow = findRowByValue(mainSheet, getColumnIndex(mainSheet, 'folio'), record.folio);
      if (mainExistingRow === 0) {
        mainSheet.appendRow(rowData);
      }
    }
    
    // Procesar items de la venta (solo si hay items)
    if (record.items && Array.isArray(record.items) && record.items.length > 0) {
      record.items.forEach(item => {
        const itemRow = [
          item.id,
          record.id, // sale_id
          item.item_id,
          item.quantity || 1,
          item.price || 0,
          item.cost || 0, // Costo de adquisición (COGS)
          item.discount || 0,
          item.subtotal || 0,
          item.commission_amount || 0, // Comisión calculada
          item.created_at || ''
        ];
        // Siempre agregar items en hoja de sucursal (ya eliminamos los antiguos si era actualización)
        itemsSheet.appendRow(itemRow);
        // También agregar en hoja principal (verificar si no existe)
        const mainItemSaleIdCol = getColumnIndex(mainItemsSheet, 'ID Venta');
        const mainItemExisting = findRowByValue(mainItemsSheet, mainItemSaleIdCol, record.id);
        if (mainItemExisting === 0 || mainItemExisting === -1) {
          mainItemsSheet.appendRow(itemRow);
        }
      });
    }
    
    // Procesar pagos de la venta
    if (record.payments && Array.isArray(record.payments)) {
      
      // Si es una actualización, eliminar pagos antiguos primero (para evitar duplicados)
      if (existingRow > 0) {
        const paymentSaleIdCol = getColumnIndex(paymentsSheet, 'ID Venta');
        if (paymentSaleIdCol > 0 && paymentsSheet.getLastRow() > 1) {
          let paymentRowIndex = paymentsSheet.getLastRow();
          while (paymentRowIndex > 1) { // Empezar desde la última fila (excluir header)
            const paymentSaleIdValue = paymentsSheet.getRange(paymentRowIndex, paymentSaleIdCol).getValue();
            if (paymentSaleIdValue === record.id) {
              paymentsSheet.deleteRow(paymentRowIndex);
            }
            paymentRowIndex--;
          }
        }
      }
      
      // Agregar los nuevos pagos en hoja de sucursal
      record.payments.forEach(payment => {
        const paymentRow = [
          payment.id,
          record.id, // sale_id
          payment.method_id || '',
          payment.amount || 0,
          payment.currency || 'MXN',
          payment.bank || '',
          payment.payment_type || '',
          payment.bank_commission || 0,
          payment.created_at || ''
        ];
        paymentsSheet.appendRow(paymentRow);
        
        // También agregar en hoja principal (verificar si no existe)
        const mainPaymentSaleIdCol = getColumnIndex(mainPaymentsSheet, 'ID Venta');
        const mainPaymentExisting = findRowByValue(mainPaymentsSheet, mainPaymentSaleIdCol, record.id);
        if (mainPaymentExisting === 0 || mainPaymentExisting === -1) {
          mainPaymentsSheet.appendRow(paymentRow);
        }
      });
    }
  });
  
    totalAdded += added;
    totalUpdated += updated;
    totalSkipped += skipped;
  }
  
  return { success: true, added: totalAdded, updated: totalUpdated, skipped: totalSkipped };
}

/**
 * Procesar inventario
 */
function processInventory(ss, records, deletes = null) {
  // Agrupar registros por sucursal si se usan hojas separadas
  const recordsByBranch = {};
  
  records.forEach(record => {
    const branchId = record.branch_id || 'UNKNOWN';
    if (!recordsByBranch[branchId]) {
      recordsByBranch[branchId] = [];
    }
    recordsByBranch[branchId].push(record);
  });
  
  let totalAdded = 0;
  let totalUpdated = 0;
  let totalDeleted = 0;
  
  // También obtener hoja principal (además de las por sucursal)
  const mainSheet = getOrCreateSheet(ss, SHEETS.INVENTORY);
  
  // Procesar cada sucursal
  for (const branchId in recordsByBranch) {
    const branchRecords = recordsByBranch[branchId];
    const sheet = getOrCreateBranchSheet(ss, SHEETS.INVENTORY, branchId);
    
  if (!sheet || !mainSheet) {
      continue;
  }
  
  let added = 0;
  let updated = 0;
  
    branchRecords.forEach(record => {
    const skuCol = getColumnIndex(sheet, 'sku');
    const existingRow = findRowByValue(sheet, skuCol, record.sku);
    
    const rowData = [
      record.id,
      record.sku,
      record.barcode || '',
      record.name || '',
      record.metal || '',
      record.stone || '',
      record.size || '',
      record.weight_g || 0,
      record.measures || '',
      record.cost || 0,
      record.price || 0,
      record.location || '',
      record.status || 'disponible',
      record.branch_id || '',
      record.created_at || '',
      record.updated_at || '',
      record.device_id || 'unknown',
      new Date().toISOString()
    ];
    
    if (existingRow > 0) {
      sheet.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
      updated++;
    } else {
      sheet.appendRow(rowData);
      added++;
    }
  });
  
    totalAdded += added;
    totalUpdated += updated;
  }
  
  // Procesar eliminaciones después de procesar todos los records (fuera del loop de sucursales)
  if (deletes && Array.isArray(deletes) && deletes.length > 0) {
    deletes.forEach(deleteRecord => {
      // Buscar por ID o SKU en la hoja correspondiente
      const deleteBranchId = deleteRecord.branch_id || 'UNKNOWN';
      const deleteSheet = getOrCreateBranchSheet(ss, SHEETS.INVENTORY, deleteBranchId);
      
      if (!deleteSheet) return;
      
      // Buscar por ID primero
      const idCol = getColumnIndex(deleteSheet, 'id');
      let rowToDelete = findRowByValue(deleteSheet, idCol, deleteRecord.id);
      
      // Si no se encuentra por ID, buscar por SKU
      if (rowToDelete === 0 && deleteRecord.sku) {
        const skuCol = getColumnIndex(deleteSheet, 'sku');
        rowToDelete = findRowByValue(deleteSheet, skuCol, deleteRecord.sku);
      }
      
      if (rowToDelete > 0) {
        deleteSheet.deleteRow(rowToDelete);
        totalDeleted++;
      }
    });
  }
  
  return { success: true, added: totalAdded, updated: totalUpdated, deleted: totalDeleted };
}

/**
 * Procesar empleados
 */
function processEmployees(ss, records) {
  const sheet = ss.getSheetByName(SHEETS.EMPLOYEES);
  if (!sheet) return { success: false, error: 'Hoja no encontrada' };
  
  records.forEach(record => {
    const idCol = getColumnIndex(sheet, 'id');
    const existingRow = findRowByValue(sheet, idCol, record.id);
    
    const rowData = [
      record.id,
      record.name || '',
      record.role || '',
      record.branch_id || '',
      record.active !== false,
      record.barcode || '',
      record.created_at || ''
    ];
    
    if (existingRow > 0) {
      sheet.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
    } else {
      sheet.appendRow(rowData);
    }
  });
  
  return { success: true };
}

/**
 * Procesar reparaciones
 */
function processRepairs(ss, records) {
  const sheet = ss.getSheetByName(SHEETS.REPAIRS);
  if (!sheet) return { success: false, error: 'Hoja no encontrada' };
  
  records.forEach(record => {
    const folioCol = getColumnIndex(sheet, 'folio');
    const existingRow = findRowByValue(sheet, folioCol, record.folio);
    
    const rowData = [
      record.id,
      record.folio,
      record.customer_id || '',
      record.item_id || '',
      record.description || '',
      record.status || '',
      record.cost || 0,
      record.created_at || '',
      record.updated_at || '',
      record.device_id || 'unknown',
      new Date().toISOString()
    ];
    
    if (existingRow > 0) {
      sheet.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
    } else {
      sheet.appendRow(rowData);
    }
  });
  
  return { success: true };
}

/**
 * Procesar costos
 */
function processCosts(ss, records) {
  const sheet = ss.getSheetByName(SHEETS.COSTS);
  if (!sheet) return { success: false, error: 'Hoja no encontrada' };
  
  records.forEach(record => {
    const rowData = [
      record.id,
      record.type || '',
      record.category || '',
      record.amount || 0,
      record.branch_id || '',
      record.date || '',
      record.notes || '',
      record.created_at || '',
      record.device_id || 'unknown',
      new Date().toISOString()
    ];
    
    sheet.appendRow(rowData);
  });
  
  return { success: true };
}

/**
 * Procesar reportes turistas
 */
function processTouristReports(ss, records) {
  const reportSheet = ss.getSheetByName(SHEETS.TOURIST_DAILY_REPORTS);
  const linesSheet = ss.getSheetByName(SHEETS.TOURIST_DAILY_LINES);
  
  if (!reportSheet || !linesSheet) {
    return { success: false, error: 'Hojas no encontradas' };
  }
  
  records.forEach(record => {
    const idCol = getColumnIndex(reportSheet, 'id');
    const existingRow = findRowByValue(reportSheet, idCol, record.id);
    
    const reportRow = [
      record.id,
      record.date || '',
      record.branch_id || '',
      record.exchange_rate || 0,
      record.status || '',
      record.observations || '',
      record.total_cash_usd || 0,
      record.total_cash_mxn || 0,
      record.subtotal || 0,
      record.additional || 0,
      record.total || 0,
      record.created_at || '',
      record.updated_at || '',
      record.device_id || 'unknown',
      new Date().toISOString()
    ];
    
    if (existingRow > 0) {
      reportSheet.getRange(existingRow, 1, 1, reportRow.length).setValues([reportRow]);
    } else {
      reportSheet.appendRow(reportRow);
    }
    
    // Procesar líneas
    if (record.lines && Array.isArray(record.lines)) {
      record.lines.forEach(line => {
        const lineRow = [
          line.id,
          record.id, // report_id
          line.sale_id || '',
          line.identification || '',
          line.seller_id || '',
          line.guide_id || '',
          line.agency_id || '',
          line.quantity || 0,
          line.weight_g || 0,
          line.products || '',
          line.exchange_rate || 0,
          line.cash_eur || 0,
          line.cash_cad || 0,
          line.cash_usd || 0,
          line.cash_mxn || 0,
          line.tpv_visa_mc || 0,
          line.tpv_amex || 0,
          line.total || 0,
          line.created_at || ''
        ];
        linesSheet.appendRow(lineRow);
      });
    }
  });
  
  return { success: true };
}

/**
 * Procesar reglas de tarifas de llegadas
 */
function processArrivalRateRules(ss, records) {
  const sheet = ss.getSheetByName(SHEETS.ARRIVAL_RATE_RULES);
  if (!sheet) return { success: false, error: 'Hoja no encontrada' };
  
  records.forEach(record => {
    const idCol = getColumnIndex(sheet, 'id');
    const existingRow = findRowByValue(sheet, idCol, record.id);
    
    const rowData = [
      record.id,
      record.agency_id || '',
      record.branch_id || '',
      record.min_passengers || 0,
      record.max_passengers || '',
      record.unit_type || '',
      record.rate_per_passenger || 0,
      record.active_from || '',
      record.active_until || '',
      record.notes || '',
      record.created_at || '',
      record.updated_at || '',
      record.sync_status || 'pending',
      new Date().toISOString()
    ];
    
    if (existingRow > 0) {
      sheet.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
    } else {
      sheet.appendRow(rowData);
    }
  });
  
  return { success: true };
}

/**
 * Procesar llegadas de agencias
 */
function processAgencyArrivals(ss, records) {
  const sheet = ss.getSheetByName(SHEETS.AGENCY_ARRIVALS);
  if (!sheet) return { success: false, error: 'Hoja no encontrada' };
  
  records.forEach(record => {
    const idCol = getColumnIndex(sheet, 'id');
    const existingRow = findRowByValue(sheet, idCol, record.id);
    
    const rowData = [
      record.id,
      record.date || '',
      record.branch_id || '',
      record.agency_id || '',
      record.passengers || 0,
      record.unit_type || '',
      record.arrival_fee || 0,
      record.notes || '',
      record.created_at || '',
      record.updated_at || '',
      record.sync_status || 'pending',
      new Date().toISOString()
    ];
    
    if (existingRow > 0) {
      sheet.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
    } else {
      sheet.appendRow(rowData);
    }
  });
  
  return { success: true };
}

/**
 * Procesar reportes de utilidad diaria
 */
function processDailyProfitReports(ss, records) {
  const sheet = ss.getSheetByName(SHEETS.DAILY_PROFIT_REPORTS);
  if (!sheet) return { success: false, error: 'Hoja no encontrada' };
  
  records.forEach(record => {
    const idCol = getColumnIndex(sheet, 'id');
    const existingRow = findRowByValue(sheet, idCol, record.id);
    
    // Usar los nombres de campo correctos desde profit.js
    const rowData = [
      record.id,
      record.date || '',
      record.branch_id || '',
      record.revenue_sales_total || record.revenue || 0,
      record.cogs_total || 0,
      record.commissions_sellers_total || 0,
      record.commissions_guides_total || 0,
      record.arrivals_total || record.arrival_costs || 0,
      record.fixed_costs_daily || 0,
      record.variable_costs_daily || 0,
      record.profit_before_taxes || 0,
      record.profit_margin || 0,
      record.passengers_total || record.total_passengers || 0,
      record.exchange_rate || 1,
      record.created_at || '',
      record.updated_at || '',
      record.sync_status || 'pending',
      new Date().toISOString()
    ];
    
    if (existingRow > 0) {
      sheet.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
    } else {
      sheet.appendRow(rowData);
    }
  });
  
  return { success: true };
}

/**
 * Procesar transferencias de inventario
 */
function processInventoryTransfers(ss, records) {
  // Agrupar registros por sucursal origen si se usan hojas separadas
  const recordsByBranch = {};
  
  records.forEach(record => {
    const branchId = record.from_branch_id || 'UNKNOWN';
    if (!recordsByBranch[branchId]) {
      recordsByBranch[branchId] = [];
    }
    recordsByBranch[branchId].push(record);
  });
  
  let totalAdded = 0;
  let totalUpdated = 0;
  
  // También obtener hojas principales (además de las por sucursal)
  const mainSheet = getOrCreateSheet(ss, SHEETS.INVENTORY_TRANSFERS);
  const mainItemsSheet = getOrCreateSheet(ss, SHEETS.INVENTORY_TRANSFER_ITEMS);
  
  // Procesar cada sucursal
  for (const branchId in recordsByBranch) {
    const branchRecords = recordsByBranch[branchId];
    const sheet = getOrCreateBranchSheet(ss, SHEETS.INVENTORY_TRANSFERS, branchId);
    const itemsSheet = getOrCreateBranchSheet(ss, SHEETS.INVENTORY_TRANSFER_ITEMS, branchId);
    
    if (!sheet || !itemsSheet || !mainSheet || !mainItemsSheet) {
      continue;
    }
    
    let added = 0;
    let updated = 0;
    
    branchRecords.forEach(record => {
      const folioCol = getColumnIndex(sheet, 'folio');
      const existingRow = findRowByValue(sheet, folioCol, record.folio);
      
      const rowData = [
        record.id,
        record.folio || '',
        record.from_branch_id || '',
        record.to_branch_id || '',
        record.status || 'pending',
        record.items_count || 0,
        record.notes || '',
        record.created_at || '',
        record.updated_at || '',
        record.completed_at || '',
        record.created_by || '',
        record.sync_status || 'pending',
        new Date().toISOString()
      ];
      
      if (existingRow > 0) {
        sheet.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
        updated++;
      } else {
        sheet.appendRow(rowData);
        added++;
        
        // También agregar en hoja principal (si no existe)
        const mainFolioCol = getColumnIndex(mainSheet, 'Folio');
        const mainExistingRow = findRowByValue(mainSheet, mainFolioCol, record.folio);
        if (mainExistingRow === 0) {
          mainSheet.appendRow(rowData);
        }
      }
      
      // Procesar items de la transferencia
      if (record.items && Array.isArray(record.items)) {
        record.items.forEach(item => {
          const itemRow = [
            item.id,
            record.id, // transfer_id
            item.item_id,
            item.quantity || 1,
            item.status || 'pending',
            item.notes || '',
            item.created_at || ''
          ];
          itemsSheet.appendRow(itemRow);
          
          // También agregar en hoja principal (verificar si no existe)
          const mainItemIdCol = getColumnIndex(mainItemsSheet, 'ID');
          const mainItemExisting = findRowByValue(mainItemsSheet, mainItemIdCol, item.id);
          if (mainItemExisting === 0) {
            mainItemsSheet.appendRow(itemRow);
          }
        });
      }
    });
    
    totalAdded += added;
    totalUpdated += updated;
  }
  
  return { success: true, added: totalAdded, updated: totalUpdated };
}

/**
 * Procesar sucursales (catálogo)
 */
function processCatalogBranches(ss, records) {
  const sheet = getOrCreateSheet(ss, SHEETS.CATALOG_BRANCHES);
  let added = 0;
  let updated = 0;
  
  records.forEach(record => {
    const idCol = getColumnIndex(sheet, 'id');
    const existingRow = findRowByValue(sheet, idCol, record.id);
    
    const rowData = [
      record.id,
      record.name || '',
      record.address || '',
      record.phone || '',
      record.active ? 'Sí' : 'No',
      record.business_name || '', // Nombre Comercial
      record.business_address || '', // Dirección Fiscal
      record.business_phone || '', // Teléfono Contacto
      record.business_email || '', // Email
      record.business_rfc || '', // RFC
      record.business_footer || '', // Pie de Página
      record.business_logo ? 'Sí' : 'No', // Logo (mostrar si existe, no el contenido)
      record.created_at || '',
      record.updated_at || '',
      new Date().toISOString()
    ];
    
    if (existingRow > 0) {
      sheet.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
      updated++;
    } else {
      sheet.appendRow(rowData);
      added++;
    }
  });
  
  return { success: true, added, updated };
}

/**
 * Procesar agencias (catálogo)
 */
function processCatalogAgencies(ss, records) {
  const sheet = getOrCreateSheet(ss, SHEETS.CATALOG_AGENCIES);
  let added = 0;
  let updated = 0;
  
  records.forEach(record => {
    const idCol = getColumnIndex(sheet, 'id');
    const existingRow = findRowByValue(sheet, idCol, record.id);
    
    const rowData = [
      record.id,
      record.name || '',
      record.active ? 'Sí' : 'No',
      record.created_at || '',
      record.updated_at || '',
      new Date().toISOString()
    ];
    
    if (existingRow > 0) {
      sheet.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
      updated++;
    } else {
      sheet.appendRow(rowData);
      added++;
    }
  });
  
  return { success: true, added, updated };
}

/**
 * Procesar vendedores (catálogo)
 */
function processCatalogSellers(ss, records) {
  const sheet = getOrCreateSheet(ss, SHEETS.CATALOG_SELLERS);
  let added = 0;
  let updated = 0;
  
  records.forEach(record => {
    const idCol = getColumnIndex(sheet, 'id');
    const existingRow = findRowByValue(sheet, idCol, record.id);
    
    const rowData = [
      record.id,
      record.name || '',
      record.barcode || '',
      record.commission_rule || '',
      record.active ? 'Sí' : 'No',
      record.created_at || '',
      record.updated_at || '',
      new Date().toISOString()
    ];
    
    if (existingRow > 0) {
      sheet.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
      updated++;
    } else {
      sheet.appendRow(rowData);
      added++;
    }
  });
  
  return { success: true, added, updated };
}

/**
 * Procesar guías (catálogo)
 */
function processCatalogGuides(ss, records) {
  const sheet = getOrCreateSheet(ss, SHEETS.CATALOG_GUIDES);
  let added = 0;
  let updated = 0;
  
  records.forEach(record => {
    const idCol = getColumnIndex(sheet, 'id');
    const existingRow = findRowByValue(sheet, idCol, record.id);
    
    const rowData = [
      record.id,
      record.name || '',
      record.agency_id || '',
      record.barcode || '',
      record.commission_rule || '',
      record.active ? 'Sí' : 'No',
      record.created_at || '',
      record.updated_at || '',
      new Date().toISOString()
    ];
    
    if (existingRow > 0) {
      sheet.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
      updated++;
    } else {
      sheet.appendRow(rowData);
      added++;
    }
  });
  
  return { success: true, added, updated };
}

/**
 * Procesar clientes
 */
function processCustomers(ss, records) {
  const sheet = getOrCreateSheet(ss, SHEETS.CUSTOMERS);
  let added = 0;
  let updated = 0;
  
  records.forEach(record => {
    const idCol = getColumnIndex(sheet, 'id');
    const existingRow = findRowByValue(sheet, idCol, record.id);
    
    const rowData = [
      record.id,
      record.name || '',
      record.email || '',
      record.phone || '',
      record.address || '',
      record.notes || '',
      record.created_at || '',
      record.updated_at || '',
      new Date().toISOString()
    ];
    
    if (existingRow > 0) {
      sheet.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
      updated++;
    } else {
      sheet.appendRow(rowData);
      added++;
    }
  });
  
  return { success: true, added, updated };
}

/**
 * Procesar usuarios
 */
function processUsers(ss, records) {
  const sheet = getOrCreateSheet(ss, SHEETS.USERS);
  let added = 0;
  let updated = 0;
  
  records.forEach(record => {
    const idCol = getColumnIndex(sheet, 'id');
    const existingRow = findRowByValue(sheet, idCol, record.id);
    
    const rowData = [
      record.id,
      record.username || '',
      record.role || '',
      record.employee_id || '',
      record.permissions ? record.permissions.join(', ') : '',
      record.active ? 'Sí' : 'No',
      record.created_at || '',
      record.updated_at || '',
      new Date().toISOString()
    ];
    
    if (existingRow > 0) {
      sheet.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
      updated++;
    } else {
      sheet.appendRow(rowData);
      added++;
    }
  });
  
  return { success: true, added, updated };
}

/**
 * Procesar tipos de cambio diarios
 */
function processExchangeRatesDaily(ss, records) {
  const sheet = getOrCreateSheet(ss, SHEETS.EXCHANGE_RATES_DAILY);
  let added = 0;
  let updated = 0;
  
  records.forEach(record => {
    const dateCol = getColumnIndex(sheet, 'date');
    const existingRow = findRowByValue(sheet, dateCol, record.date);
    
    const rowData = [
      record.date || '',
      record.usd || 0,
      record.cad || 0,
      record.source || 'manual',
      record.created_at || '',
      record.updated_at || '',
      new Date().toISOString()
    ];
    
    if (existingRow > 0) {
      sheet.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
      updated++;
    } else {
      sheet.appendRow(rowData);
      added++;
    }
  });
  
  return { success: true, added, updated };
}

/**
 * Procesar pagos (cuando se envían por separado)
 */
function processPayments(ss, records) {
  const sheet = getOrCreateSheet(ss, SHEETS.PAYMENTS);
  if (!sheet) return { success: false, error: 'Hoja no encontrada' };
  
  let added = 0;
  let updated = 0;
  
  records.forEach(record => {
    const idCol = getColumnIndex(sheet, 'ID');
    const existingRow = findRowByValue(sheet, idCol, record.id);
    
    const rowData = [
      record.id,
      record.sale_id || '',
      record.method_id || '',
      record.amount || 0,
      record.currency || 'MXN',
      record.bank || '',
      record.payment_type || '',
      record.bank_commission || 0,
      record.created_at || ''
    ];
    
    if (existingRow > 0) {
      sheet.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
      updated++;
    } else {
      sheet.appendRow(rowData);
      added++;
    }
  });
  
  return { success: true, added, updated };
}

/**
 * Procesar sesiones de caja
 */
function processCashSessions(ss, records) {
  // Las sesiones de caja no tienen hoja específica definida, usar una genérica o crear una nueva
  // Por ahora, retornar éxito sin procesar (se pueden agregar después si es necesario)
  Logger.log('processCashSessions: ' + records.length + ' registros recibidos');
  return { success: true, message: 'Cash sessions recibidos', count: records.length };
}

/**
 * Procesar movimientos de caja
 */
function processCashMovements(ss, records) {
  // Los movimientos de caja no tienen hoja específica definida, usar una genérica o crear una nueva
  // Por ahora, retornar éxito sin procesar (se pueden agregar después si es necesario)
  Logger.log('processCashMovements: ' + records.length + ' registros recibidos');
  return { success: true, message: 'Cash movements recibidos', count: records.length };
}

/**
 * Procesar logs de inventario
 */
function processInventoryLogs(ss, records) {
  const sheet = getOrCreateSheet(ss, SHEETS.INVENTORY_LOG);
  if (!sheet) return { success: false, error: 'Hoja no encontrada' };
  
  let added = 0;
  let updated = 0;
  
  records.forEach(record => {
    const idCol = getColumnIndex(sheet, 'ID');
    const existingRow = findRowByValue(sheet, idCol, record.id);
    
    const rowData = [
      record.id,
      record.item_id || '',
      record.action || '',
      record.quantity || 0,
      record.notes || '',
      record.created_at || ''
    ];
    
    if (existingRow > 0) {
      sheet.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
      updated++;
    } else {
      sheet.appendRow(rowData);
      added++;
    }
  });
  
  return { success: true, added, updated };
}

/**
 * Procesar logs de auditoría
 */
function processAuditLogs(ss, records) {
  const sheet = getOrCreateSheet(ss, SHEETS.AUDIT_LOG);
  if (!sheet) return { success: false, error: 'Hoja no encontrada' };
  
  let added = 0;
  let updated = 0;
  
  records.forEach(record => {
    const idCol = getColumnIndex(sheet, 'ID');
    const existingRow = findRowByValue(sheet, idCol, record.id);
    
    // Parsear details si es string
    let detailsText = '';
    try {
      if (typeof record.details === 'string') {
        detailsText = record.details;
      } else {
        detailsText = JSON.stringify(record.details || {});
      }
    } catch (e) {
      detailsText = String(record.details || '');
    }
    
    const rowData = [
      record.id,
      record.user_id || '',
      record.action || '',
      record.entity_type || '',
      record.entity_id || '',
      detailsText,
      record.created_at || ''
    ];
    
    if (existingRow > 0) {
      sheet.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
      updated++;
    } else {
      sheet.appendRow(rowData);
      added++;
    }
  });
  
  return { success: true, added, updated };
}

/**
 * Utilidades
 */
function getColumnIndex(sheet, columnName) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  return headers.indexOf(columnName) + 1;
}

function findRowByValue(sheet, columnIndex, value) {
  if (columnIndex === 0) return 0;
  const data = sheet.getRange(2, columnIndex, sheet.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === value) {
      return i + 2; // +2 porque empieza en fila 2 (después del header)
    }
  }
  return 0;
}

