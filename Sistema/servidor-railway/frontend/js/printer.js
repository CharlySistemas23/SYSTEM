// Printer Manager - Impresión Directa ESC/POS para Impresoras Térmicas
// Soporta: GP-5838 SERIES, GP-5830, EC Line 58110, y otras impresoras térmicas 58mm

const Printer = {
    // Configuración según especificación
    port: null,
    writer: null,
    connected: false,
    printerWidth: 32, // 32 caracteres por línea (58mm, fuente A) - ESPECIFICACIÓN
    preferredFilters: null, // Filtros específicos por modelo
    _printingInProgress: false, // Bandera global para evitar impresiones duplicadas
    
    // Comandos ESC/POS
    ESC: 0x1B,
    GS: 0x1D,
    
    commands: {
        // Comandos ESC/POS estándar según especificación
        INIT: [0x1B, 0x40],                    // ESC @ - Inicializar impresora
        CUT: [0x1D, 0x56, 0x00],              // GS V 0 - Cortar papel
        FEED: [0x1B, 0x64, 0x03],             // ESC d n - Avanzar n líneas
        ALIGN_CENTER: [0x1B, 0x61, 0x01],     // ESC a 1 - Centrar
        ALIGN_LEFT: [0x1B, 0x61, 0x00],       // ESC a 0 - Izquierda
        ALIGN_RIGHT: [0x1B, 0x61, 0x02],      // ESC a 2 - Derecha
        BOLD_ON: [0x1B, 0x45, 0x01],          // ESC E 1 - Negritas ON
        BOLD_OFF: [0x1B, 0x45, 0x00],         // ESC E 0 - Negritas OFF
        BOLD_ON_ALT: [0x1D, 0x21, 0x08],      // GS ! 0x08 - Negritas alternativo (bit 3)
        SIZE_NORMAL: [0x1D, 0x21, 0x00],      // GS ! 0x00 - Tamaño normal
        SIZE_NORMAL_BOLD: [0x1D, 0x21, 0x08],  // GS ! 0x08 - Tamaño normal + negritas
        SIZE_DOUBLE: [0x1D, 0x21, 0x11],      // GS ! 0x11 - Doble tamaño (alto y ancho)
        SIZE_DOUBLE_BOLD: [0x1D, 0x21, 0x19], // GS ! 0x19 - Doble tamaño + negritas (0x11 | 0x08)
        UNDERLINE_ON: [0x1B, 0x2D, 0x01],     // ESC - 1 - Subrayado ON
        UNDERLINE_OFF: [0x1B, 0x2D, 0x00],    // ESC - 0 - Subrayado OFF
        // Comandos adicionales para GP-5838 SERIES
        CHAR_SET_ANK: [0x1B, 0x74, 0x00],     // ESC t 0 - Conjunto ANK estándar
        DENSITY_HIGH: [0x1D, 0x28, 0x42, 0x01, 0x00, 0x31, 0x00], // Alta densidad
    },

    // ==================== CONEXIÓN ====================
    
    // Configuraciones comunes de baud rate para impresoras térmicas
    baudRates: [9600, 19200, 38400, 57600, 115200],
    currentBaudRate: 9600,
    
    async connect(baudRate = null) {
        try {
            // Verificar si Web Serial está disponible
            if (!('serial' in navigator)) {
                Utils.showNotification('Tu navegador no soporta impresión directa. Usa Chrome o Edge.', 'warning');
                return false;
            }

            // Usar baud rate guardado o el proporcionado
            const savedBaudRate = localStorage.getItem('printer_baud_rate');
            this.currentBaudRate = baudRate || (savedBaudRate ? parseInt(savedBaudRate) : 9600);

            // Estrategia de conexión mejorada para GP-5838 SERIES
            // Primero intentar sin filtros para permitir selección manual
            // Esto es más confiable cuando el Vendor ID no está en la lista
            
            let portSelected = false;
            
            // Intentar primero SIN filtros (más compatible)
            try {
                Utils.showNotification('Selecciona tu impresora GP-5838 SERIES en la lista de dispositivos', 'info');
                this.port = await navigator.serial.requestPort();
                portSelected = true;
            } catch (e1) {
                // Si el usuario cancela, no hacer nada más
                if (e1.name === 'NotFoundError' || e1.message.includes('cancel')) {
                    throw new Error('Selección de puerto cancelada');
                }
                
                // Si falla sin filtros, intentar con filtros amplios
                console.log('Intentando con filtros amplios...');
                const broadFilters = [
                    { usbVendorId: 0x04F9 }, // Brother (GP-5830 Series)
                    { usbVendorId: 0x0416 }, // Winbond
                    { usbVendorId: 0x0483 }, // STMicroelectronics
                    { usbVendorId: 0x1A86 }, // QinHeng Electronics (CH340) - Muy común
                    { usbVendorId: 0x067B }, // Prolific (PL2303)
                    { usbVendorId: 0x0403 }, // FTDI
                    { usbVendorId: 0x10C4 }, // Silicon Labs
                    { usbVendorId: 0x1D50 }, // OpenMoko
                    { usbVendorId: 0x0E8D }, // MediaTek
                ];
                
                try {
                    this.port = await navigator.serial.requestPort({ filters: broadFilters });
                    portSelected = true;
                } catch (e2) {
                    // Último intento: usar filtros preferidos si existen
                    if (this.preferredFilters && this.preferredFilters.length > 0) {
                        try {
                            this.port = await navigator.serial.requestPort({ filters: this.preferredFilters });
                            portSelected = true;
                        } catch (e3) {
                            throw new Error('No se pudo encontrar ningún dispositivo compatible. Asegúrate de que la GP-5838 SERIES esté conectada por USB y que el navegador tenga permisos para acceder a puertos seriales.');
                        }
                    } else {
                        throw new Error('No se pudo encontrar ningún dispositivo compatible. Asegúrate de que la GP-5838 SERIES esté conectada por USB y que el navegador tenga permisos para acceder a puertos seriales.');
                    }
                }
            }
            
            if (!portSelected) {
                throw new Error('No se seleccionó ningún puerto');
            }
            
            // Abrir conexión
            await this.port.open({ 
                baudRate: this.currentBaudRate,
                dataBits: 8,
                stopBits: 1,
                parity: 'none',
                flowControl: 'none'
            });

            this.writer = this.port.writable.getWriter();
            this.connected = true;
            
            // Guardar configuración
            localStorage.setItem('printer_connected', 'true');
            localStorage.setItem('printer_baud_rate', this.currentBaudRate.toString());
            
            Utils.showNotification(`✅ Impresora conectada (${this.currentBaudRate} baud)`, 'success');
            return true;

        } catch (e) {
            console.error('Error conectando impresora:', e);
            if (e.name === 'NotFoundError') {
                Utils.showNotification('No se seleccionó ninguna impresora', 'warning');
            } else {
                Utils.showNotification('Error al conectar: ' + e.message, 'error');
            }
            return false;
        }
    },

    // Conectar con selector de baud rate
    async connectWithConfig() {
        const baudRate = await this.showBaudRateSelector();
        if (baudRate) {
            return await this.connect(baudRate);
        }
        return false;
    },

    async showBaudRateSelector() {
        return new Promise((resolve) => {
            const currentBaud = localStorage.getItem('printer_baud_rate') || '9600';
            const body = `
                <div style="padding: 10px;">
                    <p style="margin-bottom: 16px; color: var(--color-text-secondary);">
                        Selecciona la velocidad de tu impresora.<br>
                        <small>Si no sabes cuál usar, prueba con 9600 (más común)</small>
                    </p>
                    <div style="display: grid; gap: 8px;">
                        ${this.baudRates.map(rate => `
                            <button class="btn-secondary" style="padding: 12px; ${rate.toString() === currentBaud ? 'background: #1a1a1a; color: white;' : ''}" 
                                    onclick="window._selectedBaud=${rate}; UI.closeModal();">
                                ${rate} baud ${rate === 9600 ? '(recomendado)' : ''}
                            </button>
                        `).join('')}
                    </div>
                    <button class="btn-secondary" style="width: 100%; margin-top: 12px;" onclick="window._selectedBaud=null; UI.closeModal();">
                        Cancelar
                    </button>
                </div>
            `;
            
            window._selectedBaud = null;
            UI.showModal('⚙️ Configurar Impresora', body, '');
            
            const checkResult = setInterval(() => {
                const modal = document.getElementById('modal-container');
                if (!modal || modal.style.display === 'none') {
                    clearInterval(checkResult);
                    resolve(window._selectedBaud);
                }
            }, 100);
        });
    },

    async disconnect() {
        try {
            if (this.writer) {
                this.writer.releaseLock();
                this.writer = null;
            }
            if (this.port) {
                await this.port.close();
                this.port = null;
            }
            this.connected = false;
            localStorage.removeItem('printer_connected');
            Utils.showNotification('Impresora desconectada', 'info');
        } catch (e) {
            console.error('Error desconectando:', e);
        }
    },

    // ==================== ENVÍO DE DATOS ====================
    
    async write(data) {
        if (!this.connected || !this.writer) {
            throw new Error('Impresora no conectada');
        }
        
        const uint8 = new Uint8Array(data);
        await this.writer.write(uint8);
    },

    async writeText(text, useBold = true) {
        // Limpiar texto de caracteres problemáticos primero
        text = this.cleanText(text);
        
        // Convertir texto a bytes usando codificación correcta para GP-5838 SERIES
        const bytes = [];
        
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            
            // Caracteres ASCII estándar (0-127) - usar directamente
            if (char < 128) {
                bytes.push(char);
            }
            // Caracteres Latin-1 extendidos (128-255) - mapear correctamente
            else if (char < 256) {
                bytes.push(char);
            }
            // Caracteres especiales Unicode - reemplazar con equivalentes
            else {
                const replacement = this.replaceSpecialChar(char);
                bytes.push(replacement);
            }
        }
        
        // Si se requiere negrita, activarla antes de escribir usando ambos métodos
        if (useBold) {
            await this.sendCommand(this.commands.BOLD_ON); // ESC E 1
            await this.sendCommand(this.commands.BOLD_ON_ALT); // GS ! 0x08
        }
        
        await this.write(bytes);
        
        // Mantener negrita activa (no desactivar automáticamente)
    },
    
    cleanText(text) {
        if (!text) return '';
        
        // Reemplazar caracteres problemáticos comunes
        return text
            .replace(/[^\x00-\xFF]/g, '?') // Reemplazar caracteres fuera de Latin-1
            .replace(/\u201C|\u201D/g, '"') // Comillas tipográficas
            .replace(/\u2018|\u2019/g, "'") // Apostrofes tipográficos
            .replace(/\u2013|\u2014/g, '-')  // Guiones tipográficos
            .replace(/\u2026/g, '...')       // Puntos suspensivos
            .replace(/\u00A0/g, ' ');        // Espacios no separables
    },

    replaceSpecialChar(charCode) {
        // Mapeo completo de caracteres especiales para GP-5838 SERIES
        const replacements = {
            // Minúsculas con acentos
            0x00E1: 0xA0, // á
            0x00E9: 0x82, // é
            0x00ED: 0xA1, // í
            0x00F3: 0xA2, // ó
            0x00FA: 0xA3, // ú
            0x00F1: 0xA4, // ñ
            // Mayúsculas con acentos
            0x00C1: 0xB5, // Á
            0x00C9: 0x90, // É
            0x00CD: 0xD6, // Í
            0x00D3: 0xE0, // Ó
            0x00DA: 0xE9, // Ú
            0x00D1: 0xA5, // Ñ
            // Otros caracteres comunes
            0x00FC: 0x81, // ü
            0x00DC: 0x9A, // Ü
            0x00E7: 0x87, // ç
            0x00C7: 0x80, // Ç
        };
        
        // Si no hay reemplazo, usar '?' para evitar símbolos raros
        return replacements[charCode] || 0x3F;
    },

    async sendCommand(cmd) {
        await this.write(cmd);
    },

    // ==================== UTILIDADES DE FORMATO ====================
    
    // Función mkline según especificación: alinea left a la izquierda y right a la derecha
    mkline(left, right, width = 32) {
        const leftStr = String(left || '');
        const rightStr = String(right || '');
        const totalLength = leftStr.length + rightStr.length;
        const spaces = Math.max(1, width - totalLength);
        return leftStr + ' '.repeat(spaces) + rightStr;
    },

    centerText(text, width = 32) {
        const padding = Math.max(0, Math.floor((width - text.length) / 2));
        return ' '.repeat(padding) + text;
    },

    rightAlign(left, right, width = 32) {
        return this.mkline(left, right, width);
    },

    line(char = '-', width = 32) {
        return char.repeat(width);
    },

    // ==================== IMPRESIÓN DE TICKETS ====================

    async printTicket(sale) {
        console.log('🖨️ Iniciando impresión de ticket para venta:', sale.folio);
        
        try {
            // ========== FORZAR RECARGA DE CONFIGURACIÓN ==========
            // Limpiar cache y obtener configuración fresca desde BD
            console.log('🔄 Recargando configuración desde BD...');
            localStorage.removeItem('printer_settings');
            localStorage.removeItem('printer_settings_timestamp');
            
            // ========== VERIFICAR Y ASEGURAR QUE LOS DATOS ESTÉN GUARDADOS ==========
            // Verificar que la venta existe en la base de datos
            const savedSale = await DB.get('sales', sale.id);
            if (!savedSale) {
                console.error('Error: La venta no está guardada en la base de datos');
                Utils.showNotification('Error: La venta no está guardada. No se puede imprimir.', 'error');
                return;
            }
            
            // Verificar que los items estén guardados
            const items = await DB.query('sale_items', 'sale_id', sale.id) || [];
            if (items.length === 0) {
                console.warn('Advertencia: No se encontraron items para la venta. Intentando obtener desde sale.id');
                // Si no hay items, intentar obtener desde el objeto sale directamente
                if (!sale.items || sale.items.length === 0) {
                    console.error('Error: No hay items para imprimir');
                    Utils.showNotification('Error: No hay items para imprimir.', 'error');
                    return;
                }
            }
            
            // Verificar que los pagos estén guardados
            const payments = await DB.query('payments', 'sale_id', sale.id) || [];
            if (payments.length === 0) {
                console.warn('Advertencia: No se encontraron pagos para la venta');
            }
            
            console.log('✅ Datos verificados. Venta guardada:', savedSale.folio, 'Items:', items.length, 'Pagos:', payments.length);
            
            // Si no hay conexión directa, usar método alternativo
            if (!this.connected) {
                console.log('Impresora no conectada, usando método fallback');
                return await this.printTicketFallback(sale);
            }
            
            console.log('Impresora conectada, usando método directo ESC/POS');

            // Obtener configuración personalizada (con manejo de errores)
            let settings = {};
            try {
                settings = await this.getPrinterSettings();
                console.log('📋 Configuración obtenida para impresión:', settings);
                
                // Verificar settings críticos en la BD directamente
                const dbSettings = await DB.getAll('settings') || [];
                const ticketFormatDb = dbSettings.find(s => s.key === 'ticket_format');
                const businessNameDb = dbSettings.find(s => s.key === 'business_name');
                console.log('🔍 Verificación directa en BD:', {
                    ticket_format: ticketFormatDb?.value,
                    business_name: businessNameDb?.value
                });
            } catch (e) {
                console.error('❌ Error obteniendo configuración de impresora:', e);
                console.warn('Usando valores por defecto');
                settings = this.getDefaultSettings();
            }
            
            // Validar que la configuración tenga los valores esperados
            if (!settings.ticket_format) {
                console.warn('⚠️ ticket_format no encontrado en settings, usando default');
                settings.ticket_format = 'standard';
            }
            if (!settings.business_name) {
                console.warn('⚠️ business_name no encontrado en settings, usando default');
                settings.business_name = 'OPAL & CO';
            }
            
            const businessName = settings.business_name || 'OPAL & CO';
            const businessPhone = settings.business_phone || '';
            const businessAddress = settings.business_address || '';
            const footerMessage = settings.ticket_footer || 'Gracias por su compra';
            const ticketFormat = settings.ticket_format || 'standard';
            const ticketCopies = settings.ticket_copies || 1;
            const paperCut = settings.paper_cut || 'full';
            const feedLines = settings.feed_lines || 3;
            const printLogo = settings.print_logo !== false;
            const printFooter = settings.print_footer !== false;
            
            console.log('🎨 Configuración aplicada:', {
                businessName,
                businessPhone,
                businessAddress,
                footerMessage,
                ticketFormat,
                ticketCopies,
                paperCut,
                feedLines,
                printFooter
            });

            // Obtener datos adicionales
            const branch = await DB.get('catalog_branches', sale.branch_id);
            const seller = await DB.get('catalog_sellers', sale.seller_id);
            const guide = sale.guide_id ? await DB.get('catalog_guides', sale.guide_id) : null;
            const agency = sale.agency_id ? await DB.get('catalog_agencies', sale.agency_id) : null;
            
            // Obtener nombres de items si no están en los sale_items
            const itemsWithNames = await Promise.all(items.map(async (item) => {
                if (!item.name) {
                    const inventoryItem = await DB.get('inventory_items', item.item_id);
                    return { ...item, name: inventoryItem?.name || 'Pieza' };
                }
                return item;
            }));
            
            // Imprimir según el número de copias configurado
            for (let copy = 1; copy <= ticketCopies; copy++) {
                if (copy > 1) {
                    // Avanzar líneas entre copias
                    await this.sendCommand(this.commands.FEED);
                }
                
                await this.printTicketContent(savedSale, itemsWithNames, payments, branch, seller, guide, agency, settings, ticketFormat, businessName, businessPhone, businessAddress, footerMessage, printFooter);
            }
            
            // Aplicar corte según configuración
            if (paperCut === 'full') {
                await this.sendCommand(this.commands.CUT); // GS V 0 - Corte completo
            } else if (paperCut === 'partial') {
                await this.sendCommand([0x1D, 0x56, 0x01]); // GS V 1 - Corte parcial
            }
            
            // Avanzar líneas después del corte
            if (feedLines > 0) {
                await this.sendCommand([0x1B, 0x64, feedLines]); // ESC d n
            }

            Utils.showNotification(`✅ Ticket impreso (${ticketCopies} copia${ticketCopies > 1 ? 's' : ''})`, 'success');

        } catch (e) {
            console.error('Error imprimiendo ticket (método directo):', e);
            console.error('Stack:', e.stack);
            // Intentar método alternativo siempre
            try {
                await this.printTicketFallback(sale);
            } catch (fallbackError) {
                console.error('Error también en método fallback:', fallbackError);
                Utils.showNotification('Error al imprimir ticket. Revisa la consola para más detalles.', 'error');
            }
        }
    },
    
    // Función auxiliar para imprimir el contenido del ticket según el formato
    async printTicketContent(sale, items, payments, branch, seller, guide, agency, settings, ticketFormat, businessName, businessPhone, businessAddress, footerMessage, printFooter) {
        console.log('🎫 Imprimiendo ticket con formato:', ticketFormat);
        console.log('📝 Datos del ticket:', {
            businessName,
            businessPhone,
            businessAddress,
            footerMessage,
            printFooter,
            itemsCount: items.length,
            paymentsCount: payments.length
        });

        // ========== INICIALIZACIÓN SEGÚN ESPECIFICACIÓN ==========
        await this.sendCommand(this.commands.INIT); // ESC @
        await this.sendCommand(this.commands.CHAR_SET_ANK); // ESC t 0 - Conjunto ANK estándar
        // Activar negritas usando ambos métodos para máxima compatibilidad
        await this.sendCommand(this.commands.BOLD_ON); // ESC E 1 - Negritas ON
        await this.sendCommand(this.commands.BOLD_ON_ALT); // GS ! 0x08 - Negritas alternativo
        await this.sendCommand(this.commands.SIZE_NORMAL_BOLD); // GS ! 0x08 - Tamaño normal + negritas
        
        // ========== ENCABEZADO CENTRADO ==========
        await this.sendCommand(this.commands.ALIGN_CENTER); // ESC a 1
        await this.sendCommand(this.commands.BOLD_ON); // Asegurar negritas después de cambio de alineación
        await this.sendCommand(this.commands.BOLD_ON_ALT); // Asegurar negritas alternativo
        await this.writeText(businessName + '\r\n', true);
        
        // Información adicional del negocio según formato
        if (ticketFormat !== 'minimal') {
            if (businessPhone) {
                await this.writeText(businessPhone + '\r\n', true);
            }
            if (businessAddress) {
                await this.writeText(businessAddress + '\r\n', true);
            }
        }
        
        // Separador
        await this.sendCommand(this.commands.BOLD_ON); // Asegurar negritas
        await this.sendCommand(this.commands.BOLD_ON_ALT); // Asegurar negritas alternativo
        await this.writeText(this.line('-') + '\r\n', true);
        
        // ========== BLOQUE DE DATOS A LA IZQUIERDA ==========
        await this.sendCommand(this.commands.ALIGN_LEFT); // ESC a 0
        await this.sendCommand(this.commands.BOLD_ON); // Asegurar negritas después de cambio de alineación
        await this.sendCommand(this.commands.BOLD_ON_ALT); // Asegurar negritas alternativo
        
        // Información de la venta usando mkline para alineación
        const dateTime = this.formatDate(sale.created_at);
        const dateParts = dateTime.split(' ');
        const date = dateParts[0] || '';
        const time = dateParts[1] || '';
        
        await this.writeText(this.mkline('FOLIO:', sale.folio) + '\r\n', true);
        if (date && ticketFormat !== 'minimal') await this.writeText(this.mkline('FECHA:', date) + '\r\n', true);
        if (time && ticketFormat !== 'minimal') await this.writeText(this.mkline('HORA:', time) + '\r\n', true);
        
        if (ticketFormat !== 'minimal') {
            await this.writeText(this.mkline('VENDEDOR:', (seller?.name || 'N/A').toUpperCase()) + '\r\n', true);
            
            // Guía y Agencia si existen
            if (guide) {
                await this.writeText(this.mkline('GUIA:', guide.name.toUpperCase()) + '\r\n', true);
            }
            if (agency) {
                await this.writeText(this.mkline('AGENCIA:', agency.name.toUpperCase()) + '\r\n', true);
            }
        }
        
        // Separador
        await this.sendCommand(this.commands.BOLD_ON); // Asegurar negritas
        await this.sendCommand(this.commands.BOLD_ON_ALT); // Asegurar negritas alternativo
        await this.writeText(this.line('-') + '\r\n', true);

        // ========== ÍTEMS ==========
        if (ticketFormat !== 'minimal') {
            for (const item of items) {
                // Nombre del producto en negritas
                await this.sendCommand(this.commands.BOLD_ON); // Asegurar negritas
                await this.sendCommand(this.commands.BOLD_ON_ALT); // Asegurar negritas alternativo
                const itemName = (item.name || 'Pieza').toUpperCase().substring(0, 32);
                await this.writeText(itemName + '\r\n', true);
                
                // Cantidad×precio a la izquierda, subtotal a la derecha
                await this.sendCommand(this.commands.BOLD_ON); // Asegurar negritas
                await this.sendCommand(this.commands.BOLD_ON_ALT); // Asegurar negritas alternativo
                const qtyPrice = item.quantity + ' X ' + this.formatMoney(item.price);
                const subtotal = this.formatMoney(item.subtotal);
                await this.writeText(this.mkline(qtyPrice, subtotal) + '\r\n', true);
                
                if (item.discount > 0 && ticketFormat === 'detailed') {
                    await this.sendCommand(this.commands.BOLD_ON); // Asegurar negritas
                    await this.sendCommand(this.commands.BOLD_ON_ALT); // Asegurar negritas alternativo
                    await this.writeText('  DESC: ' + item.discount + '%\r\n', true);
                }
            }

            // Separador
            await this.writeText(this.line('-') + '\r\n', true);
        }

        // ========== SUBTOTALES/DESCUENTOS ==========
        if (ticketFormat !== 'minimal') {
            await this.sendCommand(this.commands.BOLD_ON); // Asegurar negritas
            await this.sendCommand(this.commands.BOLD_ON_ALT); // Asegurar negritas alternativo
            await this.writeText(this.mkline('SUBTOTAL:', this.formatMoney(sale.subtotal)) + '\r\n', true);
            
            if (sale.discount > 0) {
                await this.sendCommand(this.commands.BOLD_ON); // Asegurar negritas
                await this.sendCommand(this.commands.BOLD_ON_ALT); // Asegurar negritas alternativo
                const discountPercent = sale.subtotal > 0 
                    ? Math.round((sale.discount / sale.subtotal) * 100) 
                    : 0;
                await this.writeText(this.mkline('DESCUENTO (' + discountPercent + '%):', '-' + this.formatMoney(sale.discount)) + '\r\n', true);
            }
        }
        
        // ========== TOTAL EN DOBLE TAMAÑO ==========
        await this.sendCommand(this.commands.SIZE_DOUBLE_BOLD); // GS ! 0x19 - Doble tamaño + negritas
        await this.sendCommand(this.commands.BOLD_ON); // Asegurar negritas después de cambio de tamaño
        await this.writeText(this.mkline('TOTAL:', this.formatMoney(sale.total)) + '\r\n', true);
        await this.sendCommand(this.commands.SIZE_NORMAL_BOLD); // GS ! 0x08 - Volver a tamaño normal + negritas
        await this.sendCommand(this.commands.BOLD_ON); // Asegurar negritas después de volver a tamaño normal
        await this.sendCommand(this.commands.BOLD_ON_ALT); // Asegurar negritas alternativo

        // Separador
        await this.sendCommand(this.commands.BOLD_ON); // Asegurar negritas
        await this.sendCommand(this.commands.BOLD_ON_ALT); // Asegurar negritas alternativo
        await this.writeText(this.line('-') + '\r\n', true);

        // ========== PAGOS ==========
        if (ticketFormat !== 'minimal' && payments.length > 0) {
            await this.sendCommand(this.commands.BOLD_ON); // Asegurar negritas
            await this.sendCommand(this.commands.BOLD_ON_ALT); // Asegurar negritas alternativo
            await this.writeText('PAGOS:\r\n', true);
            for (const p of payments) {
                await this.sendCommand(this.commands.BOLD_ON); // Asegurar negritas en cada línea
                await this.sendCommand(this.commands.BOLD_ON_ALT); // Asegurar negritas alternativo
                const methodName = this.getPaymentMethodName(p.method_id).toUpperCase();
                const amount = this.formatMoney(p.amount, p.currency);
                await this.writeText(this.mkline(methodName + ':', amount) + '\r\n', true);
            }

            // Separador
            await this.sendCommand(this.commands.BOLD_ON); // Asegurar negritas
            await this.sendCommand(this.commands.BOLD_ON_ALT); // Asegurar negritas alternativo
            await this.writeText(this.line('-') + '\r\n', true);
        }

        // ========== PIE CENTRADO ==========
        if (printFooter) {
            await this.sendCommand(this.commands.ALIGN_CENTER); // ESC a 1
            await this.sendCommand(this.commands.BOLD_ON); // Asegurar negritas después de cambio de alineación
            await this.sendCommand(this.commands.BOLD_ON_ALT); // Asegurar negritas alternativo
            await this.writeText(footerMessage.toUpperCase() + '\r\n', true);
            await this.sendCommand(this.commands.BOLD_ON); // Asegurar negritas
            await this.sendCommand(this.commands.BOLD_ON_ALT); // Asegurar negritas alternativo
            const currentDateTime = this.formatDate(new Date());
            await this.writeText(currentDateTime + '\r\n\r\n', true);
        }
    },

    // ==================== MÉTODO ALTERNATIVO (IFRAME OCULTO) ====================
    
    async printTicketFallback(sale) {
        // Protección global contra impresiones duplicadas
        if (this._printingInProgress) {
            console.log('Impresión ya en progreso, ignorando llamada duplicada');
            return;
        }
        
        this._printingInProgress = true;
        
        try {
            console.log('Usando método fallback de impresión para venta:', sale.folio);
            
            // ========== VERIFICAR Y ASEGURAR QUE LOS DATOS ESTÉN GUARDADOS ==========
            const savedSale = await DB.get('sales', sale.id);
            if (!savedSale) {
                console.error('Error: La venta no está guardada en la base de datos');
                Utils.showNotification('Error: La venta no está guardada. No se puede imprimir.', 'error');
                this._printingInProgress = false;
                return;
            }
            
            const items = await DB.query('sale_items', 'sale_id', sale.id) || [];
            const payments = await DB.query('payments', 'sale_id', sale.id) || [];
            
            // Obtener nombres de items si no están en los sale_items
            const itemsWithNames = await Promise.all(items.map(async (item) => {
                if (!item.name) {
                    const inventoryItem = await DB.get('inventory_items', item.item_id);
                    return { ...item, name: inventoryItem?.name || 'Pieza' };
                }
                return item;
            }));
            
            const branch = await DB.get('catalog_branches', sale.branch_id);
            const seller = await DB.get('catalog_sellers', sale.seller_id);
            const guide = sale.guide_id ? await DB.get('catalog_guides', sale.guide_id) : null;
            const agency = sale.agency_id ? await DB.get('catalog_agencies', sale.agency_id) : null;

            // Obtener configuración para el fallback también
            let settings = {};
            try {
                settings = await this.getPrinterSettings();
                console.log('📋 Configuración obtenida para fallback:', settings);
            } catch (e) {
                console.error('❌ Error obteniendo configuración en fallback:', e);
                settings = this.getDefaultSettings();
            }
            
            // Validar configuración
            if (!settings.ticket_format) {
                console.warn('⚠️ ticket_format no encontrado en settings fallback, usando default');
                settings.ticket_format = 'standard';
            }
            
            const ticketCopies = settings.ticket_copies || 1;
            console.log('🎨 Configuración fallback aplicada:', {
                ticketFormat: settings.ticket_format,
                ticketCopies,
                businessName: settings.business_name,
                footerMessage: settings.ticket_footer
            });
            
            // Imprimir según el número de copias configurado
            for (let copy = 1; copy <= ticketCopies; copy++) {
                const ticketHTML = this.buildTicketHTML(savedSale, itemsWithNames, payments, branch, seller, guide, agency, settings);
                
                // Usar iframe oculto para evitar abrir ventanas
                // Crear un nuevo iframe cada vez para evitar conflictos
                const iframe = document.createElement('iframe');
                iframe.id = 'print-frame-' + Date.now() + '-' + copy; // ID único por copia
                iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
                document.body.appendChild(iframe);
                
                // Esperar a que el iframe cargue y luego imprimir (solo una vez)
                let printCalled = false;
                let checkInterval = null;
                let fallbackTimeout = null;
                
                const cleanup = () => {
                    if (checkInterval) {
                        clearInterval(checkInterval);
                        checkInterval = null;
                    }
                    if (fallbackTimeout) {
                        clearTimeout(fallbackTimeout);
                        fallbackTimeout = null;
                    }
                };
                
                const printWhenReady = () => {
                    if (printCalled) {
                        console.log('Print ya fue llamado, ignorando llamada duplicada');
                        return; // Evitar llamadas duplicadas
                    }
                    printCalled = true;
                    
                    // Limpiar todos los timeouts/intervals
                    cleanup();
                    
                    try {
                        iframe.contentWindow.focus();
                        iframe.contentWindow.print();
                        if (copy === ticketCopies) {
                            Utils.showNotification(`Ticket enviado a impresora (${ticketCopies} copia${ticketCopies > 1 ? 's' : ''})`, 'success');
                        }
                        
                        // Limpiar el iframe después de un tiempo
                        setTimeout(() => {
                            if (iframe && iframe.parentNode) {
                                iframe.parentNode.removeChild(iframe);
                            }
                        }, 2000);
                    } catch (e) {
                        console.error('Error al imprimir desde iframe:', e);
                        if (copy === ticketCopies) {
                            Utils.showNotification('Error al abrir diálogo de impresión', 'error');
                        }
                    }
                };
                
                // Escribir el contenido en el iframe
                const doc = iframe.contentWindow.document;
                doc.open();
                doc.write(ticketHTML);
                doc.close();
                
                // Usar solo un método: esperar a que el documento esté listo
                const checkAndPrint = () => {
                    if (printCalled) {
                        cleanup();
                        return;
                    }
                    
                    try {
                        if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
                            printWhenReady();
                        }
                    } catch (e) {
                        console.error('Error verificando estado del iframe:', e);
                    }
                };
                
                // Verificar cada 100ms hasta que esté listo o se haya impreso
                checkInterval = setInterval(checkAndPrint, 100);
                
                // Fallback de seguridad: solo si después de 2 segundos no se ha impreso
                fallbackTimeout = setTimeout(() => {
                    if (!printCalled) {
                        console.warn('Fallback: forzando impresión después de timeout');
                        printWhenReady();
                    }
                }, 2000);
                
                // Esperar un poco entre copias
                if (copy < ticketCopies) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
            
            // Resetear bandera global después de un delay
            setTimeout(() => {
                this._printingInProgress = false;
            }, 1000);
        } catch (e) {
            console.error('Error en fallback de impresión:', e);
            console.error('Stack:', e.stack);
            Utils.showNotification('Error al imprimir ticket. Revisa la consola para más detalles.', 'error');
            // Resetear bandera en caso de error
            this._printingInProgress = false;
        }
    },

    // ==================== FORMATEO ====================
    
    formatMoney(amount, currency = 'MXN') {
        const num = parseFloat(amount) || 0;
        if (currency === 'USD') {
            return '$' + num.toFixed(2) + ' USD';
        }
        return '$' + num.toFixed(2);
    },

    formatDate(date) {
        const d = new Date(date);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');
        const secs = String(d.getSeconds()).padStart(2, '0');
        // Formato: DD/MM/YYYY HH:MM:SS
        return `${day}/${month}/${year} ${hours}:${mins}:${secs}`;
    },

    getPaymentMethodName(methodId) {
        const methods = {
            'CASH_USD': 'Efectivo USD',
            'CASH_MXN': 'Efectivo MXN',
            'CASH_EUR': 'Efectivo EUR',
            'CASH_CAD': 'Efectivo CAD',
            'TPV_VISA': 'Visa/MC',
            'TPV_AMEX': 'Amex'
        };
        return methods[methodId] || 'Otro';
    },

    // ==================== HTML PARA FALLBACK ====================
    
    buildTicketHTML(sale, items, payments, branch, seller, guide, agency, settings = {}) {
        const businessName = settings.business_name || 'OPAL & CO';
        const businessPhone = settings.business_phone || '';
        const businessAddress = settings.business_address || '';
        const footerMessage = settings.ticket_footer || 'Gracias por su compra';
        const ticketFormat = settings.ticket_format || 'standard';
        const printFooter = settings.print_footer !== false;
        
        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Ticket ${sale.folio}</title>
    <style>
        @page { size: 58mm auto; margin: 0; }
        @media print { 
            html, body { width: 58mm; margin: 0 !important; padding: 0 !important; }
            @page { margin: 0; }
        }
        * { margin: 0; padding: 0; box-sizing: border-box; font-weight: 900 !important; }
        body {
            font-family: 'Courier New', monospace;
            font-size: 13pt;
            width: 58mm;
            padding: 2mm;
            line-height: 1.3;
            font-weight: 900 !important;
        }
        .center { text-align: center; font-weight: 900 !important; font-size: 13pt !important; }
        .bold { font-weight: 900 !important; font-size: 13pt !important; }
        .big { font-size: 16pt !important; font-weight: 900 !important; }
        .small { font-size: 11pt !important; font-weight: 900 !important; }
        .line { border-bottom: 2px dashed #000; margin: 3mm 0; font-weight: 900 !important; }
        .row { display: flex; justify-content: space-between; margin: 2mm 0; font-weight: 900 !important; font-size: 13pt !important; }
        .total { font-size: 18pt !important; font-weight: 900 !important; border-top: 2px solid #000; padding-top: 3mm; margin-top: 3mm; }
        h1 { font-size: 20pt !important; margin: 0; font-weight: 900 !important; }
        div { font-weight: 900 !important; font-size: 13pt !important; }
        span { font-weight: 900 !important; font-size: 13pt !important; }
        p { font-weight: 900 !important; font-size: 13pt !important; }
        td { font-weight: 900 !important; font-size: 13pt !important; }
        th { font-weight: 900 !important; font-size: 13pt !important; }
    </style>
</head>
<body>
    <div class="center">
        <h1>${businessName}</h1>
        ${businessPhone && ticketFormat !== 'minimal' ? `<div style="font-size: 12pt !important; font-weight: 900 !important;">${businessPhone}</div>` : ''}
        ${businessAddress && ticketFormat !== 'minimal' ? `<div style="font-size: 11pt !important; font-weight: 900 !important;">${businessAddress}</div>` : ''}
        ${ticketFormat !== 'minimal' ? `<div style="font-size: 15pt !important; font-weight: 900 !important;">${branch?.name || 'Tienda'}</div>` : ''}
        <div style="font-size: 13pt !important; font-weight: 900 !important;">Folio: ${sale.folio}</div>
        ${ticketFormat !== 'minimal' ? `<div style="font-size: 13pt !important; font-weight: 900 !important;">${this.formatDate(sale.created_at)}</div>` : ''}
        </div>
    <div class="line"></div>
    ${ticketFormat !== 'minimal' ? `
        <div class="row" style="font-size: 13pt !important; font-weight: 900 !important;"><span>Vendedor:</span><span>${seller?.name || 'N/A'}</span></div>
        ${guide ? `<div class="row" style="font-size: 13pt !important; font-weight: 900 !important;"><span>Guía:</span><span>${guide.name}</span></div>` : ''}
        ${agency ? `<div class="row" style="font-size: 13pt !important; font-weight: 900 !important;"><span>Agencia:</span><span>${agency.name}</span></div>` : ''}
        <div class="line"></div>
    ` : ''}
    ${ticketFormat !== 'minimal' ? items.map(item => `
        <div class="bold" style="font-size: 14pt !important; font-weight: 900 !important; margin-bottom: 2mm;">${(item.name || 'Pieza').substring(0, 28)}</div>
        <div class="row" style="font-size: 13pt !important; font-weight: 900 !important;">
            <span>${item.quantity}x ${this.formatMoney(item.price)}</span>
            <span>${this.formatMoney(item.subtotal)}</span>
            </div>
        ${item.discount > 0 && ticketFormat === 'detailed' ? `<div style="font-size: 12pt !important; font-weight: 900 !important;">Desc: ${item.discount}%</div>` : ''}
    `).join('') : ''}
    ${ticketFormat !== 'minimal' ? `
        <div class="line"></div>
        <div class="row" style="font-size: 14pt !important; font-weight: 900 !important;"><span>Subtotal:</span><span>${this.formatMoney(sale.subtotal)}</span></div>
        ${sale.discount > 0 ? `<div class="row" style="font-size: 14pt !important; font-weight: 900 !important;"><span>Descuento:</span><span>-${this.formatMoney(sale.discount)}</span></div>` : ''}
    ` : ''}
    <div class="row total" style="font-size: 18pt !important; font-weight: 900 !important;"><span>TOTAL:</span><span>${this.formatMoney(sale.total)}</span></div>
    ${ticketFormat !== 'minimal' && payments.length > 0 ? `
        <div class="line"></div>
        <div class="bold" style="font-size: 14pt !important; font-weight: 900 !important; margin-bottom: 2mm;">PAGOS:</div>
        ${payments.map(p => `<div class="row" style="font-size: 13pt !important; font-weight: 900 !important;"><span>${this.getPaymentMethodName(p.method_id)}:</span><span>${this.formatMoney(p.amount, p.currency)}</span></div>`).join('')}
    ` : ''}
    ${printFooter ? `
        <div class="line"></div>
        <div class="center">
            <div style="font-size: 16pt !important; font-weight: 900 !important; margin-top: 3mm;">${footerMessage.toUpperCase()}</div>
            <div style="font-size: 13pt !important; font-weight: 900 !important;">${this.formatDate(new Date())}</div>
        </div>
    ` : ''}
    <script>
        // El diálogo de impresión se maneja desde el código principal
        // No auto-imprimir aquí para evitar duplicados
    </script>
</body>
</html>`;
    },

    // ==================== OTROS TICKETS ====================

    async printRepairTicket(repair, customer, item) {
        if (this.connected) {
            // Impresión directa ESC/POS
            await this.sendCommand(this.commands.INIT);
            await this.sendCommand(this.commands.ALIGN_CENTER);
            await this.sendCommand(this.commands.DOUBLE_ON);
            await this.writeText('OPAL & CO\n');
            await this.sendCommand(this.commands.DOUBLE_OFF);
            await this.writeText('REPARACION\n');
            await this.writeText('Folio: ' + repair.folio + '\n');
            await this.writeText(this.line('-') + '\n');
            await this.sendCommand(this.commands.ALIGN_LEFT);
            await this.writeText('Cliente: ' + (customer?.name || 'N/A') + '\n');
            await this.writeText('Pieza: ' + (item?.sku || 'N/A') + '\n');
            if (item?.name) await this.writeText(item.name.substring(0, 30) + '\n');
            await this.writeText('Estado: ' + repair.status + '\n');
            await this.writeText('Costo: ' + this.formatMoney(repair.cost) + '\n');
            await this.writeText(this.line('-') + '\n');
            await this.writeText('Descripcion:\n' + (repair.description || '').substring(0, 100) + '\n');
            await this.sendCommand(this.commands.FEED);
            await this.sendCommand(this.commands.CUT);
            Utils.showNotification('Ticket impreso', 'success');
        } else {
            // Fallback HTML usando iframe oculto
            const html = this.buildRepairTicketHTML(repair, customer, item);
            let iframe = document.getElementById('print-frame');
            if (!iframe) {
                iframe = document.createElement('iframe');
                iframe.id = 'print-frame';
                iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
                document.body.appendChild(iframe);
            }
            const doc = iframe.contentWindow.document;
            doc.open();
            doc.write(html);
            doc.close();
            iframe.onload = () => {
                iframe.contentWindow.focus();
                iframe.contentWindow.print();
            };
            Utils.showNotification('Ticket de reparación enviado', 'success');
        }
    },

    buildRepairTicketHTML(repair, customer, item) {
        return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Reparación ${repair.folio}</title>
<style>@page{size:58mm auto;margin:0}body{font-family:monospace;font-size:9pt;width:58mm;padding:2mm}.center{text-align:center}.line{border-bottom:1px dashed #000;margin:2mm 0}</style>
</head><body>
<div class="center"><h2>OPAL & CO</h2><div>REPARACIÓN</div><div>Folio: ${repair.folio}</div></div>
<div class="line"></div>
<div>Cliente: ${customer?.name || 'N/A'}</div>
<div>Pieza: ${item?.sku || 'N/A'}</div>
<div>Estado: ${repair.status}</div>
<div>Costo: ${this.formatMoney(repair.cost)}</div>
<div class="line"></div>
<div><b>Descripción:</b></div>
<div>${repair.description || ''}</div>
<div class="line"></div>
<div class="center">Gracias por su preferencia</div>
</body></html>`;
    },

    // Obtener configuración de impresión guardada
    async getPrinterSettings() {
        try {
            // Verificar que DB esté disponible
            if (typeof DB === 'undefined' || !DB.getAll) {
                console.warn('DB no disponible, usando valores por defecto');
                return this.getDefaultSettings();
            }
            
            // Intentar obtener desde localStorage primero (más rápido)
            const cachedSettings = localStorage.getItem('printer_settings');
            const cachedTimestamp = localStorage.getItem('printer_settings_timestamp');
            
            // Si hay configuración en cache y es reciente (menos de 5 minutos), usarla
            if (cachedSettings && cachedTimestamp) {
                const cacheAge = Date.now() - new Date(cachedTimestamp).getTime();
                if (cacheAge < 5 * 60 * 1000) { // 5 minutos
                    try {
                        const parsed = JSON.parse(cachedSettings);
                        console.log('📋 Usando configuración desde cache:', parsed);
                        return this.normalizeSettings(parsed);
                    } catch (e) {
                        console.warn('Error parseando cache, obteniendo de BD:', e);
                    }
                }
            }
            
            // Obtener desde la base de datos
            const settings = await DB.getAll('settings') || [];
            const settingsMap = {};
            
            // Convertir array de settings a mapa
            settings.forEach(s => {
                if (s && s.key && s.value !== undefined) {
                    // Convertir strings 'true'/'false' a booleanos
                    if (s.value === 'true' || s.value === true) {
                        settingsMap[s.key] = true;
                    } else if (s.value === 'false' || s.value === false) {
                        settingsMap[s.key] = false;
                    } else {
                        settingsMap[s.key] = s.value;
                    }
                }
            });
            
            const normalizedSettings = {
                business_name: settingsMap.business_name || 'OPAL & CO',
                business_phone: settingsMap.business_phone || '',
                business_address: settingsMap.business_address || '',
                ticket_footer: settingsMap.ticket_footer || 'Gracias por su compra',
                ticket_format: settingsMap.ticket_format || 'standard',
                ticket_copies: parseInt(settingsMap.ticket_copies) || 1,
                paper_cut: settingsMap.paper_cut || 'full',
                feed_lines: parseInt(settingsMap.feed_lines) || 3,
                print_logo: settingsMap.print_logo !== false && settingsMap.print_logo !== 'false',
                print_barcode: settingsMap.print_barcode === true || settingsMap.print_barcode === 'true',
                print_qr: settingsMap.print_qr === true || settingsMap.print_qr === 'true',
                auto_print: settingsMap.auto_print !== false && settingsMap.auto_print !== 'false',
                print_footer: settingsMap.print_footer !== false && settingsMap.print_footer !== 'false',
                print_duplicate: settingsMap.print_duplicate === true || settingsMap.print_duplicate === 'true'
            };
            
            // Actualizar cache
            localStorage.setItem('printer_settings', JSON.stringify(normalizedSettings));
            localStorage.setItem('printer_settings_timestamp', new Date().toISOString());
            
            console.log('📋 Configuración obtenida de BD:', normalizedSettings);
            return normalizedSettings;
        } catch (e) {
            console.error('Error obteniendo configuración:', e);
            return this.getDefaultSettings();
        }
    },
    
    // Forzar recarga de configuración desde la base de datos (limpiar cache)
    async reloadPrinterSettings() {
        console.log('🔄 Forzando recarga de configuración desde BD...');
        // Limpiar cache
        localStorage.removeItem('printer_settings');
        localStorage.removeItem('printer_settings_timestamp');
        // Obtener desde BD
        return await this.getPrinterSettings();
    },
    
    // Normalizar settings (convertir tipos correctamente)
    normalizeSettings(settingsMap) {
        return {
            business_name: settingsMap.business_name || 'OPAL & CO',
            business_phone: settingsMap.business_phone || '',
            business_address: settingsMap.business_address || '',
            ticket_footer: settingsMap.ticket_footer || 'Gracias por su compra',
            ticket_format: settingsMap.ticket_format || 'standard',
            ticket_copies: parseInt(settingsMap.ticket_copies) || 1,
            paper_cut: settingsMap.paper_cut || 'full',
            feed_lines: parseInt(settingsMap.feed_lines) || 3,
            print_logo: settingsMap.print_logo !== false && settingsMap.print_logo !== 'false',
            print_barcode: settingsMap.print_barcode === true || settingsMap.print_barcode === 'true',
            print_qr: settingsMap.print_qr === true || settingsMap.print_qr === 'true',
            auto_print: settingsMap.auto_print !== false && settingsMap.auto_print !== 'false',
            print_footer: settingsMap.print_footer !== false && settingsMap.print_footer !== 'false',
            print_duplicate: settingsMap.print_duplicate === true || settingsMap.print_duplicate === 'true'
        };
    },

    getDefaultSettings() {
        return {
            business_name: 'OPAL & CO',
            business_phone: '',
            business_address: '',
            ticket_footer: 'Gracias por su compra',
            ticket_format: 'standard',
            ticket_copies: 1,
            paper_cut: 'full',
            feed_lines: 3,
            print_logo: true,
            print_barcode: false,
            print_qr: false,
            auto_print: true,
            print_footer: true,
            print_duplicate: false
        };
    },

    // Test de impresión según especificación
    async testPrint() {
        if (this.connected) {
            try {
                // Inicialización según especificación
                await this.sendCommand(this.commands.INIT); // ESC @
                await this.sendCommand(this.commands.CHAR_SET_ANK); // ESC t 0
                await this.sendCommand(this.commands.BOLD_ON); // ESC E 1
                await this.sendCommand(this.commands.SIZE_NORMAL); // GS ! 0x00
                
                // Encabezado centrado
                await this.sendCommand(this.commands.ALIGN_CENTER); // ESC a 1
                await this.writeText('OPAL & CO\r\n', true);
                await this.writeText(this.line('-') + '\r\n', true);
                
                // Datos a la izquierda
                await this.sendCommand(this.commands.ALIGN_LEFT); // ESC a 0
                await this.writeText(this.mkline('FOLIO:', 'TEST-001') + '\r\n', true);
                const testDate = this.formatDate(new Date());
                const dateParts = testDate.split(' ');
                await this.writeText(this.mkline('FECHA:', dateParts[0]) + '\r\n', true);
                await this.writeText(this.mkline('HORA:', dateParts[1]) + '\r\n', true);
                await this.writeText(this.mkline('VENDEDOR:', 'SISTEMA') + '\r\n', true);
                await this.writeText(this.line('-') + '\r\n', true);
                
                // Items de prueba
                await this.writeText('ANILLO ORO 18K DIAMANTE\r\n', true);
                await this.writeText(this.mkline('1 X $15,000.00', '$15,000.00') + '\r\n', true);
                await this.writeText('\r\nCOLLAR PLATA 925\r\n', true);
                await this.writeText(this.mkline('1 X $3,500.00', '$3,500.00') + '\r\n', true);
                await this.writeText(this.line('-') + '\r\n', true);
                
                // Totales
                await this.writeText(this.mkline('SUBTOTAL:', '$18,500.00') + '\r\n', true);
                await this.writeText(this.mkline('DESCUENTO (10%):', '-$1,850.00') + '\r\n', true);
                
                // TOTAL en doble tamaño
                await this.sendCommand(this.commands.SIZE_DOUBLE); // GS ! 0x11
                await this.writeText(this.mkline('TOTAL:', '$16,650.00') + '\r\n', true);
                await this.sendCommand(this.commands.SIZE_NORMAL); // GS ! 0x00
                
                await this.writeText(this.line('-') + '\r\n', true);
                await this.writeText('PAGOS:\r\n', true);
                await this.writeText(this.mkline('EFECTIVO USD:', '$800.00 USD') + '\r\n', true);
                await this.writeText(this.mkline('VISA/MC:', '$650.00 MXN') + '\r\n', true);
                await this.writeText(this.line('-') + '\r\n', true);
                
                // Pie centrado
                await this.sendCommand(this.commands.ALIGN_CENTER); // ESC a 1
                await this.writeText('GRACIAS POR SU COMPRA\r\n', true);
                await this.writeText(testDate + '\r\n\r\n', true);
                
                // Corte
                await this.sendCommand(this.commands.CUT); // GS V 0
                
                Utils.showNotification('Prueba de impresión enviada', 'success');
            } catch (e) {
                console.error('Error en prueba de impresión:', e);
                Utils.showNotification('Error al imprimir prueba: ' + e.message, 'error');
            }
        } else {
            Utils.showNotification('Primero conecta la impresora', 'warning');
        }
    }
};

// Exponer globalmente
window.Printer = Printer;
