// Jewelry Label Editor - Editor de Etiquetas para Joyas (85x20mm área de impresión)
// Sistema separado del sistema de etiquetas genérico

const JewelryLabelEditor = {
    // Plantilla por defecto
    defaultTemplate: {
        barcode: {
            x: 1,        // posición X en mm
            y: 1,        // posición Y en mm
            width: 15,   // ancho en mm (aumentado de 9 a 15mm = +6mm total, +3mm cada lado)
            height: 6,   // alto en mm
            marginLeft: 0,   // ajuste izquierda en mm
            marginRight: 0,  // ajuste derecha en mm
            marginTop: 0,    // ajuste arriba en mm
            marginBottom: 0  // ajuste abajo en mm
        },
        name: {
            x: 1,        // posición X en mm
            y: 7.5,      // posición Y en mm
            fontSize: 7, // tamaño de fuente en pt
            twoLines: false, // mostrar texto en dos líneas
            marginLeft: 0,   // ajuste izquierda en mm
            marginRight: 0,  // ajuste derecha en mm
            marginTop: 0,    // ajuste arriba en mm
            marginBottom: 0  // ajuste abajo en mm
        }
    },

    // Cargar plantilla guardada
    async loadTemplate() {
        try {
            const settings = await DB.getAll('settings') || [];
            const templateSetting = settings.find(s => s.key === 'jewelry_label_template');
            
            if (templateSetting && templateSetting.value) {
                const template = typeof templateSetting.value === 'string' 
                    ? JSON.parse(templateSetting.value)
                    : templateSetting.value;
                
                // Asegurar compatibilidad con plantillas antiguas (agregar campos de margin si no existen)
                if (template.barcode && !template.barcode.marginLeft) {
                    template.barcode.marginLeft = 0;
                    template.barcode.marginRight = 0;
                    template.barcode.marginTop = 0;
                    template.barcode.marginBottom = 0;
                }
                if (template.name && !template.name.marginLeft) {
                    template.name.marginLeft = 0;
                    template.name.marginRight = 0;
                    template.name.marginTop = 0;
                    template.name.marginBottom = 0;
                }
                if (template.name && template.name.twoLines === undefined) {
                    template.name.twoLines = false;
                }
                
                console.log('📂 Plantilla cargada:', template);
                return template;
            }
            
            console.log('📋 Usando plantilla por defecto');
            return this.defaultTemplate;
        } catch (e) {
            console.error('Error cargando plantilla:', e);
            return this.defaultTemplate;
        }
    },

    // Guardar plantilla
    async saveTemplate(template) {
        try {
            console.log('💾 Guardando plantilla:', template);
            
            // Validar que la plantilla tenga la estructura correcta
            if (!template.barcode || !template.name) {
                throw new Error('Plantilla incompleta: faltan datos de código de barras o nombre');
            }
            
            // Validar valores numéricos del código de barras
            if (!template.barcode.width || !template.barcode.height || 
                isNaN(template.barcode.width) || isNaN(template.barcode.height)) {
                console.error('❌ Template inválido - valores numéricos faltantes o inválidos:', template);
                throw new Error('Plantilla inválida: ancho o alto del código de barras no válidos');
            }
            
            // Validar que los valores estén dentro de los límites del área de impresión (85mm x 20mm)
            if (template.barcode.width > 85 || template.barcode.height > 20) {
                console.warn('⚠️ Advertencia: Valores del código de barras exceden el área de impresión');
            }
            
            console.log('✅ Validación de plantilla exitosa:', {
                barcode: {
                    x: template.barcode.x,
                    y: template.barcode.y,
                    width: template.barcode.width,
                    height: template.barcode.height
                }
            });
            
            // Usar DB.put que actualiza si existe o crea si no existe
            const settingData = {
                key: 'jewelry_label_template',
                value: JSON.stringify(template),
                updated_at: new Date().toISOString()
            };
            
            // Verificar si existe para agregar created_at si es nuevo
            const existing = await DB.query('settings', 'key', 'jewelry_label_template');
            console.log('🔍 Plantilla existente:', existing);
            
            if (!existing || existing.length === 0) {
                settingData.created_at = new Date().toISOString();
                console.log('📝 Creando nueva plantilla');
            } else {
                console.log('🔄 Actualizando plantilla existente');
            }
            
            await DB.put('settings', settingData);
            console.log('✅ Plantilla guardada exitosamente');
            
            // Verificar que se guardó correctamente
            const verify = await DB.query('settings', 'key', 'jewelry_label_template');
            if (verify && verify.length > 0) {
                console.log('✅ Verificación: Plantilla encontrada en BD');
            } else {
                console.warn('⚠️ Advertencia: No se pudo verificar la plantilla guardada');
            }
            
            Utils.showNotification('✅ Plantilla guardada correctamente', 'success');
            return true;
        } catch (e) {
            console.error('❌ Error guardando plantilla:', e);
            console.error('Error details:', e.message, e.stack);
            Utils.showNotification('Error al guardar plantilla: ' + e.message, 'error');
            return false;
        }
    },

    // Verificar si ya hay plantilla configurada
    async hasTemplate() {
        try {
            const settings = await DB.getAll('settings') || [];
            const templateSetting = settings.find(s => s.key === 'jewelry_label_template');
            return !!templateSetting;
        } catch (e) {
            return false;
        }
    },

    // Mostrar editor de etiquetas
    async showEditor(itemId = null) {
        const template = await this.loadTemplate();
        const item = itemId ? await DB.get('inventory_items', itemId) : null;
        
        // Generar código de barras de ejemplo (EAN8 - más corto y fácil de escanear)
        let barcodeImg = '';
        const previewWidth = 2.8;  // Width aumentado para barras más gruesas (menos barras = mejor escáner)
        const previewHeight = 100; // Altura aumentada para mejor legibilidad
        
        // Función auxiliar para convertir a EAN8 (8 dígitos)
        const toEAN8 = (value) => {
            if (!value) return '12345670'; // EAN8 de ejemplo
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
        };
        
        if (item && item.barcode) {
            const ean8Value = toEAN8(item.barcode || item.sku);
            barcodeImg = await BarcodeManager.generateBarcodeImage(ean8Value, 'EAN8', {
                width: previewWidth,
                height: previewHeight,
                displayValue: false
            });
        } else {
            // Código de barras de ejemplo EAN8
            barcodeImg = await BarcodeManager.generateBarcodeImage('12345670', 'EAN8', {
                width: previewWidth,
                height: previewHeight,
                displayValue: false
            });
        }

        const previewName = item ? (item.name || 'Ejemplo de Nombre de Joya') : 'Ejemplo de Nombre de Joya';
        
        const body = `
            <div style="padding: 20px; max-width: 800px;">
                <div style="margin-bottom: 20px;">
                    <p style="color: var(--color-text-secondary); font-size: 13px; margin-bottom: 15px;">
                        Configura libremente la posición del código de barras y nombre del producto en la etiqueta de joya.
                        <br><strong>Área de impresión real: 85mm x 20mm (marcada en rosa). Área de trabajo: 90mm x 30mm.</strong>
                    </p>
                </div>

                <!-- Previsualización -->
                <div style="background: var(--color-bg-secondary); padding: 20px; border-radius: var(--radius-md); margin-bottom: 20px; overflow: visible;">
                    <h4 style="margin-bottom: 15px; font-size: 14px; text-align: center;">Previsualización - Área de Impresión (85mm x 20mm)</h4>
                    <div style="display: flex; justify-content: center; align-items: center; padding: 20px; min-height: 150px;">
                        <div style="position: relative; width: 510px; height: 120px; background: white; border: 2px solid var(--color-border); border-radius: 4px; margin: 0 auto; overflow: visible; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                        
                        <!-- Código de barras arrastrable -->
                        <!-- Contenedor ajustado al tamaño de las líneas azules -->
                        <div id="jewelry-barcode-preview" 
                             style="position: absolute; 
                                    left: ${(template.barcode.x + (template.barcode.marginLeft || 0)) * 6}px; 
                                    top: ${(template.barcode.y + (template.barcode.marginTop || 0)) * 6}px; 
                                    width: ${template.barcode.width * 6}px; 
                                    height: ${template.barcode.height * 6}px;
                                    background: rgba(255, 255, 255, 0.95);
                                    border: 2px dashed #007bff;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    cursor: move;
                                    z-index: 20;
                                    box-sizing: border-box;
                                    overflow: hidden;
                                    box-shadow: 0 0 0 1px rgba(0, 123, 255, 0.3);">
                            <!-- Imagen del código de barras -->
                            <img src="${barcodeImg}" style="max-width: 100%; max-height: 100%; object-fit: contain; display: block;" alt="Barcode">
                            <div style="position: absolute; top: -18px; left: 0; font-size: 9px; color: #007bff; font-weight: bold; white-space: nowrap;">
                                Código Barras
                            </div>
                            <!-- Handles para escalar el código de barras (esquinas) -->
                            <div id="jewelry-barcode-resize-handle-top-left"
                                <img src="${barcodeImg}" style="max-width: 100%; max-height: 100%; object-fit: contain; display: block;" alt="Barcode">
                                <div style="position: absolute; top: -18px; left: 0; font-size: 9px; color: #007bff; font-weight: bold; white-space: nowrap;">
                                    Código Barras
                                </div>
                                <!-- Handles para escalar el código de barras (esquinas) -->
                                <div id="jewelry-barcode-resize-handle-top-left" 
                                 style="position: absolute; 
                                        top: -6px; 
                                        left: -6px; 
                                        width: 12px; 
                                        height: 12px; 
                                        background: #007bff; 
                                        border: 2px solid #0056b3; 
                                        border-radius: 50%; 
                                        cursor: nwse-resize;
                                        z-index: 21;
                                        box-shadow: 0 2px 4px rgba(0,0,0,0.2);"></div>
                            <div id="jewelry-barcode-resize-handle-top-right" 
                                 style="position: absolute; 
                                        top: -6px; 
                                        right: -6px; 
                                        width: 12px; 
                                        height: 12px; 
                                        background: #007bff; 
                                        border: 2px solid #0056b3; 
                                        border-radius: 50%; 
                                        cursor: nesw-resize;
                                        z-index: 21;
                                        box-shadow: 0 2px 4px rgba(0,0,0,0.2);"></div>
                            <div id="jewelry-barcode-resize-handle-bottom-left" 
                                 style="position: absolute; 
                                        bottom: -6px; 
                                        left: -6px; 
                                        width: 12px; 
                                        height: 12px; 
                                        background: #007bff; 
                                        border: 2px solid #0056b3; 
                                        border-radius: 50%; 
                                        cursor: nesw-resize;
                                        z-index: 21;
                                        box-shadow: 0 2px 4px rgba(0,0,0,0.2);"></div>
                            <div id="jewelry-barcode-resize-handle-bottom-right" 
                                 style="position: absolute; 
                                        bottom: -6px; 
                                        right: -6px; 
                                        width: 12px; 
                                        height: 12px; 
                                        background: #007bff; 
                                        border: 2px solid #0056b3; 
                                        border-radius: 50%; 
                                        cursor: nwse-resize;
                                        z-index: 21;
                                        box-shadow: 0 2px 4px rgba(0,0,0,0.2);"></div>
                            <!-- Handle para estirar solo verticalmente (centro inferior) -->
                            <div id="jewelry-barcode-resize-handle-bottom" 
                                 style="position: absolute; 
                                        bottom: -4px; 
                                        left: 50%; 
                                        transform: translateX(-50%); 
                                        width: 30px; 
                                        height: 8px; 
                                        background: #007bff; 
                                        border: 1px solid #0056b3; 
                                        border-radius: 2px; 
                                        cursor: ns-resize;
                                        z-index: 21;
                                        display: flex;
                                        align-items: center;
                                        justify-content: center;">
                                <div style="width: 20px; height: 2px; background: white; border-radius: 1px;"></div>
                            </div>
                            <!-- Handle para estirar solo horizontalmente (centro derecho) -->
                            <div id="jewelry-barcode-resize-handle-right" 
                                 style="position: absolute; 
                                        right: -4px; 
                                        top: 50%; 
                                        transform: translateY(-50%); 
                                        width: 8px; 
                                        height: 30px; 
                                        background: #007bff; 
                                        border: 1px solid #0056b3; 
                                        border-radius: 2px; 
                                        cursor: ew-resize;
                                        z-index: 21;
                                        display: flex;
                                        align-items: center;
                                        justify-content: center;">
                                <div style="width: 2px; height: 20px; background: white; border-radius: 1px;"></div>
                            </div>
                            </div>
                        </div>
                        
                        <!-- Nombre arrastrable -->
                        <div id="jewelry-name-preview" 
                             style="position: absolute; 
                                    left: ${(template.name.x + (template.name.marginLeft || 0)) * 6}px; 
                                    top: ${(template.name.y + (template.name.marginTop || 0)) * 6}px; 
                                    font-size: ${template.name.fontSize}pt;
                                    cursor: move;
                                    border: 2px dashed #28a745;
                                    background: rgba(40, 167, 69, 0.1);
                                    padding: 2px 4px;
                                    z-index: 20;
                                    max-width: ${(85 - template.name.x - (template.name.marginLeft || 0) - (template.name.marginRight || 0)) * 6}px;
                                    ${template.name.twoLines ? `
                                    white-space: normal;
                                    word-wrap: break-word;
                                    overflow: hidden;
                                    max-height: ${template.name.fontSize * 2.4}pt;
                                    line-height: ${template.name.fontSize * 1.2}pt;
                                    ` : `
                                    overflow: hidden;
                                    text-overflow: ellipsis;
                                    white-space: nowrap;
                                    `}">
                            ${template.name.twoLines ? 
                                (previewName.length > 35 ? previewName.substring(0, 35) + '...' : previewName) : 
                                (previewName.length > 15 ? previewName.substring(0, 15) + '...' : previewName)}
                            <div style="position: absolute; top: -18px; left: 0; font-size: 9px; color: #28a745; font-weight: bold; white-space: nowrap;">
                                Nombre
                            </div>
                            <!-- Handles para ajustar tamaño de fuente -->
                            <div id="jewelry-name-resize-handle-top-left" 
                                 style="position: absolute; 
                                        top: -6px; 
                                        left: -6px; 
                                        width: 12px; 
                                        height: 12px; 
                                        background: #28a745; 
                                        border: 1px solid #1e7e34; 
                                        border-radius: 50%; 
                                        cursor: nwse-resize;
                                        z-index: 21;"></div>
                            <div id="jewelry-name-resize-handle-top-right" 
                                 style="position: absolute; 
                                        top: -6px; 
                                        right: -6px; 
                                        width: 12px; 
                                        height: 12px; 
                                        background: #28a745; 
                                        border: 1px solid #1e7e34; 
                                        border-radius: 50%; 
                                        cursor: nesw-resize;
                                        z-index: 21;"></div>
                        </div>
                    </div>
                </div>

                <!-- Controles -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                    <!-- Controles Código de Barras -->
                    <div style="background: var(--color-bg-card); padding: 15px; border-radius: var(--radius-md); border: 1px solid var(--color-border-light);">
                        <h4 style="margin-bottom: 12px; font-size: 13px; color: #007bff;">
                            <i class="fas fa-barcode"></i> Código de Barras
                        </h4>
                        <div class="form-group" style="margin-bottom: 10px;">
                            <label style="font-size: 11px;">Posición X (mm)</label>
                            <input type="number" id="jewelry-barcode-x" class="form-input" 
                                   value="${template.barcode.x}" step="0.1" min="0" max="85" 
                                   onchange="JewelryLabelEditor.updatePreview()" style="font-size: 12px;">
                        </div>
                        <div class="form-group" style="margin-bottom: 10px;">
                            <label style="font-size: 11px;">Posición Y (mm)</label>
                            <input type="number" id="jewelry-barcode-y" class="form-input" 
                                   value="${template.barcode.y}" step="0.1" min="0" max="20" 
                                   onchange="JewelryLabelEditor.updatePreview()" style="font-size: 12px;">
                        </div>
                        <div class="form-group" style="margin-bottom: 10px;">
                            <label style="font-size: 11px;">Ancho (mm)</label>
                            <input type="number" id="jewelry-barcode-width" class="form-input" 
                                   value="${template.barcode.width}" step="0.1" min="1" max="85" 
                                   onchange="JewelryLabelEditor.updatePreview()" style="font-size: 12px;">
                        </div>
                        <div class="form-group" style="margin-bottom: 10px;">
                            <label style="font-size: 11px;">Alto (mm)</label>
                            <input type="number" id="jewelry-barcode-height" class="form-input" 
                                   value="${template.barcode.height || 6}" step="0.1" min="1" max="20" 
                                   onchange="JewelryLabelEditor.updatePreview()" style="font-size: 12px;">
                        </div>
                        <div style="border-top: 1px solid var(--color-border-light); margin: 10px 0; padding-top: 10px;">
                            <label style="font-size: 11px; font-weight: 600; color: var(--color-text-secondary); margin-bottom: 8px; display: block;">
                                <i class="fas fa-arrows-alt"></i> Ajustes Finos (mm)
                            </label>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                                <div class="form-group" style="margin-bottom: 8px;">
                                    <label style="font-size: 10px;">Izquierda</label>
                                    <input type="number" id="jewelry-barcode-margin-left" class="form-input" 
                                           value="${template.barcode.marginLeft || 0}" step="0.1" min="-10" max="10" 
                                           onchange="JewelryLabelEditor.updatePreview()" style="font-size: 11px;">
                                </div>
                                <div class="form-group" style="margin-bottom: 8px;">
                                    <label style="font-size: 10px;">Derecha</label>
                                    <input type="number" id="jewelry-barcode-margin-right" class="form-input" 
                                           value="${template.barcode.marginRight || 0}" step="0.1" min="-10" max="10" 
                                           onchange="JewelryLabelEditor.updatePreview()" style="font-size: 11px;">
                                </div>
                                <div class="form-group" style="margin-bottom: 8px;">
                                    <label style="font-size: 10px;">Arriba</label>
                                    <input type="number" id="jewelry-barcode-margin-top" class="form-input" 
                                           value="${template.barcode.marginTop || 0}" step="0.1" min="-10" max="10" 
                                           onchange="JewelryLabelEditor.updatePreview()" style="font-size: 11px;">
                                </div>
                                <div class="form-group" style="margin-bottom: 0;">
                                    <label style="font-size: 10px;">Abajo</label>
                                    <input type="number" id="jewelry-barcode-margin-bottom" class="form-input" 
                                           value="${template.barcode.marginBottom || 0}" step="0.1" min="-10" max="10" 
                                           onchange="JewelryLabelEditor.updatePreview()" style="font-size: 11px;">
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Controles Nombre -->
                    <div style="background: var(--color-bg-card); padding: 15px; border-radius: var(--radius-md); border: 1px solid var(--color-border-light);">
                        <h4 style="margin-bottom: 12px; font-size: 13px; color: #28a745;">
                            <i class="fas fa-tag"></i> Nombre del Producto
                        </h4>
                        <div class="form-group" style="margin-bottom: 10px;">
                            <label style="font-size: 11px;">Posición X (mm)</label>
                            <input type="number" id="jewelry-name-x" class="form-input" 
                                   value="${template.name.x}" step="0.1" min="0" max="85" 
                                   onchange="JewelryLabelEditor.updatePreview()" style="font-size: 12px;">
                        </div>
                        <div class="form-group" style="margin-bottom: 10px;">
                            <label style="font-size: 11px;">Posición Y (mm)</label>
                            <input type="number" id="jewelry-name-y" class="form-input" 
                                   value="${template.name.y}" step="0.1" min="0" max="20" 
                                   onchange="JewelryLabelEditor.updatePreview()" style="font-size: 12px;">
                        </div>
                        <div class="form-group" style="margin-bottom: 10px;">
                            <label style="font-size: 11px;">Tamaño Fuente (pt)</label>
                            <input type="number" id="jewelry-name-fontsize" class="form-input" 
                                   value="${template.name.fontSize}" step="0.5" min="5" max="20" 
                                   onchange="JewelryLabelEditor.updatePreview()" style="font-size: 12px;">
                        </div>
                        <div class="form-group" style="margin-bottom: 10px;">
                            <label style="font-size: 11px; display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                <input type="checkbox" id="jewelry-name-twolines" 
                                       ${template.name.twoLines ? 'checked' : ''} 
                                       onchange="JewelryLabelEditor.updatePreview()" 
                                       style="width: 18px; height: 18px; cursor: pointer;">
                                <span>Mostrar texto en dos líneas</span>
                            </label>
                        </div>
                        <div style="border-top: 1px solid var(--color-border-light); margin: 10px 0; padding-top: 10px;">
                            <label style="font-size: 11px; font-weight: 600; color: var(--color-text-secondary); margin-bottom: 8px; display: block;">
                                <i class="fas fa-arrows-alt"></i> Ajustes Finos (mm)
                            </label>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                                <div class="form-group" style="margin-bottom: 8px;">
                                    <label style="font-size: 10px;">Izquierda</label>
                                    <input type="number" id="jewelry-name-margin-left" class="form-input" 
                                           value="${template.name.marginLeft || 0}" step="0.1" min="-10" max="10" 
                                           onchange="JewelryLabelEditor.updatePreview()" style="font-size: 11px;">
                                </div>
                                <div class="form-group" style="margin-bottom: 8px;">
                                    <label style="font-size: 10px;">Derecha</label>
                                    <input type="number" id="jewelry-name-margin-right" class="form-input" 
                                           value="${template.name.marginRight || 0}" step="0.1" min="-10" max="10" 
                                           onchange="JewelryLabelEditor.updatePreview()" style="font-size: 11px;">
                                </div>
                                <div class="form-group" style="margin-bottom: 8px;">
                                    <label style="font-size: 10px;">Arriba</label>
                                    <input type="number" id="jewelry-name-margin-top" class="form-input" 
                                           value="${template.name.marginTop || 0}" step="0.1" min="-10" max="10" 
                                           onchange="JewelryLabelEditor.updatePreview()" style="font-size: 11px;">
                                </div>
                                <div class="form-group" style="margin-bottom: 0;">
                                    <label style="font-size: 10px;">Abajo</label>
                                    <input type="number" id="jewelry-name-margin-bottom" class="form-input" 
                                           value="${template.name.marginBottom || 0}" step="0.1" min="-10" max="10" 
                                           onchange="JewelryLabelEditor.updatePreview()" style="font-size: 11px;">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div style="background: #d1ecf1; padding: 12px; border-radius: var(--radius-md); margin-bottom: 20px; border-left: 4px solid #17a2b8;">
                    <p style="margin: 0; font-size: 12px; color: #0c5460;">
                        <i class="fas fa-info-circle"></i> 
                        <strong>Nota:</strong> Puedes posicionar libremente los elementos en el área de trabajo. El área de impresión real (85mm x 20mm) está marcada en rosa. Arrastra los elementos o ajusta los valores numéricos.
                    </p>
                </div>
            </div>
        `;

        const footer = `
            <button class="btn-secondary" onclick="UI.closeModal()">Cancelar</button>
            <button class="btn-primary" onclick="JewelryLabelEditor.saveAndClose(${itemId ? itemId : 'null'})">
                <i class="fas fa-save"></i> Guardar Plantilla
            </button>
            ${itemId ? `
            <button class="btn-primary" onclick="JewelryLabelEditor.saveAndPrint(${itemId})">
                <i class="fas fa-print"></i> Guardar e Imprimir
            </button>
            ` : ''}
        `;

        UI.showModal('⚙️ Configurar Etiqueta de Joya', body, footer);

        // Configurar arrastre y actualizar previsualización inicial
        this.setupDragAndDrop();
        
        // Asegurar que la previsualización se actualice con los valores iniciales incluyendo márgenes
        setTimeout(() => {
            this.updatePreview();
        }, 200);
    },

    // Configurar arrastre de elementos
    setupDragAndDrop() {
        setTimeout(() => {
            const barcodeEl = document.getElementById('jewelry-barcode-preview');
            const nameEl = document.getElementById('jewelry-name-preview');
            const container = barcodeEl?.parentElement;

            if (!barcodeEl || !nameEl || !container) return;

            // Arrastrar código de barras - arrastrar el contenedor completo
            this.makeDraggable(barcodeEl, (x, y) => {
                const currentMarginLeft = parseFloat(document.getElementById('jewelry-barcode-margin-left')?.value || 0);
                const currentMarginTop = parseFloat(document.getElementById('jewelry-barcode-margin-top')?.value || 0);
                
                // Calcular posición real dentro del área de impresión (sin extensión)
                const actualX = x / 6;
                const actualY = y / 6;
                
                // Calcular posición para guardar en la plantilla
                const mmX = Math.max(0, Math.min(85, actualX - currentMarginLeft));
                const mmY = Math.max(0, Math.min(20, actualY - currentMarginTop));
                
                const xInput = document.getElementById('jewelry-barcode-x');
                const yInput = document.getElementById('jewelry-barcode-y');
                if (xInput) {
                    xInput.value = mmX.toFixed(1);
                    xInput.dispatchEvent(new Event('change', { bubbles: true }));
                }
                if (yInput) {
                    yInput.value = mmY.toFixed(1);
                    yInput.dispatchEvent(new Event('change', { bubbles: true }));
                }
                this.updatePreview();
            });

            // Escalar código de barras desde las esquinas (redimensionamiento completo)
            const resizeHandleTL = document.getElementById('jewelry-barcode-resize-handle-top-left');
            const resizeHandleTR = document.getElementById('jewelry-barcode-resize-handle-top-right');
            const resizeHandleBL = document.getElementById('jewelry-barcode-resize-handle-bottom-left');
            const resizeHandleBR = document.getElementById('jewelry-barcode-resize-handle-bottom-right');
            
            // Función para escalar desde cualquier esquina
            // Redimensiona el contenedor completo directamente
            const makeCornerResizable = (handle, corner) => {
                if (!handle) return;
                this.makeResizableCorner(barcodeEl, handle, corner, (newWidth, newHeight, newX, newY) => {
                    // Convertir px a mm (escala 6:1)
                    const containerRect = container.getBoundingClientRect();
                    const barcodeRect = barcodeEl.getBoundingClientRect();
                    
                    // Calcular posición absoluta del contenedor
                    const absoluteX = (barcodeRect.left - containerRect.left) / 6;
                    const absoluteY = (barcodeRect.top - containerRect.top) / 6;
                    
                    const mmWidth = Math.max(1, Math.min(85, newWidth / 6));
                    const mmHeight = Math.max(1, Math.min(20, newHeight / 6));
                    const mmX = Math.max(0, Math.min(85, absoluteX));
                    const mmY = Math.max(0, Math.min(20, absoluteY));
                    
                    const widthInput = document.getElementById('jewelry-barcode-width');
                    const heightInput = document.getElementById('jewelry-barcode-height');
                    const xInput = document.getElementById('jewelry-barcode-x');
                    const yInput = document.getElementById('jewelry-barcode-y');
                    
                    if (widthInput) widthInput.value = mmWidth.toFixed(1);
                    if (heightInput) heightInput.value = mmHeight.toFixed(1);
                    if (xInput) xInput.value = mmX.toFixed(1);
                    if (yInput) yInput.value = mmY.toFixed(1);
                    
                    this.updatePreview();
                });
            };
            
            makeCornerResizable(resizeHandleTL, 'top-left');
            makeCornerResizable(resizeHandleTR, 'top-right');
            makeCornerResizable(resizeHandleBL, 'bottom-left');
            makeCornerResizable(resizeHandleBR, 'bottom-right');
            
            // Estirar código de barras solo verticalmente (centro inferior)
            const resizeHandleBottom = document.getElementById('jewelry-barcode-resize-handle-bottom');
            if (resizeHandleBottom) {
                this.makeResizableVertical(barcodeEl, resizeHandleBottom, (newHeight) => {
                    // Convertir px a mm (escala 6:1)
                    const mmHeight = Math.max(1, Math.min(20, newHeight / 6));
                    const heightInput = document.getElementById('jewelry-barcode-height');
                    if (heightInput) {
                        heightInput.value = mmHeight.toFixed(1);
                        heightInput.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    this.updatePreview();
                });
            }
            
            // Estirar código de barras solo horizontalmente (centro derecho)
            const resizeHandleRight = document.getElementById('jewelry-barcode-resize-handle-right');
            if (resizeHandleRight) {
                this.makeResizableHorizontal(barcodeEl, resizeHandleRight, (newWidth) => {
                    // Convertir px a mm (escala 6:1)
                    const mmWidth = Math.max(1, Math.min(85, newWidth / 6));
                    const widthInput = document.getElementById('jewelry-barcode-width');
                    if (widthInput) {
                        widthInput.value = mmWidth.toFixed(1);
                        widthInput.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    this.updatePreview();
                });
            }

            // Arrastrar nombre - movimiento libre en área de trabajo ampliada
            this.makeDraggable(nameEl, (x, y) => {
                const currentMarginLeft = parseFloat(document.getElementById('jewelry-name-margin-left')?.value || 0);
                const currentMarginTop = parseFloat(document.getElementById('jewelry-name-margin-top')?.value || 0);
                
                // Permitir movimiento en área ampliada pero limitar valores guardados a área de impresión real (85mm x 20mm)
                const mmX = Math.max(0, Math.min(85, (x / 6) - currentMarginLeft));
                const mmY = Math.max(0, Math.min(20, (y / 6) - currentMarginTop));
                
                const xInput = document.getElementById('jewelry-name-x');
                const yInput = document.getElementById('jewelry-name-y');
                if (xInput) {
                    xInput.value = mmX.toFixed(1);
                    xInput.dispatchEvent(new Event('change', { bubbles: true }));
                }
                if (yInput) {
                    yInput.value = mmY.toFixed(1);
                    yInput.dispatchEvent(new Event('change', { bubbles: true }));
                }
                this.updatePreview();
            });

            // Ajustar tamaño de fuente del texto arrastrando handles
            const fontSizeHandleLeft = document.getElementById('jewelry-name-resize-handle-top-left');
            const fontSizeHandleRight = document.getElementById('jewelry-name-resize-handle-top-right');
            
            if (fontSizeHandleLeft) {
                this.makeFontSizeResizable(nameEl, fontSizeHandleLeft, (deltaY) => {
                    const currentFontSize = parseFloat(document.getElementById('jewelry-name-fontsize')?.value || 7);
                    // Calcular nuevo tamaño basado en el movimiento vertical
                    // Movimiento hacia arriba = aumentar, hacia abajo = disminuir
                    // 1px de movimiento = aproximadamente 0.1pt de cambio
                    const newFontSize = Math.max(5, Math.min(20, currentFontSize - (deltaY * 0.1)));
                    const fontSizeInput = document.getElementById('jewelry-name-fontsize');
                    if (fontSizeInput) {
                        fontSizeInput.value = newFontSize.toFixed(1);
                        fontSizeInput.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    this.updatePreview();
                });
            }
            
            if (fontSizeHandleRight) {
                this.makeFontSizeResizable(nameEl, fontSizeHandleRight, (deltaY) => {
                    const currentFontSize = parseFloat(document.getElementById('jewelry-name-fontsize')?.value || 7);
                    const newFontSize = Math.max(5, Math.min(20, currentFontSize - (deltaY * 0.1)));
                    const fontSizeInput = document.getElementById('jewelry-name-fontsize');
                    if (fontSizeInput) {
                        fontSizeInput.value = newFontSize.toFixed(1);
                        fontSizeInput.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    this.updatePreview();
                });
            }
        }, 100);
    },

    // Hacer elemento arrastrable
    makeDraggable(element, onMove) {
        let isDragging = false;
        let startX, startY, initialX, initialY;

        element.addEventListener('mousedown', (e) => {
            // No activar arrastre si se hace clic en los handles de redimensionamiento
            if (e.target.id === 'jewelry-barcode-resize-handle' || 
                e.target.closest('#jewelry-barcode-resize-handle') ||
                e.target.id === 'jewelry-barcode-resize-handle-top-left' ||
                e.target.id === 'jewelry-barcode-resize-handle-top-right' ||
                e.target.id === 'jewelry-barcode-resize-handle-bottom-left' ||
                e.target.id === 'jewelry-barcode-resize-handle-bottom-right' ||
                e.target.id === 'jewelry-barcode-resize-handle-bottom' ||
                e.target.id === 'jewelry-barcode-resize-handle-right' ||
                e.target.closest('#jewelry-barcode-resize-handle-top-left') ||
                e.target.closest('#jewelry-barcode-resize-handle-top-right') ||
                e.target.closest('#jewelry-barcode-resize-handle-bottom-left') ||
                e.target.closest('#jewelry-barcode-resize-handle-bottom-right') ||
                e.target.closest('#jewelry-barcode-resize-handle-bottom') ||
                e.target.closest('#jewelry-barcode-resize-handle-right') ||
                e.target.id === 'jewelry-name-resize-handle-top-left' ||
                e.target.id === 'jewelry-name-resize-handle-top-right' ||
                e.target.closest('#jewelry-name-resize-handle-top-left') ||
                e.target.closest('#jewelry-name-resize-handle-top-right')) {
                return;
            }
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = element.parentElement.getBoundingClientRect();
            initialX = element.offsetLeft;
            initialY = element.offsetTop;
            element.style.cursor = 'grabbing';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            
            // Permitir movimiento libre en área de impresión (510px = 85mm, 120px = 20mm)
            // Para el código de barras, permitir extensión de 15mm a la izquierda (-90px = -15mm * 6)
            const container = element.parentElement;
            const containerWidth = container.offsetWidth || 510;
            const containerHeight = container.offsetHeight || 120;
            
            // Si es el contenedor interno del código de barras, permitir posición negativa hasta -90px (15mm a la izquierda)
            const isBarcodePreview = element.id === 'jewelry-barcode-preview';
            const minX = isBarcodePreview ? -90 : 0; // -90px = -15mm * 6
            
            const newX = Math.max(minX, Math.min(containerWidth - element.offsetWidth, initialX + deltaX));
            const newY = Math.max(0, Math.min(containerHeight - element.offsetHeight, initialY + deltaY));
            
            element.style.left = newX + 'px';
            element.style.top = newY + 'px';
            
            if (onMove) onMove(newX, newY);
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                element.style.cursor = 'move';
            }
        });
    },

    // Hacer elemento redimensionable verticalmente
    makeResizableVertical(element, handle, onResize) {
        let isResizing = false;
        let startY, initialHeight, initialTop;

        handle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startY = e.clientY;
            initialHeight = element.offsetHeight;
            initialTop = element.offsetTop;
            handle.style.cursor = 'ns-resize';
            element.style.cursor = 'ns-resize';
            e.preventDefault();
            e.stopPropagation(); // Evitar que se active el arrastre del elemento padre
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            
            const deltaY = e.clientY - startY;
            const container = element.parentElement;
            const containerHeight = container.offsetHeight || 120;
            const maxHeight = containerHeight - (element.offsetTop);
            
            // Calcular nueva altura (mínimo 6px = 1mm, máximo hasta el borde del contenedor)
            const newHeight = Math.max(6, Math.min(maxHeight, initialHeight + deltaY));
            
            element.style.height = newHeight + 'px';
            
            if (onResize) onResize(newHeight);
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                handle.style.cursor = 'ns-resize';
                element.style.cursor = 'move';
            }
        });
    },

    // Hacer elemento redimensionable horizontalmente
    makeResizableHorizontal(element, handle, onResize) {
        let isResizing = false;
        let startX, initialWidth, initialLeft;

        handle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            initialWidth = element.offsetWidth;
            initialLeft = element.offsetLeft;
            handle.style.cursor = 'ew-resize';
            element.style.cursor = 'ew-resize';
            e.preventDefault();
            e.stopPropagation();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            
            const deltaX = e.clientX - startX;
            const container = element.parentElement;
            const containerWidth = container.offsetWidth || 420;
            const maxWidth = containerWidth - element.offsetLeft;
            
            // Calcular nuevo ancho (mínimo 6px = 1mm, máximo hasta el borde del contenedor)
            const newWidth = Math.max(6, Math.min(maxWidth, initialWidth + deltaX));
            
            element.style.width = newWidth + 'px';
            
            if (onResize) onResize(newWidth);
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                handle.style.cursor = 'ew-resize';
                element.style.cursor = 'move';
            }
        });
    },

    // Hacer elemento redimensionable desde esquinas (escalado completo)
    makeResizableCorner(element, handle, corner, onResize) {
        let isResizing = false;
        let startX, startY, initialWidth, initialHeight, initialLeft, initialTop;

        handle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startY = e.clientY;
            initialWidth = element.offsetWidth;
            initialHeight = element.offsetHeight;
            initialLeft = element.offsetLeft;
            initialTop = element.offsetTop;
            handle.style.cursor = corner.includes('left') ? 'nwse-resize' : 'nesw-resize';
            element.style.cursor = corner.includes('left') ? 'nwse-resize' : 'nesw-resize';
            e.preventDefault();
            e.stopPropagation();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            const container = element.parentElement;
            const containerWidth = container.offsetWidth || 420;
            const containerHeight = container.offsetHeight || 120;
            
            let newWidth = initialWidth;
            let newHeight = initialHeight;
            let newLeft = initialLeft;
            let newTop = initialTop;
            
            // Calcular según la esquina
            if (corner === 'top-left') {
                newWidth = Math.max(6, Math.min(containerWidth - initialLeft, initialWidth - deltaX));
                newHeight = Math.max(6, Math.min(containerHeight - initialTop, initialHeight - deltaY));
                newLeft = initialLeft + (initialWidth - newWidth);
                newTop = initialTop + (initialHeight - newHeight);
            } else if (corner === 'top-right') {
                newWidth = Math.max(6, Math.min(containerWidth - initialLeft, initialWidth + deltaX));
                newHeight = Math.max(6, Math.min(containerHeight - initialTop, initialHeight - deltaY));
                newTop = initialTop + (initialHeight - newHeight);
            } else if (corner === 'bottom-left') {
                newWidth = Math.max(6, Math.min(containerWidth - initialLeft, initialWidth - deltaX));
                newHeight = Math.max(6, Math.min(containerHeight - initialTop, initialHeight + deltaY));
                newLeft = initialLeft + (initialWidth - newWidth);
            } else if (corner === 'bottom-right') {
                newWidth = Math.max(6, Math.min(containerWidth - initialLeft, initialWidth + deltaX));
                newHeight = Math.max(6, Math.min(containerHeight - initialTop, initialHeight + deltaY));
            }
            
            // Limitar dentro del contenedor
            newLeft = Math.max(0, Math.min(containerWidth - newWidth, newLeft));
            newTop = Math.max(0, Math.min(containerHeight - newHeight, newTop));
            
            element.style.width = newWidth + 'px';
            element.style.height = newHeight + 'px';
            element.style.left = newLeft + 'px';
            element.style.top = newTop + 'px';
            
            if (onResize) onResize(newWidth, newHeight, newLeft, newTop);
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                handle.style.cursor = corner.includes('left') ? 'nwse-resize' : 'nesw-resize';
                element.style.cursor = 'move';
            }
        });
    },

    // Ajustar tamaño de fuente arrastrando handle
    makeFontSizeResizable(element, handle, onResize) {
        let isResizing = false;
        let startY, initialFontSize;

        handle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startY = e.clientY;
            initialFontSize = parseFloat(document.getElementById('jewelry-name-fontsize')?.value || 7);
            handle.style.cursor = 'ns-resize';
            element.style.cursor = 'ns-resize';
            e.preventDefault();
            e.stopPropagation(); // Evitar que se active el arrastre del elemento padre
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            
            const deltaY = startY - e.clientY; // Invertido: hacia arriba aumenta, hacia abajo disminuye
            
            // Calcular nuevo tamaño de fuente (mínimo 5pt, máximo 20pt)
            // 1px de movimiento = 0.1pt de cambio
            const newFontSize = Math.max(5, Math.min(20, initialFontSize + (deltaY * 0.1)));
            
            if (onResize) onResize(deltaY);
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                handle.style.cursor = 'nesw-resize';
                element.style.cursor = 'move';
            }
        });
    },

    // Actualizar previsualización
    updatePreview() {
        const barcodeX = parseFloat(document.getElementById('jewelry-barcode-x')?.value || 0);
        const barcodeY = parseFloat(document.getElementById('jewelry-barcode-y')?.value || 0);
        const barcodeWidth = parseFloat(document.getElementById('jewelry-barcode-width')?.value || 9);
        const barcodeHeight = parseFloat(document.getElementById('jewelry-barcode-height')?.value || 6);
        const barcodeMarginLeft = parseFloat(document.getElementById('jewelry-barcode-margin-left')?.value || 0);
        const barcodeMarginRight = parseFloat(document.getElementById('jewelry-barcode-margin-right')?.value || 0);
        const barcodeMarginTop = parseFloat(document.getElementById('jewelry-barcode-margin-top')?.value || 0);
        const barcodeMarginBottom = parseFloat(document.getElementById('jewelry-barcode-margin-bottom')?.value || 0);
        
        const nameX = parseFloat(document.getElementById('jewelry-name-x')?.value || 0);
        const nameY = parseFloat(document.getElementById('jewelry-name-y')?.value || 0);
        const nameFontSize = parseFloat(document.getElementById('jewelry-name-fontsize')?.value || 7);
        const nameTwoLines = document.getElementById('jewelry-name-twolines')?.checked || false;
        const nameMarginLeft = parseFloat(document.getElementById('jewelry-name-margin-left')?.value || 0);
        const nameMarginRight = parseFloat(document.getElementById('jewelry-name-margin-right')?.value || 0);
        const nameMarginTop = parseFloat(document.getElementById('jewelry-name-margin-top')?.value || 0);
        const nameMarginBottom = parseFloat(document.getElementById('jewelry-name-margin-bottom')?.value || 0);

        const barcodeEl = document.getElementById('jewelry-barcode-preview'); // Contenedor interno (imagen)
        const barcodeBackground = document.getElementById('jewelry-barcode-background'); // Contenedor externo (fondo)
        const nameEl = document.getElementById('jewelry-name-preview');

        if (barcodeEl && barcodeBackground) {
            // Actualizar contenedor completo (ajustado al tamaño de las líneas azules, sin extensión)
            barcodeEl.style.left = ((barcodeX + barcodeMarginLeft) * 6) + 'px';
            barcodeEl.style.top = ((barcodeY + barcodeMarginTop) * 6) + 'px';
            barcodeEl.style.width = (barcodeWidth * 6) + 'px';
            barcodeEl.style.height = (barcodeHeight * 6) + 'px';
        }

        if (nameEl) {
            // Aplicar posición base + ajustes de margen
            nameEl.style.left = ((nameX + nameMarginLeft) * 6) + 'px';
            nameEl.style.top = ((nameY + nameMarginTop) * 6) + 'px';
            nameEl.style.fontSize = nameFontSize + 'pt';
            // Calcular max-width considerando área de impresión real (85mm x 20mm)
            const availableWidth = 85 - nameX - nameMarginLeft - nameMarginRight;
            nameEl.style.maxWidth = (Math.max(0, availableWidth) * 6) + 'px';
            // Configurar para una o dos líneas
            if (nameTwoLines) {
                nameEl.style.whiteSpace = 'normal';
                nameEl.style.wordWrap = 'break-word';
                nameEl.style.lineHeight = (nameFontSize * 1.2) + 'pt';
                nameEl.style.maxHeight = (nameFontSize * 2.4) + 'pt'; // Permitir hasta 2 líneas
                nameEl.style.overflow = 'hidden';
            } else {
                nameEl.style.whiteSpace = 'nowrap';
                nameEl.style.textOverflow = 'ellipsis';
                nameEl.style.overflow = 'hidden';
            }
            // Los márgenes ya están aplicados en left/top, no necesitamos margin CSS adicional
        }
    },

    // Obtener template actual del formulario
    getCurrentTemplate() {
        const xInput = document.getElementById('jewelry-barcode-x');
        const yInput = document.getElementById('jewelry-barcode-y');
        const widthInput = document.getElementById('jewelry-barcode-width');
        const heightInput = document.getElementById('jewelry-barcode-height');
        
        const template = {
            barcode: {
                x: parseFloat(xInput?.value || 1),
                y: parseFloat(yInput?.value || 1),
                width: parseFloat(widthInput?.value || 9),
                height: parseFloat(heightInput?.value || 6),
                marginLeft: parseFloat(document.getElementById('jewelry-barcode-margin-left')?.value || 0),
                marginRight: parseFloat(document.getElementById('jewelry-barcode-margin-right')?.value || 0),
                marginTop: parseFloat(document.getElementById('jewelry-barcode-margin-top')?.value || 0),
                marginBottom: parseFloat(document.getElementById('jewelry-barcode-margin-bottom')?.value || 0)
            },
            name: {
                x: parseFloat(document.getElementById('jewelry-name-x')?.value || 1),
                y: parseFloat(document.getElementById('jewelry-name-y')?.value || 7.5),
                fontSize: parseFloat(document.getElementById('jewelry-name-fontsize')?.value || 7),
                twoLines: document.getElementById('jewelry-name-twolines')?.checked || false,
                marginLeft: parseFloat(document.getElementById('jewelry-name-margin-left')?.value || 0),
                marginRight: parseFloat(document.getElementById('jewelry-name-margin-right')?.value || 0),
                marginTop: parseFloat(document.getElementById('jewelry-name-margin-top')?.value || 0),
                marginBottom: parseFloat(document.getElementById('jewelry-name-margin-bottom')?.value || 0)
            }
        };
        
        console.log('📋 Template obtenido del formulario:', template);
        console.log('📋 Valores de inputs:', {
            barcodeX: xInput?.value,
            barcodeY: yInput?.value,
            barcodeWidth: widthInput?.value,
            barcodeHeight: heightInput?.value,
            barcodeMarginLeft: document.getElementById('jewelry-barcode-margin-left')?.value,
            barcodeMarginRight: document.getElementById('jewelry-barcode-margin-right')?.value,
            barcodeMarginTop: document.getElementById('jewelry-barcode-margin-top')?.value,
            barcodeMarginBottom: document.getElementById('jewelry-barcode-margin-bottom')?.value
        });
        
        // Validar que todos los valores estén presentes y sean válidos
        if (!template.barcode || !template.barcode.width || !template.barcode.height) {
            console.error('❌ Error: Template incompleto', template);
            throw new Error('Template incompleto: faltan datos del código de barras');
        }
        
        // Validar que los valores numéricos sean válidos
        if (isNaN(template.barcode.width) || isNaN(template.barcode.height)) {
            console.error('❌ Error: Valores numéricos inválidos en template', template);
            throw new Error('Template inválido: valores numéricos incorrectos');
        }
        
        return template;
    },

    // Guardar y cerrar
    async saveAndClose(itemId) {
        const template = this.getCurrentTemplate();
        console.log('💾 Guardando plantilla desde saveAndClose:', template);
        const saved = await this.saveTemplate(template);
        if (saved) {
            UI.closeModal();
            // Actualizar estado en Settings si está abierto
            if (typeof Settings !== 'undefined' && Settings.updateJewelryLabelStatus) {
                await Settings.updateJewelryLabelStatus();
            }
            if (itemId) {
                Utils.showNotification('Plantilla guardada. Usa "Imprimir Etiqueta Joya" para imprimir.', 'info');
            }
        } else {
            Utils.showNotification('Error al guardar la plantilla. Revisa la consola para más detalles.', 'error');
        }
    },

    // Guardar e imprimir
    async saveAndPrint(itemId) {
        const template = this.getCurrentTemplate();
        const saved = await this.saveTemplate(template);
        if (saved) {
            UI.closeModal();
            // Actualizar estado en Settings si está abierto
            if (typeof Settings !== 'undefined' && Settings.updateJewelryLabelStatus) {
                await Settings.updateJewelryLabelStatus();
            }
            await this.printJewelryLabel(itemId);
        }
    },

    // Imprimir etiqueta de joya
    async printJewelryLabel(itemId, testItem = null) {
        try {
            let item = testItem;
            if (!item && itemId !== 'test') {
                item = await DB.get('inventory_items', itemId);
                if (!item) {
                    Utils.showNotification('Pieza no encontrada', 'error');
                    return;
                }
            } else if (itemId === 'test' && !testItem) {
                // Crear item de prueba por defecto
                item = {
                    id: 'test',
                    name: 'Anillo Oro 18K Diamante',
                    sku: 'TEST-001',
                    barcode: '123456789012',
                    price: 15000
                };
            }

            // Verificar si hay plantilla
            const hasTemplate = await this.hasTemplate();
            if (!hasTemplate) {
                // Si no hay plantilla, mostrar editor primero
                await this.showEditor(itemId);
                return;
            }

            // Cargar plantilla
            const template = await this.loadTemplate();
            
            // Debug: Verificar que la plantilla se cargó correctamente
            console.log('📋 Plantilla cargada para impresión:', {
                barcode: {
                    x: template.barcode?.x,
                    y: template.barcode?.y,
                    width: template.barcode?.width,
                    height: template.barcode?.height,
                    margins: {
                        left: template.barcode?.marginLeft,
                        right: template.barcode?.marginRight,
                        top: template.barcode?.marginTop,
                        bottom: template.barcode?.marginBottom
                    }
                },
                name: {
                    x: template.name?.x,
                    y: template.name?.y,
                    fontSize: template.name?.fontSize
                }
            });

            // Generar código de barras con tamaño basado en la plantilla
            // Usando EAN8 (8 dígitos) - más corto y más fácil de escanear que CODE128
            // Barras más gruesas para mejor detección del escáner
            // JsBarcode width es relativo (1-3 típicamente), height es en píxeles
            
            // Función auxiliar para convertir a EAN8 (8 dígitos)
            const toEAN8 = (value) => {
                if (!value) return '12345670'; // EAN8 de ejemplo
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
            };
            
            const barcodeValue = toEAN8(item.barcode || item.sku || '12345670');
            // Altura: convertir mm a píxeles (1mm ≈ 3.78px), pero aumentar para mejor legibilidad del escáner
            const barcodeHeightPx = Math.max(80, Math.round(template.barcode.height * 8)); // Altura aumentada significativamente
            // Ancho: aumentar el width para hacer barras más gruesas (menos barras = mejor detección del escáner)
            // Width más alto = barras más gruesas = menos barras visibles = más fácil de escanear
            const barcodeWidth = Math.max(2.5, Math.min(3.5, template.barcode.width / 8)); // Width aumentado para barras más gruesas
            
            console.log('📊 Generando código de barras:', {
                value: barcodeValue,
                width: barcodeWidth,
                height: barcodeHeightPx,
                templateSize: { width: template.barcode.width, height: template.barcode.height }
            });
            
            const barcodeImg = await BarcodeManager.generateBarcodeImage(
                barcodeValue, 
                'EAN8', 
                {
                    width: barcodeWidth,
                    height: barcodeHeightPx,
                    displayValue: false,
                    margin: 0,
                    background: '#ffffff',
                    lineColor: '#000000'
                }
            );
            
            if (!barcodeImg) {
                throw new Error('No se pudo generar el código de barras');
            }
            
            console.log('✅ Código de barras generado, tamaño imagen:', barcodeImg.length, 'caracteres');

            // Nombre del producto - dividir en dos líneas si está configurado
            let productName = (item.name || item.sku || 'Sin nombre');
            let productNameHTML = productName;
            
            if (template.name.twoLines) {
                // Dividir el texto en dos líneas de manera inteligente
                const maxLength = 35; // Longitud máxima por línea
                if (productName.length > maxLength) {
                    // Intentar dividir por espacio en la mitad
                    const midPoint = Math.floor(productName.length / 2);
                    let splitPoint = midPoint;
                    
                    // Buscar el espacio más cercano al punto medio
                    for (let i = 0; i < midPoint; i++) {
                        if (productName[midPoint + i] === ' ') {
                            splitPoint = midPoint + i;
                            break;
                        }
                        if (productName[midPoint - i] === ' ') {
                            splitPoint = midPoint - i;
                            break;
                        }
                    }
                    
                    const line1 = productName.substring(0, splitPoint).trim();
                    const line2 = productName.substring(splitPoint).trim();
                    productNameHTML = `${line1}<br>${line2}`;
                }
            } else {
                // Truncar si es muy largo para una línea
                productNameHTML = productName.substring(0, 30);
            }

            // Crear HTML de impresión con medidas precisas
            // Para etiquetas con gap (cola de rata), usar tamaño exacto sin escalado
            // Convertir mm a puntos para mayor precisión: 1mm = 2.83465pt
            const mmToPt = 2.83465;
            const labelWidthPt = 85 * mmToPt;
            const labelHeightPt = 20 * mmToPt;
            
            // Usar exactamente los valores de la plantilla guardada
            // Aplicar los márgenes de la misma manera que en el editor para consistencia total
            // En el editor: left = (barcodeX + barcodeMarginLeft) * 6
            // En impresión: left = (barcodeX + barcodeMarginLeft) * mmToPt
            const barcodeX = template.barcode.x + (template.barcode.marginLeft || 0);
            const barcodeY = template.barcode.y + (template.barcode.marginTop || 0);
            const barcodeContainerWidth = template.barcode.width;
            const barcodeContainerHeight = template.barcode.height;
            
            console.log('📍 Usando valores exactos de la plantilla para impresión:', {
                templateX: template.barcode.x,
                templateY: template.barcode.y,
                marginLeft: template.barcode.marginLeft || 0,
                marginTop: template.barcode.marginTop || 0,
                finalX: barcodeX,
                finalY: barcodeY,
                width: barcodeContainerWidth,
                height: barcodeContainerHeight,
                note: 'Aplicando márgenes igual que en el editor para consistencia total'
            });
            
            const printHTML = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Etiqueta Joya ${item.sku}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        @page {
            size: ${labelWidthPt}pt ${labelHeightPt}pt;
            margin: 0;
        }
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            color-adjust: exact;
        }
        html, body {
            width: ${labelWidthPt}pt;
            height: ${labelHeightPt}pt;
            margin: 0;
            padding: 0;
            overflow: hidden;
        }
        body {
            font-family: Arial, sans-serif;
            position: relative;
            background: white;
        }
        .label-container {
            position: relative;
            width: ${labelWidthPt}pt;
            height: ${labelHeightPt}pt;
            margin: 0;
            padding: 0;
            background: white;
        }
        .barcode {
            position: absolute;
            left: ${barcodeX * mmToPt}pt;
            top: ${barcodeY * mmToPt}pt;
            width: ${barcodeContainerWidth * mmToPt}pt;
            height: ${barcodeContainerHeight * mmToPt}pt;
            margin: 0;
            padding: 0;
            z-index: 1;
            background: white;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
        }
        .barcode img {
            width: 100% !important;
            height: 100% !important;
            object-fit: contain;
            display: block !important;
            margin: 0;
            padding: 0;
            image-rendering: -webkit-optimize-contrast;
            image-rendering: crisp-edges;
        }
        .product-name {
            position: absolute;
            left: ${(template.name.x + (template.name.marginLeft || 0)) * mmToPt}pt;
            top: ${(template.name.y + (template.name.marginTop || 0)) * mmToPt}pt;
            font-size: ${template.name.fontSize}pt;
            font-weight: bold;
            line-height: ${template.name.fontSize * 1.2}pt;
            max-width: ${(85 - template.name.x - (template.name.marginLeft || 0) - (template.name.marginRight || 0)) * mmToPt}pt;
            margin: 0;
            padding: 0;
            z-index: 2;
            color: black;
            ${template.name.twoLines ? `
                white-space: normal;
                word-wrap: break-word;
                overflow: hidden;
                max-height: ${template.name.fontSize * 2.4}pt;
            ` : `
                white-space: nowrap;
                text-overflow: ellipsis;
                overflow: hidden;
            `}
        }
        @media print {
            html, body {
                width: ${labelWidthPt}pt !important;
                height: ${labelHeightPt}pt !important;
                margin: 0 !important;
                padding: 0 !important;
                transform: scale(1) !important;
                zoom: 1 !important;
            }
            .label-container {
                width: ${labelWidthPt}pt !important;
                height: ${labelHeightPt}pt !important;
                transform: scale(1) !important;
            }
            @page {
                size: ${labelWidthPt}pt ${labelHeightPt}pt;
                margin: 0;
            }
            .barcode, .barcode img {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
            /* Desactivar ajuste automático del navegador */
            * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
        }
        @media screen {
            body {
                background: #f0f0f0;
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
            }
            .label-container {
                background: white;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }
        }
    </style>
</head>
<body>
    <div class="label-container">
        <div class="barcode">
            <img src="${barcodeImg}" alt="Barcode" onerror="console.error('Error cargando código de barras'); this.style.border='2px solid red';">
        </div>
        <div class="product-name">${productNameHTML}</div>
    </div>
    <script>
        // Configuración para evitar escalado automático
        document.addEventListener('DOMContentLoaded', function() {
            // Forzar tamaño exacto sin escalado
            document.body.style.width = '${labelWidthPt}pt';
            document.body.style.height = '${labelHeightPt}pt';
            document.body.style.margin = '0';
            document.body.style.padding = '0';
            document.body.style.transform = 'scale(1)';
            document.body.style.zoom = '1';
            
            // Verificar que la imagen se cargó
            const img = document.querySelector('.barcode img');
            if (img) {
                console.log('Imagen código de barras cargada:', img.complete, img.naturalWidth, img.naturalHeight);
                if (!img.complete || img.naturalWidth === 0) {
                    console.error('La imagen del código de barras no se cargó correctamente');
                }
            }
        });
        
        // Prevenir ajuste automático en impresión
        window.addEventListener('beforeprint', function() {
            document.body.style.width = '${labelWidthPt}pt';
            document.body.style.height = '${labelHeightPt}pt';
            document.body.style.transform = 'scale(1)';
            document.body.style.zoom = '1';
        });
    </script>
</body>
</html>
            `;
            
            console.log('📄 HTML de impresión generado con plantilla:', {
                barcode: { x: template.barcode.x, y: template.barcode.y, width: template.barcode.width, height: template.barcode.height },
                name: { x: template.name.x, y: template.name.y, fontSize: template.name.fontSize }
            });

            // Abrir ventana de impresión
            const printWindow = window.open('', '_blank');
            if (!printWindow) {
                Utils.showNotification('No se pudo abrir la ventana de impresión. Verifica los bloqueadores de ventanas emergentes.', 'error');
                return;
            }
            
            printWindow.document.write(printHTML);
            printWindow.document.close();
            
            // Esperar a que la imagen se cargue completamente antes de imprimir
            printWindow.addEventListener('load', () => {
                const img = printWindow.document.querySelector('.barcode img');
                if (img) {
                    if (img.complete) {
                        console.log('✅ Imagen ya cargada, imprimiendo...');
                        setTimeout(() => {
                            printWindow.print();
                        }, 100);
                    } else {
                        console.log('⏳ Esperando carga de imagen...');
                        img.onload = () => {
                            console.log('✅ Imagen cargada, imprimiendo...');
                            setTimeout(() => {
                                printWindow.print();
                            }, 100);
                        };
                        img.onerror = () => {
                            console.error('❌ Error cargando imagen del código de barras');
                            Utils.showNotification('Error: No se pudo cargar el código de barras', 'error');
                        };
                        // Timeout de seguridad
                        setTimeout(() => {
                            if (printWindow && !printWindow.closed) {
                                console.log('⏱️ Timeout alcanzado, imprimiendo de todas formas...');
                                printWindow.print();
                            }
                        }, 2000);
                    }
                } else {
                    console.warn('⚠️ No se encontró la imagen del código de barras en el DOM');
                    setTimeout(() => {
                        printWindow.print();
                    }, 500);
                }
            });

            Utils.showNotification('✅ Etiqueta enviada a impresión', 'success');

        } catch (e) {
            console.error('Error imprimiendo etiqueta de joya:', e);
            Utils.showNotification('Error al imprimir etiqueta', 'error');
        }
    }
};

// Exponer globalmente
window.JewelryLabelEditor = JewelryLabelEditor;

