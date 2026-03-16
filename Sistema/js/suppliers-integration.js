/**
 * MÓDULO DE INTEGRACIÓN AVANZADA DE PROVEEDORES
 * Integración con Inventario, Costos y Reportes
 * 
 * Este módulo extiende la funcionalidad básica con integraciones avanzadas
 */

window.SuppliersIntegration = {
    initialized: false,

    async init() {
        if (this.initialized) return;
        
        console.log('🔧 Inicializando módulo de integración de proveedores...');
        this.initialized = true;
    },

    // ========== INTEGRACIÓN CON INVENTARIO AVANZADA ==========

    /**
     * Generar orden de compra desde items con stock bajo
     */
    async generatePOFromLowStock(supplierId = null) {
        try {
            // Obtener items con stock bajo
            const allItems = await DB.getAll('inventory_items') || [];
            const lowStockItems = allItems.filter(item => {
                const stockActual = parseFloat(item.stock_actual || 0);
                const stockMinimo = parseFloat(item.stock_minimo || 0);
                return stockActual <= stockMinimo && item.supplier_id;
            });

            if (lowStockItems.length === 0) {
                Utils.showNotification('No hay items con stock bajo que requieran orden de compra', 'info');
                return;
            }

            // Agrupar por proveedor
            const itemsBySupplier = {};
            lowStockItems.forEach(item => {
                const sid = item.supplier_id;
                if (!itemsBySupplier[sid]) {
                    itemsBySupplier[sid] = [];
                }
                itemsBySupplier[sid].push(item);
            });

            // Si se especifica un proveedor, solo mostrar ese
            const suppliersToProcess = supplierId 
                ? [supplierId] 
                : Object.keys(itemsBySupplier);

            if (suppliersToProcess.length === 0) {
                Utils.showNotification('No hay items con stock bajo para este proveedor', 'info');
                return;
            }

            // Mostrar modal para seleccionar proveedor y items
            const suppliers = await Promise.all(
                suppliersToProcess.map(id => DB.get('suppliers', id) || API.getSupplier(id))
            );

            const body = `
                <div class="generate-po-view">
                    <h4>Generar Orden de Compra desde Stock Bajo</h4>
                    <div class="form-group">
                        <label>Seleccionar Proveedor</label>
                        <select id="po-supplier-select" class="form-select">
                            <option value="">Seleccionar proveedor...</option>
                            ${suppliers.map(s => `
                                <option value="${s.id}" data-items-count="${itemsBySupplier[s.id]?.length || 0}">
                                    ${s.name} (${itemsBySupplier[s.id]?.length || 0} items)
                                </option>
                            `).join('')}
                        </select>
                    </div>
                    <div id="po-items-preview" class="po-items-preview" style="display: none;">
                        <h5>Items a Incluir</h5>
                        <div id="po-items-list" class="po-items-list"></div>
                    </div>
                </div>
            `;

            UI.showModal({
                title: 'Generar Orden de Compra',
                content: body,
                buttons: [
                    { text: 'Cancelar', class: 'btn-secondary', onclick: () => UI.closeModal() },
                    { 
                        text: 'Crear Orden', 
                        class: 'btn-primary', 
                        onclick: () => this.createPOFromItems() 
                    }
                ]
            });

            // Listener para cambio de proveedor
            document.getElementById('po-supplier-select')?.addEventListener('change', (e) => {
                const selectedSupplierId = e.target.value;
                if (selectedSupplierId) {
                    this.previewPOItems(selectedSupplierId, itemsBySupplier[selectedSupplierId]);
                } else {
                    document.getElementById('po-items-preview').style.display = 'none';
                }
            });

            // Si solo hay un proveedor, seleccionarlo automáticamente
            if (suppliersToProcess.length === 1) {
                document.getElementById('po-supplier-select').value = suppliersToProcess[0];
                document.getElementById('po-supplier-select').dispatchEvent(new Event('change'));
            }
        } catch (error) {
            console.error('Error generando orden desde stock bajo:', error);
            Utils.showNotification('Error al generar orden', 'error');
        }
    },

    previewPOItems(supplierId, items) {
        const preview = document.getElementById('po-items-preview');
        const list = document.getElementById('po-items-list');
        if (!preview || !list) return;

        preview.style.display = 'block';
        list.innerHTML = items.map(item => {
            const stockActual = parseFloat(item.stock_actual || 0);
            const stockMinimo = parseFloat(item.stock_minimo || 0);
            const cantidadNecesaria = stockMinimo - stockActual;
            const precio = parseFloat(item.cost || item.purchase_price || 0);

            return `
                <div class="po-item-preview">
                    <div class="po-item-info">
                        <strong>${item.name || item.description}</strong>
                        <div class="po-item-details">
                            <span>Stock actual: ${stockActual}</span>
                            <span>Stock mínimo: ${stockMinimo}</span>
                            <span class="text-danger">Faltan: ${cantidadNecesaria}</span>
                        </div>
                    </div>
                    <div class="po-item-quantity">
                        <label>Cantidad a Ordenar:</label>
                        <input type="number" class="form-input form-input-sm" 
                               data-item-id="${item.id}"
                               value="${Math.max(cantidadNecesaria, stockMinimo)}" 
                               min="${cantidadNecesaria}">
                    </div>
                    <div class="po-item-price">
                        <label>Precio Unitario:</label>
                        <input type="number" class="form-input form-input-sm" 
                               data-item-id="${item.id}"
                               value="${precio}" 
                               step="0.01" min="0">
                    </div>
                </div>
            `;
        }).join('');
    },

    async createPOFromItems() {
        try {
            const supplierId = document.getElementById('po-supplier-select')?.value;
            if (!supplierId) {
                Utils.showNotification('Debes seleccionar un proveedor', 'error');
                return;
            }

            const itemInputs = document.querySelectorAll('.po-item-preview');
            if (itemInputs.length === 0) {
                Utils.showNotification('No hay items seleccionados', 'error');
                return;
            }

            const items = [];
            for (const itemDiv of itemInputs) {
                const itemId = itemDiv.querySelector('[data-item-id]')?.dataset.itemId;
                const quantityInput = itemDiv.querySelector('input[type="number"]:first-of-type');
                const priceInput = itemDiv.querySelector('input[type="number"]:last-of-type');
                
                if (itemId && quantityInput && priceInput) {
                    const item = await DB.get('inventory_items', itemId);
                    if (item) {
                        items.push({
                            inventory_item_id: itemId,
                            sku: item.sku || null,
                            name: item.name || item.description,
                            description: item.description || null,
                            quantity_ordered: parseInt(quantityInput.value) || 0,
                            unit_price: parseFloat(priceInput.value) || 0,
                            status: 'pending'
                        });
                    }
                }
            }

            if (items.length === 0) {
                Utils.showNotification('No se pudieron obtener los items', 'error');
                return;
            }

            // Calcular totales
            const subtotal = items.reduce((sum, item) => {
                return sum + (item.quantity_ordered * item.unit_price);
            }, 0);

            const supplier = await DB.get('suppliers', supplierId) || await API.getSupplier(supplierId);
            const orderNumber = `PO-${supplier.code}-${Date.now().toString().slice(-6)}`;

            const orderData = {
                supplier_id: supplierId,
                order_number: orderNumber,
                order_date: new Date().toISOString().split('T')[0],
                status: 'draft',
                priority: 'normal',
                subtotal: subtotal,
                tax_amount: 0,
                discount_amount: 0,
                shipping_cost: 0,
                total_amount: subtotal,
                currency: 'MXN',
                items: items
            };

            const order = await API.createPurchaseOrder(orderData);
            Utils.showNotification('Orden de compra creada desde stock bajo', 'success');
            UI.closeModal();

            // Abrir la orden para edición
            if (window.SuppliersAdvanced && order) {
                await window.SuppliersAdvanced.showOrderForm(supplierId, order.id);
            }
        } catch (error) {
            console.error('Error creando orden desde items:', error);
            Utils.showNotification('Error al crear orden', 'error');
        }
    },

    /**
     * Comparar precios entre proveedores para un item
     */
    async compareSupplierPrices(itemId) {
        try {
            const item = await DB.get('inventory_items', itemId);
            if (!item) {
                Utils.showNotification('Item no encontrado', 'error');
                return;
            }

            // Obtener historial de precios de todos los proveedores para este item
            const allSuppliers = await API.getSuppliers() || [];
            const priceComparisons = [];

            for (const supplier of allSuppliers) {
                try {
                    const priceHistory = await API.getSupplierPriceHistory(supplier.id, {
                        inventory_item_id: itemId
                    }) || [];

                    if (priceHistory.length > 0) {
                        // Obtener precio más reciente
                        const latestPrice = priceHistory[0];
                        priceComparisons.push({
                            supplier: supplier,
                            price: latestPrice.unit_price,
                            date: latestPrice.price_date,
                            quantity: latestPrice.quantity
                        });
                    }
                } catch (error) {
                    console.warn(`Error obteniendo precios de ${supplier.name}:`, error);
                }
            }

            if (priceComparisons.length === 0) {
                Utils.showNotification('No hay historial de precios para este item', 'info');
                return;
            }

            // Ordenar por precio
            priceComparisons.sort((a, b) => a.price - b.price);

            const body = `
                <div class="price-comparison-view">
                    <h4>Comparación de Precios: ${item.name}</h4>
                    <div class="comparison-table-wrapper">
                        <table class="comparison-table">
                            <thead>
                                <tr>
                                    <th>Proveedor</th>
                                    <th>Precio Unitario</th>
                                    <th>Última Compra</th>
                                    <th>Cantidad</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${priceComparisons.map((comp, index) => `
                                    <tr class="${index === 0 ? 'best-price' : ''}">
                                        <td>
                                            <strong>${comp.supplier.name}</strong>
                                            ${index === 0 ? '<span class="badge badge-success">Mejor Precio</span>' : ''}
                                        </td>
                                        <td><strong>${Utils.formatCurrency(comp.price)}</strong></td>
                                        <td>${Utils.formatDate(comp.date)}</td>
                                        <td>${comp.quantity}</td>
                                        <td>
                                            <button class="btn-primary btn-sm" onclick="window.SuppliersIntegration.createPOFromComparison('${comp.supplier.id}', '${itemId}', ${comp.price})">
                                                <i class="fas fa-shopping-cart"></i> Crear PO
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;

            UI.showModal(
                `Comparación de Precios: ${item.name}`,
                body,
                [
                    { text: 'Cerrar', class: 'btn-secondary', onclick: () => UI.closeModal() }
                ]
            );
        } catch (error) {
            console.error('Error comparando precios:', error);
            Utils.showNotification('Error al comparar precios', 'error');
        }
    },

    async createPOFromComparison(supplierId, itemId, price) {
        const item = await DB.get('inventory_items', itemId);
        if (!item) {
            Utils.showNotification('Item no encontrado', 'error');
            return;
        }

        const quantity = prompt('Ingresa la cantidad a ordenar:', item.stock_minimo || 1);
        if (!quantity || isNaN(quantity) || quantity <= 0) return;

        try {
            const supplier = await DB.get('suppliers', supplierId) || await API.getSupplier(supplierId);
            const orderNumber = `PO-${supplier.code}-${Date.now().toString().slice(-6)}`;

            const orderData = {
                supplier_id: supplierId,
                order_number: orderNumber,
                order_date: new Date().toISOString().split('T')[0],
                status: 'draft',
                priority: 'normal',
                items: [{
                    inventory_item_id: itemId,
                    sku: item.sku || null,
                    name: item.name || item.description,
                    description: item.description || null,
                    quantity_ordered: parseInt(quantity),
                    unit_price: price,
                    status: 'pending'
                }],
                subtotal: price * parseInt(quantity),
                tax_amount: 0,
                discount_amount: 0,
                shipping_cost: 0,
                total_amount: price * parseInt(quantity),
                currency: 'MXN'
            };

            const order = await API.createPurchaseOrder(orderData);
            Utils.showNotification('Orden de compra creada', 'success');
            UI.closeModal();

            // Abrir la orden para edición
            if (window.SuppliersAdvanced && order) {
                await window.SuppliersAdvanced.showOrderForm(supplierId, order.id);
            }
        } catch (error) {
            console.error('Error creando orden:', error);
            Utils.showNotification('Error al crear orden', 'error');
        }
    },

    // ========== INTEGRACIÓN CON COSTOS AVANZADA ==========

    /**
     * Obtener análisis de costos por proveedor
     */
    async getCostAnalysisBySupplier(supplierId, startDate = null, endDate = null) {
        try {
            const costs = await API.getSupplierCosts(supplierId, {
                start_date: startDate,
                end_date: endDate
            }) || [];

            const analysis = {
                total_costs: costs.length,
                total_amount: costs.reduce((sum, cost) => sum + parseFloat(cost.amount || 0), 0),
                by_category: {},
                by_type: {},
                monthly_breakdown: {}
            };

            costs.forEach(cost => {
                // Por categoría
                const category = cost.category || 'otros';
                if (!analysis.by_category[category]) {
                    analysis.by_category[category] = { count: 0, amount: 0 };
                }
                analysis.by_category[category].count++;
                analysis.by_category[category].amount += parseFloat(cost.amount || 0);

                // Por tipo
                const type = cost.type || 'variable';
                if (!analysis.by_type[type]) {
                    analysis.by_type[type] = { count: 0, amount: 0 };
                }
                analysis.by_type[type].count++;
                analysis.by_type[type].amount += parseFloat(cost.amount || 0);

                // Por mes
                if (cost.date) {
                    const month = cost.date.substring(0, 7); // YYYY-MM
                    if (!analysis.monthly_breakdown[month]) {
                        analysis.monthly_breakdown[month] = { count: 0, amount: 0 };
                    }
                    analysis.monthly_breakdown[month].count++;
                    analysis.monthly_breakdown[month].amount += parseFloat(cost.amount || 0);
                }
            });

            return analysis;
        } catch (error) {
            console.error('Error obteniendo análisis de costos:', error);
            throw error;
        }
    },

    // ========== INTEGRACIÓN CON REPORTES ==========

    /**
     * Generar reporte de compras por proveedor
     */
    async generateSupplierPurchasesReport(supplierId, startDate, endDate) {
        try {
            const supplier = await DB.get('suppliers', supplierId) || await API.getSupplier(supplierId);
            if (!supplier) {
                throw new Error('Proveedor no encontrado');
            }

            const orders = await API.getPurchaseOrders({
                supplier_id: supplierId,
                start_date: startDate,
                end_date: endDate
            }) || [];

            const payments = await API.getSupplierPayments({
                supplier_id: supplierId,
                start_date: startDate,
                end_date: endDate
            }) || [];

            const report = {
                supplier: supplier,
                period: {
                    start: startDate,
                    end: endDate
                },
                orders: {
                    total: orders.length,
                    completed: orders.filter(o => o.status === 'completed').length,
                    total_amount: orders.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0),
                    details: orders
                },
                payments: {
                    total: payments.length,
                    paid: payments.filter(p => p.status === 'paid').length,
                    pending: payments.filter(p => p.status === 'pending' || p.status === 'partial').length,
                    total_invoiced: payments.reduce((sum, p) => sum + parseFloat(p.total_amount || 0), 0),
                    total_paid: payments.reduce((sum, p) => sum + parseFloat(p.paid_amount || 0), 0),
                    total_pending: payments.reduce((sum, p) => {
                        return sum + (parseFloat(p.total_amount || 0) - parseFloat(p.paid_amount || 0));
                    }, 0),
                    details: payments
                }
            };

            return report;
        } catch (error) {
            console.error('Error generando reporte:', error);
            throw error;
        }
    },

    /**
     * Exportar reporte a CSV
     */
    exportReportToCSV(report, filename = 'reporte-proveedor') {
        try {
            let csv = 'Reporte de Proveedor\n';
            csv += `Proveedor: ${report.supplier.name}\n`;
            csv += `Período: ${report.period.start} a ${report.period.end}\n\n`;

            // Órdenes
            csv += 'ÓRDENES DE COMPRA\n';
            csv += 'Número,Fecha,Estado,Total\n';
            report.orders.details.forEach(order => {
                csv += `${order.order_number},${order.order_date},${order.status},${order.total_amount}\n`;
            });
            csv += `\nTotal: ${report.orders.total_amount}\n\n`;

            // Pagos
            csv += 'PAGOS/FACTURAS\n';
            csv += 'Referencia,Fecha Emisión,Fecha Vencimiento,Total,Pagado,Pendiente,Estado\n';
            report.payments.details.forEach(payment => {
                const pending = parseFloat(payment.total_amount) - parseFloat(payment.paid_amount || 0);
                csv += `${payment.reference_number},${payment.issue_date},${payment.due_date},${payment.total_amount},${payment.paid_amount || 0},${pending},${payment.status}\n`;
            });
            csv += `\nTotal Facturado: ${report.payments.total_invoiced}\n`;
            csv += `Total Pagado: ${report.payments.total_paid}\n`;
            csv += `Total Pendiente: ${report.payments.total_pending}\n`;

            // Descargar
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `${filename}-${Date.now()}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            Utils.showNotification('Reporte exportado', 'success');
        } catch (error) {
            console.error('Error exportando reporte:', error);
            Utils.showNotification('Error al exportar reporte', 'error');
        }
    },

    /**
     * Generar reporte ejecutivo completo
     */
    async generateExecutiveReport(supplierId, startDate, endDate) {
        try {
            const supplier = await DB.get('suppliers', supplierId) || await API.getSupplier(supplierId);
            if (!supplier) {
                throw new Error('Proveedor no encontrado');
            }

            const purchasesReport = await this.generateSupplierPurchasesReport(supplierId, startDate, endDate);
            const costAnalysis = await this.getCostAnalysisBySupplier(supplierId, startDate, endDate);
            const stats = await API.getSupplierStatsAdvanced(supplierId, { start_date: startDate, end_date: endDate }) || {};
            const priceHistory = await API.getSupplierPriceHistory(supplierId, { start_date: startDate, end_date: endDate }) || [];

            const report = {
                supplier: supplier,
                period: { start: startDate, end: endDate },
                generated_at: new Date().toISOString(),
                summary: {
                    total_orders: purchasesReport.orders.total,
                    total_spent: purchasesReport.orders.total_amount,
                    total_invoiced: purchasesReport.payments.total_invoiced,
                    total_paid: purchasesReport.payments.total_paid,
                    total_pending: purchasesReport.payments.total_pending,
                    avg_rating: stats.ratings?.avg_rating || 0,
                    total_costs: costAnalysis.total_amount
                },
                orders: purchasesReport.orders,
                payments: purchasesReport.payments,
                costs: costAnalysis,
                ratings: stats.ratings,
                price_history: priceHistory,
                recommendations: []
            };

            // Agregar recomendaciones
            if (stats.ratings && stats.ratings.avg_rating < 3) {
                report.recommendations.push({
                    type: 'rating',
                    priority: 'high',
                    message: 'Calificación promedio baja. Considera revisar la relación con este proveedor.'
                });
            }

            if (purchasesReport.payments.total_pending > purchasesReport.payments.total_invoiced * 0.3) {
                report.recommendations.push({
                    type: 'payments',
                    priority: 'medium',
                    message: 'Más del 30% de las facturas están pendientes. Revisa los términos de pago.'
                });
            }

            if (priceHistory.length > 0) {
                const recentPrices = priceHistory.slice(0, 3).map(ph => ph.unit_price || 0);
                const olderPrices = priceHistory.slice(3, 6).map(ph => ph.unit_price || 0);
                if (olderPrices.length > 0) {
                    const recentAvg = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
                    const olderAvg = olderPrices.reduce((a, b) => a + b, 0) / olderPrices.length;
                    if (recentAvg > olderAvg * 1.1) {
                        report.recommendations.push({
                            type: 'prices',
                            priority: 'medium',
                            message: 'Los precios han aumentado más del 10%. Considera negociar mejores términos.'
                        });
                    }
                }
            }

            return report;
        } catch (error) {
            console.error('Error generando reporte ejecutivo:', error);
            throw error;
        }
    },

    /**
     * Exportar reporte ejecutivo a formato legible
     */
    async exportExecutiveReport(supplierId, startDate, endDate, format = 'html') {
        try {
            const report = await this.generateExecutiveReport(supplierId, startDate, endDate);

            if (format === 'html') {
                this.exportReportAsHTML(report);
            } else if (format === 'csv') {
                this.exportReportToCSV(report, 'reporte-ejecutivo-proveedor');
            } else if (format === 'json') {
                this.exportReportAsJSON(report);
            }
        } catch (error) {
            console.error('Error exportando reporte ejecutivo:', error);
            Utils.showNotification('Error al exportar reporte', 'error');
        }
    },

    exportReportAsHTML(report) {
        const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Reporte Ejecutivo - ${report.supplier.name}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #333; }
        h2 { color: #666; border-bottom: 2px solid #ddd; padding-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f5f5f5; }
        .summary { background: #f9f9f9; padding: 20px; border-radius: 5px; margin: 20px 0; }
        .recommendation { padding: 10px; margin: 10px 0; border-left: 4px solid #007bff; background: #f0f8ff; }
        .recommendation.high { border-color: #dc3545; background: #fff0f0; }
        .recommendation.medium { border-color: #ffc107; background: #fffbf0; }
    </style>
</head>
<body>
    <h1>Reporte Ejecutivo: ${report.supplier.name}</h1>
    <p><strong>Período:</strong> ${report.period.start} a ${report.period.end}</p>
    <p><strong>Generado:</strong> ${new Date(report.generated_at).toLocaleString()}</p>

    <div class="summary">
        <h2>Resumen Ejecutivo</h2>
        <table>
            <tr><th>Métrica</th><th>Valor</th></tr>
            <tr><td>Total de Órdenes</td><td>${report.summary.total_orders}</td></tr>
            <tr><td>Total Gastado</td><td>${Utils.formatCurrency(report.summary.total_spent)}</td></tr>
            <tr><td>Total Facturado</td><td>${Utils.formatCurrency(report.summary.total_invoiced)}</td></tr>
            <tr><td>Total Pagado</td><td>${Utils.formatCurrency(report.summary.total_paid)}</td></tr>
            <tr><td>Total Pendiente</td><td>${Utils.formatCurrency(report.summary.total_pending)}</td></tr>
            <tr><td>Calificación Promedio</td><td>${report.summary.avg_rating.toFixed(1)} / 5.0</td></tr>
        </table>
    </div>

    ${report.recommendations.length > 0 ? `
        <h2>Recomendaciones</h2>
        ${report.recommendations.map(rec => `
            <div class="recommendation ${rec.priority}">
                <strong>${rec.type.toUpperCase()}:</strong> ${rec.message}
            </div>
        `).join('')}
    ` : ''}

    <h2>Órdenes de Compra</h2>
    <table>
        <tr>
            <th>Número</th>
            <th>Fecha</th>
            <th>Estado</th>
            <th>Total</th>
        </tr>
        ${report.orders.details.map(order => `
            <tr>
                <td>${order.order_number}</td>
                <td>${order.order_date}</td>
                <td>${order.status}</td>
                <td>${Utils.formatCurrency(order.total_amount)}</td>
            </tr>
        `).join('')}
    </table>

    <h2>Pagos y Facturas</h2>
    <table>
        <tr>
            <th>Referencia</th>
            <th>Fecha Emisión</th>
            <th>Fecha Vencimiento</th>
            <th>Total</th>
            <th>Pagado</th>
            <th>Pendiente</th>
            <th>Estado</th>
        </tr>
        ${report.payments.details.map(payment => {
            const pending = parseFloat(payment.total_amount) - parseFloat(payment.paid_amount || 0);
            return `
                <tr>
                    <td>${payment.reference_number}</td>
                    <td>${payment.issue_date}</td>
                    <td>${payment.due_date}</td>
                    <td>${Utils.formatCurrency(payment.total_amount)}</td>
                    <td>${Utils.formatCurrency(payment.paid_amount || 0)}</td>
                    <td>${Utils.formatCurrency(pending)}</td>
                    <td>${payment.status}</td>
                </tr>
            `;
        }).join('')}
    </table>
</body>
</html>
        `;

        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `reporte-ejecutivo-${report.supplier.name}-${Date.now()}.html`;
        link.click();
        URL.revokeObjectURL(url);

        Utils.showNotification('Reporte HTML exportado', 'success');
    },

    exportReportAsJSON(report) {
        const json = JSON.stringify(report, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `reporte-ejecutivo-${report.supplier.name}-${Date.now()}.json`;
        link.click();
        URL.revokeObjectURL(url);

        Utils.showNotification('Reporte JSON exportado', 'success');
    }
};
