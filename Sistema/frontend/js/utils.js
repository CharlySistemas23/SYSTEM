// Utilidades generales

const Utils = {
    // Delay/Sleep - promesa que espera X milisegundos
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },
    
    // Alias para delay
    sleep(ms) {
        return this.delay(ms);
    },

    // Formato de moneda
    formatCurrency(amount, currency = 'MXN') {
        const symbols = {
            'MXN': '$',
            'USD': 'US$',
            'EUR': '€',
            'CAD': 'C$'
        };
        const symbol = symbols[currency] || '$';
        return `${symbol}${parseFloat(amount || 0).toFixed(2)}`;
    },

    // Formato de fecha
    formatDate(date, format = 'YYYY-MM-DD') {
        if (!date) return '';
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        
        return format
            .replace('YYYY', year)
            .replace('MM', month)
            .replace('DD', day)
            .replace('HH', hours)
            .replace('mm', minutes);
    },

    // Generar ID único
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    // Generar folio
    generateFolio(branchCode, date = new Date()) {
        const dateStr = this.formatDate(date, 'YYYYMMDD');
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        return `${branchCode}-${dateStr}-${random}`;
    },

    // Escapar HTML para prevenir XSS
    escapeHtml(text) {
        if (text == null || text === undefined) return '';
        const str = String(text);
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return str.replace(/[&<>"']/g, m => map[m]);
    },

    // Hash simple para PIN
    async hashPin(pin) {
        const encoder = new TextEncoder();
        const data = encoder.encode(pin);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    },

    // Validar PIN
    async validatePin(inputPin, storedHash) {
        const inputHash = await this.hashPin(inputPin);
        return inputHash === storedHash;
    },

    // Debounce
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    // Mostrar notificación
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            padding: 8px 14px;
            background: ${type === 'error' ? '#d32f2f' : type === 'success' ? '#388e3c' : '#2c2c2c'};
            color: white;
            border-radius: 8px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.2);
            z-index: 2000;
            animation: slideIn 0.3s ease;
        `;
        document.body.appendChild(notification);
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    },

    // Modal de alerta personalizado (reemplaza alert nativo)
    async alert(message, title = 'Aviso') {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'custom-modal-overlay';
            modal.innerHTML = `
                <div class="custom-modal custom-modal-alert">
                    <div class="custom-modal-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/>
                            <line x1="12" y1="8" x2="12" y2="12"/>
                            <line x1="12" y1="16" x2="12.01" y2="16"/>
                        </svg>
                    </div>
                    <h3 class="custom-modal-title">${title}</h3>
                    <p class="custom-modal-message">${message}</p>
                    <div class="custom-modal-actions">
                        <button class="custom-modal-btn custom-modal-btn-primary" data-action="ok">Aceptar</button>
                    </div>
                </div>
            `;
            
            const closeModal = () => {
                modal.classList.add('closing');
                setTimeout(() => {
                    modal.remove();
                    resolve();
                }, 200);
            };
            
            modal.querySelector('[data-action="ok"]').addEventListener('click', closeModal);
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeModal();
            });
            
            document.body.appendChild(modal);
            requestAnimationFrame(() => modal.classList.add('active'));
            modal.querySelector('[data-action="ok"]').focus();
        });
    },

    // Modal de confirmación personalizado (reemplaza confirm nativo)
    // Parámetros: message, subtitle (opcional), confirmText (opcional), cancelText (opcional)
    async confirm(message, subtitle = '', confirmText = 'Confirmar', cancelText = 'Cancelar') {
        // Si subtitle es una cadena corta sin espacios, es el título viejo (compatibilidad)
        let title = 'Confirmar';
        let subtitleText = subtitle;
        if (subtitle && !subtitle.includes(' ') && subtitle.length < 20) {
            title = subtitle;
            subtitleText = '';
        }
        
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'custom-modal-overlay';
            modal.innerHTML = `
                <div class="custom-modal custom-modal-confirm">
                    <div class="custom-modal-icon custom-modal-icon-warning">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                            <line x1="12" y1="9" x2="12" y2="13"/>
                            <line x1="12" y1="17" x2="12.01" y2="17"/>
                        </svg>
                    </div>
                    <h3 class="custom-modal-title">${title}</h3>
                    <p class="custom-modal-message">${message}</p>
                    ${subtitleText ? `<p class="custom-modal-subtitle" style="font-size: 12px; color: var(--color-text-secondary); margin-top: 8px;">${subtitleText}</p>` : ''}
                    <div class="custom-modal-actions">
                        <button class="custom-modal-btn custom-modal-btn-secondary" data-action="cancel">${cancelText}</button>
                        <button class="custom-modal-btn custom-modal-btn-primary custom-modal-btn-danger" data-action="confirm">${confirmText}</button>
                    </div>
                </div>
            `;
            
            const closeModal = (result) => {
                modal.classList.add('closing');
                setTimeout(() => {
                    modal.remove();
                    resolve(result);
                }, 200);
            };
            
            modal.querySelector('[data-action="cancel"]').addEventListener('click', () => closeModal(false));
            modal.querySelector('[data-action="confirm"]').addEventListener('click', () => closeModal(true));
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeModal(false);
            });
            
            // Manejar teclas
            const handleKeydown = (e) => {
                if (e.key === 'Escape') closeModal(false);
                if (e.key === 'Enter') closeModal(true);
            };
            document.addEventListener('keydown', handleKeydown);
            modal.addEventListener('remove', () => document.removeEventListener('keydown', handleKeydown));
            
            document.body.appendChild(modal);
            requestAnimationFrame(() => modal.classList.add('active'));
            modal.querySelector('[data-action="confirm"]').focus();
        });
    },

    // Modal de entrada personalizado (reemplaza prompt nativo)
    async prompt(message, defaultValue = '', title = 'Entrada') {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'custom-modal-overlay';
            modal.innerHTML = `
                <div class="custom-modal custom-modal-prompt">
                    <div class="custom-modal-icon custom-modal-icon-input">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </div>
                    <h3 class="custom-modal-title">${title}</h3>
                    <p class="custom-modal-message">${message}</p>
                    <input type="text" class="custom-modal-input" value="${defaultValue}" placeholder="Escribe aquí...">
                    <div class="custom-modal-actions">
                        <button class="custom-modal-btn custom-modal-btn-secondary" data-action="cancel">Cancelar</button>
                        <button class="custom-modal-btn custom-modal-btn-primary" data-action="ok">Aceptar</button>
                    </div>
                </div>
            `;
            
            const input = modal.querySelector('.custom-modal-input');
            
            const closeModal = (value) => {
                modal.classList.add('closing');
                setTimeout(() => {
                    modal.remove();
                    resolve(value);
                }, 200);
            };
            
            modal.querySelector('[data-action="cancel"]').addEventListener('click', () => closeModal(null));
            modal.querySelector('[data-action="ok"]').addEventListener('click', () => closeModal(input.value));
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeModal(null);
            });
            
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') closeModal(input.value);
                if (e.key === 'Escape') closeModal(null);
            });
            
            document.body.appendChild(modal);
            requestAnimationFrame(() => {
                modal.classList.add('active');
                input.focus();
                input.select();
            });
        });
    },

    // Modal de selección (para reemplazar prompts con opciones)
    async select(message, options, title = 'Seleccionar') {
        return new Promise((resolve) => {
            const optionsHtml = options.map((opt, idx) => 
                `<button class="custom-modal-option" data-value="${opt.value || idx + 1}">${opt.label || opt}</button>`
            ).join('');
            
            const modal = document.createElement('div');
            modal.className = 'custom-modal-overlay';
            modal.innerHTML = `
                <div class="custom-modal custom-modal-select">
                    <div class="custom-modal-icon custom-modal-icon-select">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M4 6h16M4 12h16M4 18h16"/>
                        </svg>
                    </div>
                    <h3 class="custom-modal-title">${title}</h3>
                    <p class="custom-modal-message">${message}</p>
                    <div class="custom-modal-options">${optionsHtml}</div>
                    <div class="custom-modal-actions">
                        <button class="custom-modal-btn custom-modal-btn-secondary" data-action="cancel">Cancelar</button>
                    </div>
                </div>
            `;
            
            const closeModal = (value) => {
                modal.classList.add('closing');
                setTimeout(() => {
                    modal.remove();
                    resolve(value);
                }, 200);
            };
            
            modal.querySelectorAll('.custom-modal-option').forEach(btn => {
                btn.addEventListener('click', () => closeModal(btn.dataset.value));
            });
            
            modal.querySelector('[data-action="cancel"]').addEventListener('click', () => closeModal(null));
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeModal(null);
            });
            
            document.body.appendChild(modal);
            requestAnimationFrame(() => modal.classList.add('active'));
        });
    },

    // Cargar imagen como Blob
    async loadImageAsBlob(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    },

    // Crear thumbnail
    async createThumbnail(imageBlob, maxWidth = 200, maxHeight = 200) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                if (width > height) {
                    if (width > maxWidth) {
                        height *= maxWidth / width;
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width *= maxHeight / height;
                        height = maxHeight;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.8));
            };
            img.src = imageBlob;
        });
    },

    // Exportar a CSV
    exportToCSV(data, filename) {
        if (!data || data.length === 0) return;
        
        const headers = Object.keys(data[0]);
        const csvContent = [
            headers.join(','),
            ...data.map(row => headers.map(header => {
                const value = row[header] || '';
                return `"${String(value).replace(/"/g, '""')}"`;
            }).join(','))
        ].join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
    },

    // Exportar a Excel (requiere SheetJS)
    exportToExcel(data, filename, sheetName = 'Sheet1') {
        if (typeof XLSX === 'undefined') {
            this.showNotification('SheetJS no está cargado', 'error');
            return;
        }
        
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        XLSX.writeFile(wb, filename);
    },

    // Verificar disponibilidad de jsPDF
    checkJsPDF() {
        // Intentar múltiples formas de acceso
        if (typeof window.jspdf !== 'undefined') {
            return window.jspdf;
        }
        if (typeof window.jsPDF !== 'undefined') {
            return { jsPDF: window.jsPDF };
        }
        if (typeof jsPDF !== 'undefined') {
            return { jsPDF: jsPDF };
        }
        return null;
    },

    // Exportar a PDF (requiere jsPDF) - Diseño mejorado
    async exportToPDF(data, filename, title = 'Reporte', options = {}) {
        const jspdfLib = this.checkJsPDF();
        
        if (!jspdfLib) {
            this.showNotification('jsPDF no está cargado. Por favor, verifica que el archivo libs/jspdf.umd.min.js esté incluido en index.html.', 'error');
            console.error('jsPDF no disponible. Verifica:', {
                'window.jspdf': typeof window.jspdf,
                'window.jsPDF': typeof window.jsPDF,
                'jsPDF global': typeof jsPDF
            });
            return;
        }
        
        const { jsPDF } = jspdfLib;
        const doc = new jsPDF({
            orientation: options.orientation || 'portrait',
            unit: 'mm',
            format: options.format || 'a4'
        });

        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 15;
        const headerHeight = 35;
        const footerHeight = 20;

        // ========== HEADER MEJORADO ==========
        // Fondo degradado del header (simulado con rectángulo)
        doc.setFillColor(52, 73, 94); // Azul oscuro profesional
        doc.rect(0, 0, pageWidth, headerHeight, 'F');
        
        // Línea decorativa inferior del header
        doc.setDrawColor(46, 125, 50); // Verde
        doc.setLineWidth(0.5);
        doc.line(0, headerHeight, pageWidth, headerHeight);
        
        // Logo/Texto principal
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(24);
        doc.setFont('helvetica', 'bold');
        doc.text('OPAL & CO', margin, 18);
        
        // Subtítulo
        doc.setFontSize(14);
        doc.setFont('helvetica', 'normal');
        doc.text(title, margin, 26);
        
        // Fecha y hora en el header (derecha)
        doc.setFontSize(9);
        doc.setTextColor(220, 220, 220);
        const dateStr = this.formatDate(new Date(), 'DD/MM/YYYY HH:mm');
        doc.text(dateStr, pageWidth - margin, 18, { align: 'right' });
        
        // ========== CONTENIDO - DISEÑO DE TEXTO PURO AJUSTADO ==========
        let y = headerHeight + 20;
        doc.setTextColor(0, 0, 0);
        
        // Detectar si es inventario (para incluir imágenes)
        const isInventory = title.toLowerCase().includes('inventario') || 
                           options.includeImages === true ||
                           (data.length > 0 && data[0].hasOwnProperty('sku') && data[0].hasOwnProperty('name'));
        
        if (data && data.length > 0) {
            const headers = Object.keys(data[0]);
            const availableWidth = pageWidth - (margin * 2);
            const lineSpacing = 7; // Espacio entre líneas ajustado
            const itemSpacing = 10; // Espacio entre items ajustado
            const cardPadding = 10; // Padding interno aumentado
            const imageSize = 40; // Tamaño de imagen en mm (solo para inventario)
            
            // Título de sección mejorado
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(14);
            doc.setTextColor(30, 30, 30);
            doc.text(`Total de registros: ${data.length}`, margin, y);
            y += 8;
            
            // Línea separadora más visible
            doc.setDrawColor(180, 180, 180);
            doc.setLineWidth(0.8);
            doc.line(margin, y, pageWidth - margin, y);
            y += itemSpacing + 3;
            
            // ========== DISEÑO DE TARJETAS DE TEXTO AJUSTADO ==========
            // Cargar imágenes para inventario si es necesario
            const itemsWithImages = isInventory ? await Promise.all(data.map(async (row) => {
                if (row.id) {
                    try {
                        const photos = await DB.query('inventory_photos', 'item_id', row.id);
                        return { ...row, _image: photos[0]?.photo_blob || photos[0]?.thumbnail_blob || null };
                    } catch (e) {
                        console.warn('Error cargando foto para item:', row.id, e);
                        return { ...row, _image: null };
                    }
                }
                return { ...row, _image: null };
            })) : data;
            
            for (let idx = 0; idx < itemsWithImages.length; idx++) {
                const row = itemsWithImages[idx];
                
                // Calcular altura estimada más precisa
                let estimatedHeight = cardPadding * 2;
                if (isInventory && row._image) {
                    estimatedHeight += imageSize + 5; // Espacio para imagen
                }
                headers.forEach(header => {
                    if (header === '_image') return; // Omitir campo interno de imagen
                    const value = row[header] || '';
                    const valueStr = String(value);
                    const headerText = this.formatHeaderText(header);
                    const labelWidth = doc.getTextWidth(`${headerText}: `);
                    const maxValueWidth = availableWidth - (cardPadding * 2) - labelWidth - 5;
                    if (isInventory && row._image) {
                        // Ajustar ancho si hay imagen
                        const maxValueWidthWithImage = availableWidth - (cardPadding * 2) - imageSize - 10 - labelWidth - 5;
                        doc.setFontSize(11);
                        const valueLines = doc.splitTextToSize(valueStr, maxValueWidthWithImage);
                        estimatedHeight += Math.max(lineSpacing, valueLines.length * 5) + 2;
                    } else {
                        doc.setFontSize(11);
                        const valueLines = doc.splitTextToSize(valueStr, maxValueWidth);
                        estimatedHeight += Math.max(lineSpacing, valueLines.length * 5) + 2;
                    }
                });
                estimatedHeight += 5; // Espacio extra
                
                // Verificar si necesitamos nueva página
                if (y + estimatedHeight > pageHeight - footerHeight) {
                    doc.addPage();
                    y = headerHeight + 20;
                    
                    // Redibujar título en nueva página
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(14);
                    doc.setTextColor(30, 30, 30);
                    doc.text(`Total de registros: ${data.length}`, margin, y);
                    y += 8;
                    
                    doc.setDrawColor(180, 180, 180);
                    doc.setLineWidth(0.8);
                    doc.line(margin, y, pageWidth - margin, y);
                    y += itemSpacing + 3;
                }
                
                // Calcular altura real de la tarjeta
                let cardHeight = cardPadding;
                if (isInventory && row._image) {
                    cardHeight += imageSize + 5; // Espacio para imagen
                }
                headers.forEach(header => {
                    if (header === '_image') return; // Omitir campo interno
                    const value = row[header] || '';
                    const valueStr = String(value);
                    const headerText = this.formatHeaderText(header);
                    doc.setFontSize(11);
                    const labelWidth = doc.getTextWidth(`${headerText}: `);
                    let maxValueWidth = availableWidth - (cardPadding * 2) - labelWidth - 5;
                    if (isInventory && row._image) {
                        // Ajustar ancho si hay imagen
                        maxValueWidth = availableWidth - (cardPadding * 2) - imageSize - 10 - labelWidth - 5;
                    }
                    const valueLines = doc.splitTextToSize(valueStr, maxValueWidth);
                    cardHeight += Math.max(lineSpacing, valueLines.length * 5) + 2;
                });
                cardHeight += cardPadding + 5;
                
                // Fondo de tarjeta alternado mejorado
                const cardStartY = y;
                if (idx % 2 === 0) {
                    doc.setFillColor(250, 250, 250); // Gris muy claro mejorado
                    doc.rect(margin, cardStartY, availableWidth, cardHeight, 'F');
                } else {
                    doc.setFillColor(255, 255, 255); // Blanco
                    doc.rect(margin, cardStartY, availableWidth, cardHeight, 'F');
                }
                
                // Borde de tarjeta más sutil
                doc.setDrawColor(230, 230, 230);
                doc.setLineWidth(0.4);
                doc.rect(margin, cardStartY, availableWidth, cardHeight, 'S');
                
                // Número de registro mejorado
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(9);
                doc.setTextColor(120, 120, 120);
                doc.text(`Registro #${idx + 1}`, margin + cardPadding, cardStartY + cardPadding - 2);
                
                // Línea separadora del número
                doc.setDrawColor(240, 240, 240);
                doc.setLineWidth(0.3);
                doc.line(margin + cardPadding, cardStartY + cardPadding + 3, pageWidth - margin - cardPadding, cardStartY + cardPadding + 3);
                
                // Datos del registro - FORMATO DE TEXTO LEGIBLE AJUSTADO
                let currentY = cardStartY + cardPadding + 8;
                let imageX = margin + cardPadding;
                let textX = margin + cardPadding;
                
                // Agregar imagen si es inventario y tiene imagen
                if (isInventory && row._image) {
                    try {
                        // Agregar imagen al PDF
                        doc.addImage(row._image, 'JPEG', imageX, currentY, imageSize, imageSize);
                        
                        // Borde alrededor de la imagen
                        doc.setDrawColor(200, 200, 200);
                        doc.setLineWidth(0.3);
                        doc.rect(imageX, currentY, imageSize, imageSize, 'S');
                        
                        // Ajustar posición del texto para que esté al lado de la imagen
                        textX = imageX + imageSize + 10;
                    } catch (e) {
                        console.warn('Error agregando imagen al PDF:', e);
                        // Si falla, continuar sin imagen
                    }
                }
                
                headers.forEach((header, headerIdx) => {
                    if (header === '_image') return; // Omitir campo interno
                    let value = row[header];
                    if (value === null || value === undefined || value === '') {
                        // Omitir campos vacíos para ahorrar espacio
                        return;
                    }
                    
                    // Formatear valores especiales
                    if (typeof value === 'number') {
                        if (header.toLowerCase().includes('precio') || 
                            header.toLowerCase().includes('costo') || 
                            header.toLowerCase().includes('total') || 
                            header.toLowerCase().includes('monto') ||
                            header.toLowerCase().includes('amount')) {
                            value = this.formatCurrency(value);
                        }
                    }
                    
                    const headerText = this.formatHeaderText(header);
                    const valueStr = String(value);
                    
                    // Etiqueta (header) - NEGRITA Y TAMAÑO AJUSTADO
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(11);
                    doc.setTextColor(40, 40, 40);
                    doc.text(`${headerText}:`, textX, currentY);
                    
                    // Valor - TEXTO LEGIBLE Y TAMAÑO AJUSTADO
                    const labelWidth = doc.getTextWidth(`${headerText}: `);
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(10);
                    doc.setTextColor(70, 70, 70);
                    
                    // Dividir texto largo en múltiples líneas
                    let maxValueWidth = availableWidth - (cardPadding * 2) - labelWidth - 5;
                    if (isInventory && row._image) {
                        // Ajustar ancho si hay imagen
                        maxValueWidth = availableWidth - (cardPadding * 2) - imageSize - 10 - labelWidth - 5;
                    }
                    const valueLines = doc.splitTextToSize(valueStr, maxValueWidth);
                    
                    valueLines.forEach((line, lineIdx) => {
                        doc.text(line, textX + labelWidth, currentY + (lineIdx * 4.5));
                    });
                    
                    // Si hay imagen, asegurar que el texto no se superponga
                    if (isInventory && row._image && headerIdx === 0) {
                        currentY = Math.max(currentY, cardStartY + cardPadding + imageSize);
                    }
                    
                    currentY += Math.max(lineSpacing, valueLines.length * 4.5) + 2;
                });
                
                y = currentY + cardPadding + itemSpacing;
            }
            
            // Línea final
            if (y > headerHeight + 20) {
                doc.setDrawColor(180, 180, 180);
                doc.setLineWidth(0.8);
                doc.line(margin, y - itemSpacing, pageWidth - margin, y - itemSpacing);
            }
        } else {
            // Mensaje cuando no hay datos
            doc.setFontSize(12);
            doc.setTextColor(128, 128, 128);
            doc.text('No hay datos para mostrar', pageWidth / 2, y + 20, { align: 'center' });
        }
        
        // ========== FOOTER MEJORADO ==========
        const totalPages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            
            // Línea superior del footer
            doc.setDrawColor(200, 200, 200);
            doc.setLineWidth(0.3);
            doc.line(margin, pageHeight - footerHeight, pageWidth - margin, pageHeight - footerHeight);
            
            // Fondo del footer
            doc.setFillColor(248, 249, 250);
            doc.rect(0, pageHeight - footerHeight, pageWidth, footerHeight, 'F');
            
            // Texto del footer
            doc.setFontSize(8);
            doc.setTextColor(100, 100, 100);
            doc.setFont('helvetica', 'normal');
            
            // Página actual
            doc.text(
                `Página ${i} de ${totalPages}`,
                pageWidth / 2,
                pageHeight - 8,
                { align: 'center' }
            );
            
            // Fecha de generación
            doc.text(
                `Generado: ${dateStr}`,
                pageWidth - margin,
                pageHeight - 8,
                { align: 'right' }
            );
            
            // Nombre de la empresa
            doc.text(
                'Opal & Co - Sistema POS',
                margin,
                pageHeight - 8,
                { align: 'left' }
            );
        }
        
        doc.save(filename);
    },
    
    // Función auxiliar para calcular anchos de columna
    calculateColumnWidths(headers, data, availableWidth) {
        const minWidth = 20;
        const maxWidth = 60;
        const defaultWidth = availableWidth / headers.length;
        
        // Calcular ancho necesario para cada columna basado en contenido
        const widths = headers.map((header, idx) => {
            let maxLength = header.length;
            data.forEach(row => {
                const value = String(row[header] || '');
                if (value.length > maxLength) maxLength = value.length;
            });
            
            // Ancho proporcional al contenido pero con límites
            let width = Math.max(minWidth, Math.min(maxWidth, maxLength * 2.5));
            return width;
        });
        
        // Normalizar para que sumen el ancho disponible
        const totalWidth = widths.reduce((sum, w) => sum + w, 0);
        const scale = availableWidth / totalWidth;
        
        return widths.map(w => w * scale);
    },
    
    // Formatear texto de header (capitalizar y limpiar)
    formatHeaderText(header) {
        return header
            .replace(/_/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase())
            .trim();
    },

    // Detectar escaneo vs tecleo (velocidad)
    createBarcodeScanner(callback, minSpeed = 50) {
        let buffer = '';
        let lastKeyTime = 0;
        let timeout;
        let isScanning = false;
        let scanStartTime = 0;
        
        return (event) => {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'utils.js:513',message:'Scanner function called',data:{key:event.key,code:event.code,ctrlKey:event.ctrlKey,metaKey:event.metaKey,altKey:event.altKey,isScanning:isScanning,bufferLength:buffer.length,defaultPrevented:event.defaultPrevented},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
            // #endregion
            
            // Si estamos procesando un escaneo, bloquear todo
            if (isScanning) {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'utils.js:515',message:'Blocking event - already scanning',data:{key:event.key},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                // #endregion
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                return false;
            }
            
            const now = Date.now();
            const timeSinceLastKey = now - lastKeyTime;
            lastKeyTime = now;
            
            // Si es Enter y hay buffer, puede ser escaneo
            if (event.key === 'Enter') {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'utils.js:527',message:'Enter key detected',data:{buffer:buffer,bufferLength:buffer.length,timeSinceLastKey:timeSinceLastKey,isScanCandidate:buffer.length > 0 && timeSinceLastKey < minSpeed},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
                if (buffer.length > 0 && timeSinceLastKey < minSpeed) {
                    // Probable escaneo - prevenir TODOS los comportamientos por defecto
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'utils.js:529',message:'Scan detected - preventing default',data:{barcode:buffer.trim(),beforePreventDefault:event.defaultPrevented},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                    // #endregion
                    event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation();
                    
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'utils.js:533',message:'After preventDefault',data:{afterPreventDefault:event.defaultPrevented,defaultPrevented:event.defaultPrevented},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                    // #endregion
                    
                    // Marcar como escaneando
                    isScanning = true;
                    scanStartTime = now;
                    
                    // Procesar escaneo
                    const barcode = buffer.trim();
                    buffer = '';
                    
                    // Llamar callback
                    try {
                        callback(barcode);
                    } catch (e) {
                        console.error('Error en callback de escaneo:', e);
                        // #region agent log
                        fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'utils.js:545',message:'Callback error',data:{error:e.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                        // #endregion
                    }
                    
                    // Reset después de procesar
                    setTimeout(() => { 
                        isScanning = false;
                        scanStartTime = 0;
                    }, 300);
                }
                clearTimeout(timeout);
                return false;
            }
            
            // Acumular caracteres si es un carácter imprimible
            if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
                // Si el tiempo entre teclas es muy corto, probablemente es escaneo
                if (timeSinceLastKey < minSpeed && buffer.length > 0) {
                    // Prevenir comportamiento por defecto durante escaneo rápido
                    event.preventDefault();
                    event.stopPropagation();
                }
                
                buffer += event.key;
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                    // Si no hay actividad, limpiar buffer
                    if (!isScanning) {
                        buffer = '';
                    }
                }, 300);
            }
            
            return true;
        };
    },

    // Calcular comisión
    calculateCommission(amount, discountPct, multiplier) {
        const afterDiscount = amount * (1 - (discountPct || 0) / 100);
        return afterDiscount * (multiplier || 0) / 100;
    },

    // Generar código de barras para vendedor
    generateSellerBarcode(seller) {
        if (seller.barcode && seller.barcode.trim() !== '' && seller.barcode !== 'Sin código') {
            return seller.barcode;
        }
        // Usar ID o nombre para generar código único
        const base = seller.id ? seller.id.replace(/[^A-Z0-9]/gi, '').substring(0, 8).toUpperCase() : 
                     seller.name ? seller.name.replace(/[^A-Z0-9]/gi, '').substring(0, 8).toUpperCase() : 
                     Date.now().toString().slice(-6);
        return `SELL${base}`;
    },

    // Generar código de barras para guía
    generateGuideBarcode(guide) {
        if (guide.barcode && guide.barcode.trim() !== '' && guide.barcode !== 'Sin código') {
            return guide.barcode;
        }
        // Usar ID o nombre para generar código único
        const base = guide.id ? guide.id.replace(/[^A-Z0-9]/gi, '').substring(0, 8).toUpperCase() : 
                     guide.name ? guide.name.replace(/[^A-Z0-9]/gi, '').substring(0, 8).toUpperCase() : 
                     Date.now().toString().slice(-6);
        return `GUIDE${base}`;
    },

    // Generar código de barras para agencia
    generateAgencyBarcode(agency) {
        if (agency.barcode && agency.barcode.trim() !== '' && agency.barcode !== 'Sin código') {
            return agency.barcode;
        }
        // Usar ID o nombre para generar código único
        const base = agency.id ? agency.id.replace(/[^A-Z0-9]/gi, '').substring(0, 8).toUpperCase() : 
                     agency.name ? agency.name.replace(/[^A-Z0-9]/gi, '').substring(0, 8).toUpperCase() : 
                     Date.now().toString().slice(-6);
        return `AG${base}`;
    },

    // Generar código de barras para empleado
    generateEmployeeBarcode(employee) {
        if (employee.barcode && employee.barcode.trim() !== '' && employee.barcode !== 'Sin código') {
            return employee.barcode;
        }
        // Usar ID o nombre para generar código único
        const base = employee.id ? employee.id.replace(/[^A-Z0-9]/gi, '').substring(0, 8).toUpperCase() : 
                     employee.name ? employee.name.replace(/[^A-Z0-9]/gi, '').substring(0, 8).toUpperCase() : 
                     Date.now().toString().slice(-6);
        return `EMP${base}`;
    },

    // Validar si un código de barras está vacío o inválido
    isBarcodeEmpty(barcode) {
        return !barcode || barcode.trim() === '' || barcode === 'Sin código' || barcode === 'N/A';
    },


    // Exportar a Excel con diseño mejorado
    exportToExcel(data, filename, sheetName = 'Sheet1', options = {}) {
        if (typeof XLSX === 'undefined') {
            this.showNotification('SheetJS no está disponible', 'error');
            return;
        }

        try {
            if (!data || data.length === 0) {
                this.showNotification('No hay datos para exportar', 'warning');
                return;
            }

            // Crear workbook
            const wb = XLSX.utils.book_new();
            
            // Convertir datos a hoja
            const ws = XLSX.utils.json_to_sheet(data);
            
            // ========== APLICAR FORMATO MEJORADO ==========
            
            // Obtener rango de la hoja
            const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
            const headerRow = range.s.r;
            const lastRow = range.e.r;
            const lastCol = range.e.c;
            
            // Colores profesionales (formato correcto para XLSX)
            const headerBgColor = { rgb: '34596E' }; // Azul oscuro
            const headerTextColor = { rgb: 'FFFFFF' }; // Blanco
            const evenRowBgColor = { rgb: 'F8F9FA' }; // Gris muy claro
            const oddRowBgColor = { rgb: 'FFFFFF' }; // Blanco
            const borderColor = { rgb: 'D0D0D0' }; // Gris claro
            
            // Aplicar formato a headers - ESTILO MEJORADO
            for (let col = range.s.c; col <= lastCol; col++) {
                const cellAddress = XLSX.utils.encode_cell({ r: headerRow, c: col });
                if (!ws[cellAddress]) {
                    ws[cellAddress] = { v: '', t: 's' };
                }
                
                // Aplicar estilo con estructura correcta
                ws[cellAddress].s = {
                    fill: { 
                        fgColor: headerBgColor,
                        patternType: 'solid'
                    },
                    font: { 
                        bold: true, 
                        color: headerTextColor,
                        sz: 12,
                        name: 'Calibri'
                    },
                    alignment: { 
                        horizontal: 'center', 
                        vertical: 'center',
                        wrapText: true
                    },
                    border: {
                        top: { style: 'thin', color: { rgb: '000000' } },
                        bottom: { style: 'medium', color: { rgb: '000000' } },
                        left: { style: 'thin', color: { rgb: '000000' } },
                        right: { style: 'thin', color: { rgb: '000000' } }
                    }
                };
            }
            
            // Aplicar formato a filas de datos - ESTILO MEJORADO
            for (let row = headerRow + 1; row <= lastRow; row++) {
                const isEven = (row - headerRow - 1) % 2 === 0;
                const rowBgColor = isEven ? evenRowBgColor : oddRowBgColor;
                
                for (let col = range.s.c; col <= lastCol; col++) {
                    const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
                    if (!ws[cellAddress]) {
                        ws[cellAddress] = { v: '', t: 's' };
                    }
                    
                    const cell = ws[cellAddress];
                    const headerCell = XLSX.utils.encode_cell({ r: headerRow, c: col });
                    const headerText = ws[headerCell]?.v || '';
                    const headerLower = String(headerText).toLowerCase();
                    
                    // Detectar tipo de dato para formato
                    let numFormat = 'General';
                    let alignment = 'left';
                    
                    if (typeof cell.v === 'number') {
                        if (headerLower.includes('precio') || 
                            headerLower.includes('costo') || 
                            headerLower.includes('total') || 
                            headerLower.includes('monto') ||
                            headerLower.includes('amount') ||
                            headerLower.includes('comisión') ||
                            headerLower.includes('commission')) {
                            numFormat = '$#,##0.00';
                            alignment = 'right';
                        } else if (headerLower.includes('cantidad') || 
                                   headerLower.includes('quantity') ||
                                   headerLower.includes('pasajeros') ||
                                   headerLower.includes('passengers') ||
                                   headerLower.includes('stock')) {
                            numFormat = '#,##0';
                            alignment = 'right';
                        } else if (headerLower.includes('porcentaje') || 
                                   headerLower.includes('percentage') ||
                                   headerLower.includes('margen') ||
                                   headerLower.includes('margin')) {
                            numFormat = '0.00%';
                            alignment = 'right';
                        } else {
                            alignment = 'right';
                        }
                    }
                    
                    // Aplicar estilo con negrita y tamaño grande
                    cell.s = {
                        fill: { 
                            fgColor: rowBgColor,
                            patternType: 'solid'
                        },
                        font: { 
                            bold: true, // NEGRITA
                            sz: 11, // Tamaño grande
                            name: 'Calibri',
                            color: { rgb: '000000' }
                        },
                        alignment: { 
                            horizontal: alignment, 
                            vertical: 'center',
                            wrapText: true
                        },
                        border: {
                            top: { style: 'thin', color: { rgb: 'D0D0D0' } },
                            bottom: { style: 'thin', color: { rgb: 'D0D0D0' } },
                            left: { style: 'thin', color: { rgb: 'D0D0D0' } },
                            right: { style: 'thin', color: { rgb: 'D0D0D0' } }
                        },
                        numFmt: numFormat
                    };
                }
            }
            
            // Ajustar anchos de columna automáticamente
            const colWidths = [];
            for (let col = range.s.c; col <= lastCol; col++) {
                let maxLength = 12; // Mínimo más grande
                
                // Revisar header
                const headerCell = XLSX.utils.encode_cell({ r: headerRow, c: col });
                if (ws[headerCell]) {
                    maxLength = Math.max(maxLength, String(ws[headerCell].v || '').length);
                }
                
                // Revisar todas las filas de datos para mejor cálculo
                for (let row = headerRow + 1; row <= lastRow; row++) {
                    const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
                    if (ws[cellAddress]) {
                        const value = String(ws[cellAddress].v || '');
                        maxLength = Math.max(maxLength, value.length);
                    }
                }
                
                // Ancho mínimo y máximo (más generoso)
                colWidths.push({
                    wch: Math.min(Math.max(maxLength + 3, 15), 60)
                });
            }
            ws['!cols'] = colWidths;
            
            // Configurar altura de fila del header y datos
            ws['!rows'] = [];
            ws['!rows'][headerRow] = { hpt: 30 }; // Header más alto
            for (let row = headerRow + 1; row <= lastRow; row++) {
                ws['!rows'][row] = { hpt: 20 }; // Filas de datos más altas
            }
            
            // Agregar hoja al workbook
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
            
            // Escribir archivo - XLSX.full.min.js soporta estilos directamente
            XLSX.writeFile(wb, filename);
            
            this.showNotification('Excel exportado exitosamente', 'success');
        } catch (e) {
            console.error('Error exporting to Excel:', e);
            this.showNotification('Error al exportar Excel: ' + e.message, 'error');
        }
    },

    // Exportar a CSV
    exportToCSV(data, filename) {
        if (!data || data.length === 0) {
            this.showNotification('No hay datos para exportar', 'warning');
            return;
        }

        try {
            const headers = Object.keys(data[0]);
            const csvRows = [
                headers.join(','),
                ...data.map(row => 
                    headers.map(header => {
                        const value = row[header];
                        if (value === null || value === undefined) return '';
                        const stringValue = String(value);
                        return stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')
                            ? `"${stringValue.replace(/"/g, '""')}"`
                            : stringValue;
                    }).join(',')
                )
            ];

            const csvContent = csvRows.join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            
            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (e) {
            console.error('Error exporting to CSV:', e);
            this.showNotification('Error al exportar CSV', 'error');
        }
    },

    // Obtener tipos de cambio desde internet (USD y CAD)
    async fetchExchangeRates() {
        try {
            // Usar API gratuita de exchangerate-api.com (sin API key necesario)
            const response = await fetch('https://api.exchangerate-api.com/v4/latest/MXN');
            
            if (!response.ok) {
                throw new Error('Error al obtener tipos de cambio');
            }
            
            const data = await response.json();
            
            // Obtener USD y CAD desde MXN
            const usd = data.rates?.USD ? (1 / data.rates.USD) : null;
            const cad = data.rates?.CAD ? (1 / data.rates.CAD) : null;
            
            if (!usd || !cad) {
                throw new Error('No se pudieron obtener todos los tipos de cambio');
            }
            
            return {
                usd: parseFloat(usd.toFixed(4)),
                cad: parseFloat(cad.toFixed(4)),
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('Error fetching exchange rates:', error);
            this.showNotification('No se pudo obtener tipos de cambio. Usando valores guardados.', 'warning');
            return null;
        }
    },

    // ==================== SISTEMA DE EVENTOS GLOBAL ====================
    
    /**
     * EventBus simple para comunicación entre módulos
     */
    EventBus: {
        listeners: {},
        
        /**
         * Suscribirse a un evento
         * @param {string} event - Nombre del evento
         * @param {Function} callback - Función a ejecutar
         * @returns {Function} Función para desuscribirse
         */
        on(event, callback) {
            if (!this.listeners[event]) {
                this.listeners[event] = [];
            }
            this.listeners[event].push(callback);
            
            // Retornar función para desuscribirse
            return () => {
                this.off(event, callback);
            };
        },
        
        /**
         * Desuscribirse de un evento
         * @param {string} event - Nombre del evento
         * @param {Function} callback - Función a remover
         */
        off(event, callback) {
            if (!this.listeners[event]) return;
            this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
        },
        
        /**
         * Emitir un evento
         * @param {string} event - Nombre del evento
         * @param {*} data - Datos a pasar a los listeners
         */
        emit(event, data) {
            if (!this.listeners[event]) return;
            this.listeners[event].forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error en listener de evento ${event}:`, error);
                }
            });
        },
        
        /**
         * Limpiar todos los listeners de un evento
         * @param {string} event - Nombre del evento (opcional, si no se proporciona limpia todos)
         */
        clear(event) {
            if (event) {
                delete this.listeners[event];
            } else {
                this.listeners = {};
            }
        }
    },

    /**
     * Calcular comisión para un item de venta basado en reglas de comisión
     * @param {number} subtotal - Subtotal del item (después de descuentos)
     * @param {string} sellerId - ID del vendedor (opcional)
     * @param {string} guideId - ID del guía (opcional)
     * @returns {Promise<number>} Monto de la comisión calculada
     */
    async calculateCommission(subtotal, sellerId = null, guideId = null) {
        if (!subtotal || subtotal <= 0) return 0;
        
        try {
            const commissionRules = await DB.getAll('commission_rules') || [];
            let totalCommission = 0;
            
            // Calcular comisión del vendedor
            if (sellerId) {
                // Buscar regla específica del vendedor
                let sellerRule = commissionRules.find(r => 
                    r.entity_type === 'seller' && r.entity_id === sellerId
                );
                
                // Si no hay regla específica, usar la regla default
                if (!sellerRule) {
                    sellerRule = commissionRules.find(r => 
                        r.entity_type === 'seller' && r.entity_id === null
                    );
                }
                
                if (sellerRule) {
                    const discountPct = sellerRule.discount_pct || 0;
                    const multiplier = sellerRule.multiplier || 1;
                    // Aplicar descuento primero, luego calcular comisión sobre el monto después del descuento
                    // Fórmula: -X% *Y% = (subtotal * (1 - X/100)) * Y/100
                    const afterDiscount = subtotal * (1 - (discountPct / 100));
                    const commission = afterDiscount * (multiplier / 100);
                    totalCommission += commission;
                }
            }
            
            // Calcular comisión del guía
            if (guideId) {
                // Buscar regla específica del guía
                let guideRule = commissionRules.find(r => 
                    r.entity_type === 'guide' && r.entity_id === guideId
                );
                
                // Si no hay regla específica, usar la regla default
                if (!guideRule) {
                    guideRule = commissionRules.find(r => 
                        r.entity_type === 'guide' && r.entity_id === null
                    );
                }
                
                if (guideRule) {
                    const discountPct = guideRule.discount_pct || 0;
                    const multiplier = guideRule.multiplier || 1;
                    // Aplicar descuento primero, luego calcular comisión sobre el monto después del descuento
                    // Fórmula: -X% *Y% = (subtotal * (1 - X/100)) * Y/100
                    const afterDiscount = subtotal * (1 - (discountPct / 100));
                    const commission = afterDiscount * (multiplier / 100);
                    totalCommission += commission;
                }
            }
            
            return Math.round(totalCommission * 100) / 100; // Redondear a 2 decimales
        } catch (e) {
            console.error('Error calculando comisión:', e);
            return 0;
        }
    }
};

// Agregar estilos de animación si no existen
if (!document.getElementById('notification-styles')) {
    const style = document.createElement('style');
    style.id = 'notification-styles';
    style.textContent = `
        @keyframes slideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        @keyframes slideOut {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(100%);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);
}

