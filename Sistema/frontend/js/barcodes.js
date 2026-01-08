// Barcode Manager - Code 128 generation and scanning

const BarcodeManager = {
    init() {
        this.setupScanner();
        this.setupGlobalProtection();
        this.setupNavigationProtection();
        this.setupEventListeners();
    },

    setupEventListeners() {
        // Escuchar eventos de actualización de inventario para mantener sincronización
        if (typeof Utils !== 'undefined' && Utils.EventBus) {
            Utils.EventBus.on('inventory-updated', async (data) => {
                // Cuando se actualiza el inventario, las búsquedas de códigos de barras
                // estarán actualizadas ya que se buscan directamente en la base de datos
                // Este listener asegura que estamos conscientes de los cambios
                console.log('Inventario actualizado - búsquedas de códigos de barras sincronizadas');
            });
        }
    },

    setupNavigationProtection() {
        // Interceptar intentos de navegación durante escaneo
        window.addEventListener('beforeunload', (e) => {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'barcodes.js:7',message:'Beforeunload event',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
            // #endregion
        });
        
        // Interceptar cambios de hash (navegación interna)
        window.addEventListener('hashchange', (e) => {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'barcodes.js:13',message:'Hash change detected',data:{oldURL:e.oldURL,newURL:e.newURL},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
            // #endregion
        });
    },

    setupGlobalProtection() {
        // Prevenir atajos del navegador que pueden interferir con el escaneo
        let lastKeyTime = 0;
        let rapidKeyCount = 0;
        
        // Interceptar submits de formularios
        document.addEventListener('submit', (e) => {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'barcodes.js:14',message:'Form submit detected',data:{formId:e.target.id,formAction:e.target.action,formMethod:e.target.method},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
        }, true);
        
        document.addEventListener('keydown', (e) => {
            const now = Date.now();
            const timeSinceLastKey = now - lastKeyTime;
            lastKeyTime = now;
            
            // Detectar escaneo rápido (más de 5 teclas en menos de 100ms)
            if (timeSinceLastKey < 20) {
                rapidKeyCount++;
            } else {
                rapidKeyCount = 0;
            }
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'barcodes.js:25',message:'Global protection keydown',data:{key:e.key,ctrlKey:e.ctrlKey,rapidKeyCount:rapidKeyCount,timeSinceLastKey:timeSinceLastKey},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            
            // Si hay escaneo rápido activo, prevenir atajos del navegador
            if (rapidKeyCount > 3) {
                // Prevenir atajos comunes que pueden abrir ventanas
                if (e.ctrlKey || e.metaKey) {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'barcodes.js:32',message:'Rapid scan - blocking Ctrl/Meta',data:{key:e.key,rapidKeyCount:rapidKeyCount},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                    // #endregion
                    // Permitir solo Ctrl+S
                    if (e.key !== 's' && e.key !== 'S') {
                        e.preventDefault();
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                        return false;
                    }
                }
                
                // Prevenir F5, F12, etc durante escaneo
                if (e.key.startsWith('F') || e.key === 'F5' || e.key === 'F12') {
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                }
            }
        }, true);
    },

    setupScanner() {
        // Global barcode scanner handler
        let isScanning = false;
        let scanBuffer = '';
        let scanStartTime = 0;
        
        const scanner = Utils.createBarcodeScanner((barcode) => {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'barcodes.js:55',message:'Scanner callback triggered',data:{barcode:barcode,isScanning:isScanning},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            
            isScanning = true;
            scanBuffer = barcode;
            scanStartTime = Date.now();
            
            // Prevenir cualquier acción del navegador
            const preventDefault = (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                return false;
            };
            
            // Agregar listener temporal para prevenir eventos
            const tempListener = (e) => {
                if (Date.now() - scanStartTime < 500) {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'barcodes.js:69',message:'Temp listener blocking event',data:{key:e.key,ctrlKey:e.ctrlKey,metaKey:e.metaKey,altKey:e.altKey,type:e.type},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                    // #endregion
                    preventDefault(e);
                }
            };
            
            document.addEventListener('keydown', tempListener, true);
            document.addEventListener('keyup', tempListener, true);
            
            // Procesar escaneo
            this.handleBarcodeScan(barcode);
            
            // Limpiar después de procesar
            setTimeout(() => {
                isScanning = false;
                scanBuffer = '';
                document.removeEventListener('keydown', tempListener, true);
                document.removeEventListener('keyup', tempListener, true);
            }, 500);
        });
        
        document.addEventListener('keydown', (e) => {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'barcodes.js:90',message:'Keydown event captured',data:{key:e.key,code:e.code,ctrlKey:e.ctrlKey,metaKey:e.metaKey,altKey:e.altKey,shiftKey:e.shiftKey,targetTag:e.target.tagName,targetId:e.target.id,isScanning:isScanning,defaultPrevented:e.defaultPrevented},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            
            // Prevenir atajos de teclado del navegador durante escaneo
            if (isScanning) {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'barcodes.js:92',message:'Blocking event during scan',data:{key:e.key},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                // #endregion
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                return false;
            }
            
            // Only process if not in input field (unless it's the barcode input)
            const isInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';
            const isBarcodeInput = e.target.id === 'employee-barcode-input' || 
                                   e.target.classList.contains('barcode-input') || 
                                   e.target.classList.contains('pos-scan-input');
            
            if (isInput && !isBarcodeInput) {
                return;
            }
            
            // Prevenir atajos comunes del navegador
            if (e.ctrlKey || e.metaKey) {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'barcodes.js:115',message:'Ctrl/Meta key detected',data:{key:e.key,ctrlKey:e.ctrlKey,metaKey:e.metaKey},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                // #endregion
                // Solo permitir Ctrl+S
                if (e.key === 's' || e.key === 'S') {
                    return; // Permitir guardar
                }
                // Bloquear todos los demás atajos
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'barcodes.js:123',message:'Blocked Ctrl/Meta shortcut',data:{key:e.key,prevented:e.defaultPrevented},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                // #endregion
                return false;
            }
            
            // Prevenir F5, F12 durante escaneo potencial
            if (e.key === 'F5' || e.key === 'F12') {
                // Solo prevenir si no hay input activo
                if (!isInput) {
                    e.preventDefault();
                }
            }
            
            scanner(e);
        }, true); // Usar capture phase para interceptar antes
    },

    // Detectar formato de código de barras
    detectBarcodeFormat(barcode) {
        if (!barcode) return null;
        
        // EAN8: exactamente 8 dígitos numéricos
        const ean8Pattern = /^\d{8}$/;
        if (ean8Pattern.test(barcode)) {
            return 'EAN8';
        }
        
        // CODE128: cualquier otra cosa (alfanumérico, longitud variable)
        return 'CODE128';
    },

    async handleBarcodeScan(barcode) {
        const context = this.getScanContext();
        const format = this.detectBarcodeFormat(barcode);
        
        console.log('🔍 Escaneo detectado:', { barcode, format, context });
        
        switch (context) {
            case 'login':
                // Login solo acepta CODE128 (empleados)
                if (format === 'EAN8') {
                    Utils.showNotification('Este código es para inventario. Usa un código de empleado.', 'warning');
                    return;
                }
                await this.handleLoginScan(barcode);
                break;
            case 'pos':
                await this.handlePOSScan(barcode, format);
                break;
            case 'inventory':
                await this.handleInventoryScan(barcode, format);
                break;
            case 'tourist-report':
                await this.handleTouristReportScan(barcode, format);
                break;
            default:
                // Try to find item by barcode
                await this.handleGenericScan(barcode, format);
        }
    },

    getScanContext() {
        // Determine context based on active module and focused element
        const activeModule = UI.currentModule;
        const focused = document.activeElement;
        
        if (activeModule === 'login' || focused?.id === 'employee-barcode-input') {
            return 'login';
        }
        if (activeModule === 'pos' || focused?.classList.contains('pos-scan-input')) {
            return 'pos';
        }
        if (activeModule === 'inventory') {
            return 'inventory';
        }
        if (activeModule === 'tourist-report') {
            return 'tourist-report';
        }
        return 'generic';
    },

    async handleLoginScan(barcode) {
        try {
            const employee = await DB.getByIndex('employees', 'barcode', barcode);
            if (employee && employee.active) {
                document.getElementById('employee-barcode-input').value = employee.name;
                document.getElementById('pin-group').style.display = 'block';
                document.getElementById('pin-input').focus();
                // Store employee for login
                window.currentEmployee = employee;
            } else {
                Utils.showNotification('Empleado no encontrado', 'error');
            }
        } catch (e) {
            console.error('Error scanning employee:', e);
            Utils.showNotification('Error al buscar empleado', 'error');
        }
    },

    // Función auxiliar para convertir código a EAN8 (igual que en jewelry_label_editor.js)
    toEAN8(value) {
        if (!value) return null;
        const digits = value.toString().replace(/\D/g, ''); // Solo números
        if (digits.length === 8) return digits;
        if (digits.length > 8) return digits.substring(0, 8);
        // Si tiene menos de 8, rellenar con ceros y calcular dígito de control
        const padded = digits.padEnd(7, '0');
        // Calcular dígito de control EAN8
        let sum = 0;
        for (let i = 0; i < 7; i++) {
            sum += parseInt(padded[i]) * (i % 2 === 0 ? 3 : 1);
        }
        const checkDigit = (10 - (sum % 10)) % 10;
        return padded + checkDigit;
    },

    // Buscar item por EAN8 (busca tanto el EAN8 directo como códigos originales convertidos)
    async findItemByEAN8(ean8Code) {
        try {
            // Primero buscar directamente por el EAN8
            let item = await DB.getByIndex('inventory_items', 'barcode', ean8Code);
            if (item) return item;
            
            // Si no se encuentra, buscar todos los items y convertir sus códigos a EAN8
            const allItems = await DB.getAll('inventory_items') || [];
            for (const invItem of allItems) {
                if (invItem.barcode) {
                    const convertedEAN8 = this.toEAN8(invItem.barcode);
                    if (convertedEAN8 === ean8Code) {
                        return invItem;
                    }
                }
            }
            
            return null;
        } catch (e) {
            console.error('Error buscando item por EAN8:', e);
            return null;
        }
    },

    async handlePOSScan(barcode, format) {
        try {
            // Si es EAN8, buscar SOLO en inventario (exclusivo para productos)
            if (format === 'EAN8') {
                const item = await this.findItemByEAN8(barcode);
                if (item) {
                    if (item.status === 'disponible') {
                        // Verificar si ya está en el carrito
                        if (window.POS && window.POS.cart) {
                            const alreadyInCart = window.POS.cart.find(c => c.id === item.id);
                            if (alreadyInCart) {
                                Utils.showNotification('La pieza ya está en el carrito', 'warning');
                                return;
                            }
                        }
                        
                        // Agregar directamente al carrito
                        if (window.POS && window.POS.selectProduct) {
                            await window.POS.selectProduct(item.id);
                        }
                    } else {
                        Utils.showNotification(`Pieza ${item.status}`, 'error');
                    }
                } else {
                    Utils.showNotification('Producto no encontrado en inventario', 'warning');
                }
                return;
            }
            
            // Si es CODE128, buscar primero en guías/vendedores, luego en inventario
            // PASO 1: Verificar si es un guía
            const guide = await DB.getByIndex('catalog_guides', 'barcode', barcode);
            if (guide && guide.active) {
                // Es un guía, cargar agencia automáticamente
                if (window.POS && window.POS.setGuide) {
                    await window.POS.setGuide(guide);
                    return;
                }
            }

            // PASO 2: Verificar si es un vendedor
            const seller = await DB.getByIndex('catalog_sellers', 'barcode', barcode);
            if (seller && seller.active !== false) {
                // Es un vendedor
                if (window.POS && window.POS.setSeller) {
                    await window.POS.setSeller(seller);
                    return;
                }
            }
            
            // PASO 3: Buscar producto (CODE128 también puede ser producto)
            const item = await DB.getByIndex('inventory_items', 'barcode', barcode);
            if (item) {
                if (item.status === 'disponible') {
                    // Verificar si ya está en el carrito
                    if (window.POS && window.POS.cart) {
                        const alreadyInCart = window.POS.cart.find(c => c.id === item.id);
                        if (alreadyInCart) {
                            Utils.showNotification('La pieza ya está en el carrito', 'warning');
                            return;
                        }
                    }
                    
                    // Agregar directamente al carrito
                    if (window.POS && window.POS.selectProduct) {
                        await window.POS.selectProduct(item.id);
                    }
                } else {
                    Utils.showNotification(`Pieza ${item.status}`, 'error');
                }
            } else {
                // Si no es guía, vendedor ni producto, mostrar mensaje informativo
                if (window.POS && !window.POS.currentGuide) {
                    Utils.showNotification('💡 Tip: Escanea primero el GUÍA, luego el VENDEDOR, y después los productos. O agrega productos manualmente desde la lista.', 'info');
                } else if (window.POS && !window.POS.currentSeller) {
                    Utils.showNotification('💡 Tip: Escanea el VENDEDOR o agrega productos manualmente desde la lista.', 'info');
                } else {
                    Utils.showNotification('Código no reconocido. Escanea un producto o agrégalo manualmente desde la lista.', 'warning');
                }
            }
        } catch (e) {
            console.error('Error scanning item:', e);
            Utils.showNotification('Error al buscar pieza', 'error');
        }
    },

    async handleInventoryScan(barcode, format) {
        try {
            // En inventario, aceptar tanto EAN8 como CODE128
            let item = null;
            if (format === 'EAN8') {
                item = await this.findItemByEAN8(barcode);
            } else {
                item = await DB.getByIndex('inventory_items', 'barcode', barcode);
            }
            
            if (item && window.Inventory && window.Inventory.showItemDetails) {
                window.Inventory.showItemDetails(item);
            } else {
                if (format === 'EAN8') {
                    Utils.showNotification('Pieza no encontrada en inventario', 'error');
                } else {
                    Utils.showNotification('Pieza no encontrada. Este código parece ser para usuarios/guías/vendedores.', 'warning');
                }
            }
        } catch (e) {
            console.error('Error scanning item:', e);
        }
    },

    async handleTouristReportScan(barcode, format) {
        // Handle scan in tourist report line
        const activeLine = document.querySelector('.tourist-line-active');
        if (activeLine && window.TouristReport && window.TouristReport.addItemToLine) {
            try {
                // Aceptar tanto EAN8 como CODE128 para productos
                let item = null;
                if (format === 'EAN8') {
                    item = await this.findItemByEAN8(barcode);
                } else {
                    item = await DB.getByIndex('inventory_items', 'barcode', barcode);
                }
                
                if (item) {
                    window.TouristReport.addItemToLine(activeLine.dataset.lineId, item);
                } else {
                    if (format === 'EAN8') {
                        Utils.showNotification('Producto no encontrado en inventario', 'error');
                    } else {
                        Utils.showNotification('Producto no encontrado', 'error');
                    }
                }
            } catch (e) {
                console.error('Error scanning for tourist report:', e);
            }
        }
    },

    async handleGenericScan(barcode, format) {
        // Record scan in history
        if (window.BarcodesModule && window.BarcodesModule.recordScan) {
            await window.BarcodesModule.recordScan(barcode, 'generic', null, 'item');
        }

        // Si es EAN8, buscar solo en inventario
        if (format === 'EAN8') {
            try {
                const item = await this.findItemByEAN8(barcode);
                if (item) {
                    Utils.showNotification(`Pieza encontrada: ${item.name}`, 'success');
                    // Switch to inventory module
                    UI.showModule('inventory');
                    if (window.Inventory) {
                        window.Inventory.highlightItem(item.id);
                    }
                } else {
                    Utils.showNotification('Producto no encontrado en inventario', 'warning');
                }
            } catch (e) {
                console.error('Error in generic scan:', e);
            }
            return;
        }

        // Si es CODE128, buscar primero en empleados/guías/vendedores, luego en inventario
        try {
            // Buscar en empleados
            const employee = await DB.getByIndex('employees', 'barcode', barcode);
            if (employee) {
                Utils.showNotification(`Empleado encontrado: ${employee.name}`, 'success');
                return;
            }
            
            // Buscar en guías
            const guide = await DB.getByIndex('catalog_guides', 'barcode', barcode);
            if (guide) {
                Utils.showNotification(`Guía encontrado: ${guide.name}`, 'success');
                return;
            }
            
            // Buscar en vendedores
            const seller = await DB.getByIndex('catalog_sellers', 'barcode', barcode);
            if (seller) {
                Utils.showNotification(`Vendedor encontrado: ${seller.name}`, 'success');
                return;
            }
            
            // Buscar en inventario
            const item = await DB.getByIndex('inventory_items', 'barcode', barcode);
            if (item) {
                Utils.showNotification(`Pieza encontrada: ${item.name}`, 'success');
                // Switch to inventory module
                UI.showModule('inventory');
                if (window.Inventory) {
                    window.Inventory.highlightItem(item.id);
                }
            } else {
                Utils.showNotification('Código no encontrado', 'warning');
            }
        } catch (e) {
            console.error('Error in generic scan:', e);
        }
    },

    // Generate barcode with format support
    generateBarcode(value, elementId, format = 'CODE128', options = {}) {
        if (typeof JsBarcode === 'undefined') {
            console.error('JsBarcode no está cargado');
            return;
        }
        
        try {
            const defaultOptions = {
                format: format,
                width: options.width || 2,
                height: options.height || 50,
                displayValue: options.displayValue !== false,
                fontSize: options.fontSize || 12
            };

            JsBarcode(`#${elementId}`, value, defaultOptions);
        } catch (e) {
            console.error('Error generating barcode:', e);
        }
    },

    // Generate Code 128 barcode (backward compatibility)
    generateCode128(value, elementId) {
        this.generateBarcode(value, elementId, 'CODE128');
    },

    // Generate barcode image as data URL with format support
    async generateBarcodeImage(value, format = 'CODE128', options = {}) {
        return new Promise((resolve, reject) => {
            if (typeof JsBarcode === 'undefined') {
                reject(new Error('JsBarcode no está cargado'));
                return;
            }
            
            const canvas = document.createElement('canvas');
            try {
                const defaultOptions = {
                    format: format,
                    width: options.width || 2,
                    height: options.height || 50,
                    displayValue: options.displayValue !== false,
                    fontSize: options.fontSize || 12
                };

                JsBarcode(canvas, value, defaultOptions);
                resolve(canvas.toDataURL('image/png'));
            } catch (e) {
                reject(e);
            }
        });
    },

    // Print barcode label
    async printBarcodeLabel(item) {
        const printWindow = window.open('', '_blank');
        const barcodeImg = await this.generateBarcodeImage(item.barcode || item.sku);
        
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Etiqueta ${item.sku}</title>
                <style>
                    body {
                        margin: 0;
                        padding: 10mm;
                        font-family: Arial, sans-serif;
                        font-size: 10pt;
                    }
                    .label {
                        width: 58mm;
                        text-align: center;
                    }
                    .label h3 {
                        margin: 5mm 0;
                        font-size: 12pt;
                    }
                    .label img {
                        max-width: 100%;
                        height: auto;
                    }
                    .label .price {
                        margin-top: 5mm;
                        font-size: 14pt;
                        font-weight: bold;
                    }
                    @media print {
                        @page {
                            size: 58mm auto;
                            margin: 0;
                        }
                    }
                </style>
            </head>
            <body>
                <div class="label">
                    <h3>${item.name || item.sku}</h3>
                    <img src="${barcodeImg}" alt="Barcode">
                    <div class="price">${Utils.formatCurrency(item.price, 'MXN')}</div>
                    <div>SKU: ${item.sku}</div>
                </div>
            </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.print();
    }
};


