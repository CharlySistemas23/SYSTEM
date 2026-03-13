// Arrival Rules Module - Cálculo de tarifas de llegadas según tabulador

// CONSTANTES COMPARTIDAS - Tipos de unidad válidos (homologados)
const ARRIVAL_UNIT_TYPES = {
    ANY: null,           // null = Cualquiera (aplica a todos los tipos)
    CITY_TOUR: 'city_tour',
    SPRINTER: 'sprinter',
    VAN: 'van',
    TRUCK: 'truck'
};

// Valores válidos de unit_type como array (para validación)
const VALID_UNIT_TYPES = [ARRIVAL_UNIT_TYPES.ANY, ARRIVAL_UNIT_TYPES.CITY_TOUR, ARRIVAL_UNIT_TYPES.SPRINTER, ARRIVAL_UNIT_TYPES.VAN, ARRIVAL_UNIT_TYPES.TRUCK];

// Opciones para dropdowns (formato {value, label})
const ARRIVAL_UNIT_TYPE_OPTIONS = [
    { value: '', label: 'Cualquiera' },
    { value: 'city_tour', label: 'City Tour' },
    { value: 'sprinter', label: 'Sprinter' },
    { value: 'van', label: 'Van' },
    { value: 'truck', label: 'Camiones' }
];

const ArrivalRules = {
    // Exponer constantes para uso en otros módulos
    UNIT_TYPES: ARRIVAL_UNIT_TYPES,
    VALID_UNIT_TYPES: VALID_UNIT_TYPES,
    UNIT_TYPE_OPTIONS: ARRIVAL_UNIT_TYPE_OPTIONS,
    /**
     * Calcula el costo de llegada según las reglas del tabulador
     * @param {string} agencyId - ID de la agencia
     * @param {string} branchId - ID de la tienda
     * @param {number} passengers - Número de pasajeros
     * @param {string|null} unitType - Tipo de unidad (city_tour, sprinter, van, truck, null para cualquiera)
     * @param {string} dateYYYYMMDD - Fecha en formato YYYY-MM-DD
     * @returns {Promise<Object>} { calculatedFee, overrideRequired, message }
     */
    async calculateArrivalFee(agencyId, branchId, passengers, unitType = null, dateYYYYMMDD = null) {
        try {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'arrival_rules.js:13',message:'calculateArrivalFee START',data:{agencyId,branchId,passengers,unitType,dateYYYYMMDD},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            const date = dateYYYYMMDD || Utils.formatDate(new Date(), 'YYYY-MM-DD');
            const agency = await DB.get('catalog_agencies', agencyId);
            if (!agency) {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'arrival_rules.js:18',message:'Agency not found',data:{agencyId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                // #endregion
                return { calculatedFee: 0, overrideRequired: false, message: 'Agencia no encontrada' };
            }

            const agencyName = agency.name.toUpperCase();
            
            console.log('🔍 [ArrivalRules] Calculando tarifa:', {
                agencyId,
                agencyName,
                branchId,
                passengers,
                unitType,
                date
            });

            // Obtener sucursal actual y filtrar reglas
            const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
            const isMasterAdmin = typeof UserManager !== 'undefined' && (
                UserManager.currentUser?.role === 'master_admin' ||
                UserManager.currentUser?.is_master_admin ||
                UserManager.currentUser?.isMasterAdmin ||
                UserManager.currentEmployee?.role === 'master_admin'
            );
            const viewAllBranches = isMasterAdmin;
            
            // Obtener reglas activas para esta agencia
            // IMPORTANTE: No filtrar por branch_id aquí, porque necesitamos incluir reglas globales (branch_id: null)
            // El filtro manual abajo manejará correctamente reglas específicas vs globales
            const allRules = await DB.getAll('arrival_rate_rules') || [];
            console.log(`📋 [ArrivalRules] Total de reglas cargadas: ${allRules.length}`);
            
            // Mostrar todas las reglas con sus agency_id para debug
            if (allRules.length > 0) {
                console.log('📋 [ArrivalRules] Reglas cargadas:', allRules.map(r => ({
                    id: r.id,
                    agency_id: r.agency_id,
                    agency_name: r.agency_name || 'N/A',
                    min: r.min_passengers,
                    max: r.max_passengers,
                    branch: r.branch_id,
                    unit: r.unit_type
                })));
            }
            
            // Función auxiliar para comparar IDs de forma flexible
            const compareIds = (id1, id2) => {
                if (!id1 || !id2) return false;
                const str1 = String(id1).trim().toLowerCase();
                const str2 = String(id2).trim().toLowerCase();
                return str1 === str2;
            };
            
            // Obtener todas las agencias para comparación por nombre si el ID no coincide
            const allAgencies = await DB.getAll('catalog_agencies') || [];
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'arrival_rules.js:24',message:'All rules loaded',data:{totalRules:allRules.length,agencyRules:allRules.filter(r=>compareIds(r.agency_id,agencyId)).map(r=>({id:r.id,min:r.min_passengers,max:r.max_passengers,branch:r.branch_id,unit:r.unit_type}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            const activeRules = allRules.filter(rule => {
                // Comparar agency_id de forma flexible
                let agencyMatches = compareIds(rule.agency_id, agencyId);
                
                // Si no coincide por ID, intentar comparar por nombre de agencia
                if (!agencyMatches) {
                    // Obtener la agencia de la regla
                    const ruleAgency = allAgencies.find(a => compareIds(a.id, rule.agency_id));
                    if (ruleAgency) {
                        const ruleAgencyName = ruleAgency.name.toUpperCase();
                        agencyMatches = ruleAgencyName === agencyName || 
                                      ruleAgencyName.includes(agencyName) || 
                                      agencyName.includes(ruleAgencyName);
                    }
                }
                
                if (!agencyMatches) {
                    return false;
                }
                
                // Verificar vigencia
                const ruleFrom = rule.active_from || '2000-01-01';
                if (date < ruleFrom) {
                    // Solo loguear en modo debug (no es un error, es filtrado normal)
                    // console.log(`   ❌ Regla ${rule.id} rechazada: fecha ${date} < active_from ${ruleFrom}`);
                    return false;
                }
                if (rule.active_until && date > rule.active_until) {
                    // Solo loguear en modo debug (no es un error, es filtrado normal)
                    // console.log(`   ❌ Regla ${rule.id} rechazada: fecha ${date} > active_until ${rule.active_until}`);
                    return false;
                }

                // Verificar tienda (si es null, aplica a todas)
                if (rule.branch_id && !compareIds(rule.branch_id, branchId)) {
                    // Solo loguear en modo debug (no es un error, es filtrado normal)
                    // console.log(`   ❌ Regla ${rule.id} rechazada: branch_id no coincide (regla: ${rule.branch_id}, buscado: ${branchId})`);
                    return false;
                }

                // Verificar tipo de unidad
                // Si la regla tiene unit_type (no es null/vacío), debe coincidir exactamente
                // Si la regla NO tiene unit_type (null/vacío), aplica a todos los tipos de unidad
                if (rule.unit_type) {
                    // La regla es específica para un tipo de unidad
                    // Solo aplica si unitType coincide o si unitType es null/vacío (aplica a todos)
                    if (unitType && unitType !== '' && rule.unit_type !== unitType) {
                        // Solo loguear en modo debug (no es un error, es filtrado normal)
                        // console.log(`   ❌ Regla ${rule.id} rechazada: unit_type no coincide (regla: ${rule.unit_type}, buscado: ${unitType})`);
                        return false;
                    }
                }
                // Si rule.unit_type es null/vacío, la regla aplica a todos los tipos (no filtrar)

                // Solo loguear en modo debug (reduce ruido en consola)
                // console.log(`   ✅ Regla ${rule.id} pasó todos los filtros`);
                return true;
            });
            console.log(`✅ [ArrivalRules] Reglas activas después del filtro: ${activeRules.length}`, activeRules.map(r => ({
                id: r.id,
                min: r.min_passengers,
                max: r.max_passengers,
                branch: r.branch_id,
                unit: r.unit_type,
                fee_type: r.fee_type,
                flat_fee: r.flat_fee,
                rate_per_passenger: r.rate_per_passenger
            })));
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'arrival_rules.js:40',message:'Active rules after filter',data:{count:activeRules.length,rules:activeRules.map(r=>({id:r.id,min:r.min_passengers,max:r.max_passengers,branch:r.branch_id,unit:r.unit_type,fee_type:r.fee_type,flat_fee:r.flat_fee}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion

            // Ordenar por prioridad: más específico primero (branch_id y unit_type no null)
            activeRules.sort((a, b) => {
                const aSpecific = (a.branch_id ? 2 : 0) + (a.unit_type ? 1 : 0);
                const bSpecific = (b.branch_id ? 2 : 0) + (b.unit_type ? 1 : 0);
                if (bSpecific !== aSpecific) return bSpecific - aSpecific;
                
                // Si misma especificidad, ordenar por min_passengers ascendente
                // Esto ayuda a encontrar el rango correcto cuando hay múltiples rangos
                return (a.min_passengers || 0) - (b.min_passengers || 0);
            });

            // Buscar regla que aplique al rango de pasajeros
            // Primero buscar reglas donde el pasajero esté dentro del rango
            let applicableRule = activeRules.find(rule => {
                const minPax = rule.min_passengers || 0;
                const maxPax = rule.max_passengers || 999999;
                return passengers >= minPax && passengers <= maxPax;
            });
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'arrival_rules.js:68',message:'Rule found in range',data:{found:!!applicableRule,rule:applicableRule?{id:applicableRule.id,min:applicableRule.min_passengers,max:applicableRule.max_passengers}:null,passengers},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            
            // Si no hay regla exacta, buscar la regla con el máximo más alto que sea menor que passengers
            // Esto es para casos como TB con 50 pasajeros: debe usar rango 30-45 y calcular extra
            if (!applicableRule) {
                // Filtrar reglas donde el máximo es menor que los pasajeros
                // Ordenar por max_passengers descendente para tomar el rango más alto disponible
                const rulesWithMax = activeRules
                    .filter(rule => {
                        const maxPax = rule.max_passengers;
                        return maxPax && passengers > maxPax;
                    })
                    .sort((a, b) => (b.max_passengers || 0) - (a.max_passengers || 0));
                
                applicableRule = rulesWithMax[0];
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'arrival_rules.js:87',message:'Rule found for extra calculation',data:{found:!!applicableRule,rule:applicableRule?{id:applicableRule.id,min:applicableRule.min_passengers,max:applicableRule.max_passengers}:null,passengers,rulesWithMaxCount:rulesWithMax.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                // #endregion
            }

            if (!applicableRule) {
                console.warn(`⚠️ [ArrivalRules] No se encontró regla aplicable para:`, {
                    agencyName,
                    passengers,
                    unitType,
                    branchId,
                    activeRulesCount: activeRules.length,
                    activeRules: activeRules.map(r => ({
                        min: r.min_passengers,
                        max: r.max_passengers,
                        branch: r.branch_id,
                        unit: r.unit_type
                    }))
                });
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'arrival_rules.js:75',message:'No applicable rule found',data:{agencyName,passengers,unitType,branchId,activeRulesCount:activeRules.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                // #endregion
                return { 
                    calculatedFee: 0, 
                    overrideRequired: true, 
                    message: `No hay regla definida para ${agencyName} con ${passengers} PAX${unitType ? ` (${unitType})` : ''} en esta tienda` 
                };
            }
            
            console.log(`✅ [ArrivalRules] Regla aplicable encontrada:`, {
                ruleId: applicableRule.id,
                min: applicableRule.min_passengers,
                max: applicableRule.max_passengers,
                fee_type: applicableRule.fee_type,
                flat_fee: applicableRule.flat_fee,
                rate_per_passenger: applicableRule.rate_per_passenger
            });

            // Calcular tarifa según el tipo
            let calculatedFee = 0;
            
            if (applicableRule.fee_type === 'flat' || applicableRule.flat_fee) {
                // Tarifa fija
                calculatedFee = applicableRule.flat_fee || 0;
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'arrival_rules.js:86',message:'Flat fee calculation',data:{flat_fee:applicableRule.flat_fee,calculatedFee,passengers,maxPax:applicableRule.max_passengers,extra_per_passenger:applicableRule.extra_per_passenger},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                // #endregion
                
                // Calcular extra por pasajero adicional cuando se excede el máximo del rango
                if (applicableRule.extra_per_passenger && applicableRule.extra_per_passenger > 0) {
                    const maxPax = applicableRule.max_passengers;
                    if (maxPax && passengers > maxPax) {
                        const extraPax = passengers - maxPax;
                        calculatedFee += extraPax * applicableRule.extra_per_passenger;
                        // #region agent log
                        fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'arrival_rules.js:94',message:'Extra passengers calculated',data:{extraPax,extraPerPax:applicableRule.extra_per_passenger,calculatedFee},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                        // #endregion
                    }
                }
            } else {
                // Tarifa por pasajero
                const ratePerPax = applicableRule.rate_per_passenger || 0;
                calculatedFee = passengers * ratePerPax;
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'arrival_rules.js:100',message:'Per passenger calculation',data:{ratePerPax,passengers,calculatedFee},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                // #endregion
                
                // Calcular extra por pasajero adicional si aplica
                if (applicableRule.extra_per_passenger && applicableRule.extra_per_passenger > 0) {
                    const maxPax = applicableRule.max_passengers;
                    if (maxPax && passengers > maxPax) {
                        const extraPax = passengers - maxPax;
                        calculatedFee += extraPax * applicableRule.extra_per_passenger;
                    }
                }
            }

            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'arrival_rules.js:112',message:'Final calculated fee',data:{calculatedFee,agencyName,passengers,rule:applicableRule.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion

            return {
                calculatedFee,
                overrideRequired: false,
                message: null,
                rule: applicableRule
            };
        } catch (e) {
            console.error('Error calculating arrival fee:', e);
            return { 
                calculatedFee: 0, 
                overrideRequired: true, 
                message: `Error al calcular: ${e.message}` 
            };
        }
    },

    /**
     * Guarda o actualiza una llegada (idempotente)
     */
    async saveArrival(arrivalData) {
        try {
            const { date, branch_id, guide_id, agency_id, unit_type, passengers, units } = arrivalData;
            
            // MEJORAR: Buscar llegadas existentes de forma más robusta
            // Buscar TODAS las llegadas del día (no solo por índice de fecha)
            const allArrivals = await DB.getAll('agency_arrivals') || [];
            const now = new Date();
            const localToday = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
            const dateStr = date ? date.split('T')[0] : localToday;
            
            // Declarar existingArrival al inicio para evitar problemas de scope
            let existingArrival = null;
            
            // Buscar llegada existente con criterios más estrictos
            // 1. Misma fecha, sucursal, agencia, guía
            // 2. Mismo unit_type (o ambos null)
            // 3. Preferir la más reciente si hay múltiples
            const matchingArrivals = allArrivals
                .filter(a => {
                    const aDateStr = a.date ? a.date.split('T')[0] : new Date(a.date || a.created_at).toISOString().split('T')[0];
                    if (aDateStr !== dateStr) return false;
                    if (String(a.branch_id) !== String(branch_id)) return false;
                    if (String(a.agency_id) !== String(agency_id)) return false;
                    
                    // Comparar guide_id (ambos null o iguales)
                    const aGuideId = a.guide_id || null;
                    const bGuideId = guide_id || null;
                    if (String(aGuideId) !== String(bGuideId)) return false;
                    
                    // Comparar unit_type (ambos null o iguales)
                    const aUnitType = a.unit_type || null;
                    const bUnitType = unit_type || null;
                    if (aUnitType !== bUnitType) return false;
                    
                    return true;
                })
                .sort((a, b) => {
                    // Ordenar por fecha de actualización (más reciente primero)
                    const aTime = new Date(a.updated_at || a.created_at).getTime();
                    const bTime = new Date(b.updated_at || b.created_at).getTime();
                    return bTime - aTime;
                });
            
            existingArrival = matchingArrivals[0] || null;

            // Si no se encuentra por unit_type exacto, buscar sin unit_type (para compatibilidad)
            if (!existingArrival) {
                const fallbackArrivals = allArrivals
                    .filter(a => {
                        const aDateStr = a.date ? a.date.split('T')[0] : new Date(a.date || a.created_at).toISOString().split('T')[0];
                        if (aDateStr !== dateStr) return false;
                        if (String(a.branch_id) !== String(branch_id)) return false;
                        if (String(a.agency_id) !== String(agency_id)) return false;
                        // Si ambos unit_type son null, considerar iguales
                        return (!a.unit_type || a.unit_type === null) && (!unit_type || unit_type === null);
                    })
                    .sort((a, b) => {
                        const aTime = new Date(a.updated_at || a.created_at).getTime();
                        const bTime = new Date(b.updated_at || b.created_at).getTime();
                        return bTime - aTime;
                    });
                
                existingArrival = fallbackArrivals[0] || null;
            }

            // Calcular arrival_fee (normalizar a número para evitar toFixed/Comparisons con strings)
            const arrivalFeeRaw = arrivalData.override ? 
                (arrivalData.override_amount || 0) : 
                (arrivalData.calculated_fee ?? arrivalData.arrival_fee ?? 0);
            const arrivalFee = parseFloat(arrivalFeeRaw) || 0;

            const arrival = {
                id: existingArrival?.id || Utils.generateId(),
                date: dateStr,
                branch_id: branch_id,
                guide_id: guide_id || null,
                agency_id: agency_id,
                passengers: passengers || arrivalData.passengers || 0,
                units: units || arrivalData.units || 1,
                unit_type: unit_type || null,
                calculated_fee: arrivalData.calculated_fee || 0,
                override: arrivalData.override || false,
                override_amount: arrivalData.override_amount || null,
                override_reason: arrivalData.override_reason || null,
                arrival_fee: arrivalFee,
                notes: arrivalData.notes || '',
                created_at: existingArrival?.created_at || new Date().toISOString(),
                updated_at: new Date().toISOString(),
                sync_status: 'pending'
            };

            // Guardar llegada (actualizar si existe, crear si no)
            await DB.put('agency_arrivals', arrival);
            
            // Solo agregar a cola de sincronización si es nueva
            if (!existingArrival) {
                await SyncManager.addToQueue('agency_arrival', arrival.id);
            } else {
                // Si es actualización, actualizar en cola si existe
                try {
                    const queueItems = await DB.getAll('sync_queue') || [];
                    const queueItem = queueItems.find(q => q.entity_id === arrival.id && q.entity_type === 'agency_arrival');
                    if (queueItem) {
                        queueItem.data = arrival;
                        queueItem.updated_at = new Date().toISOString();
                        await DB.put('sync_queue', queueItem);
                    }
                } catch (e) {
                    console.warn('Error actualizando en cola de sincronización:', e);
                }
            }

            // Registrar o actualizar costo de pago de llegadas automáticamente
            // registerArrivalPayment ya maneja duplicados: si existe, lo actualiza; si no, lo crea
            if (typeof Costs !== 'undefined' && Costs.registerArrivalPayment) {
                if (arrival.arrival_fee > 0) {
                    let agencyName = null;
                    let guideName = null;
                    try {
                        const agencies = await DB.getAll('catalog_agencies') || [];
                        const guides = await DB.getAll('catalog_guides') || [];
                        agencyName = agencies.find(a => String(a.id) === String(arrival.agency_id))?.name || null;
                        guideName = guides.find(g => String(g.id) === String(arrival.guide_id))?.name || null;
                    } catch (_) {}

                    await Costs.registerArrivalPayment(
                        arrival.id,
                        arrival.arrival_fee,
                        arrival.branch_id,
                        arrival.agency_id,
                        arrival.passengers,
                        arrival.date,
                        {
                            agency_name: agencyName,
                            guide_id: arrival.guide_id || null,
                            guide_name: guideName,
                            units: arrival.units || null,
                            unit_type: arrival.unit_type || null,
                            notes: arrival.notes || null
                        }
                    );
                } else if (existingArrival && arrival.arrival_fee === 0) {
                    // Si se actualiza una llegada y el fee ahora es 0, eliminar el costo si existe
                    try {
                        const allCosts = await DB.getAll('cost_entries') || [];
                        const existingCost = allCosts.find(c => 
                            c.category === 'pago_llegadas' && 
                            c.arrival_id === arrival.id
                        );
                        if (existingCost) {
                            await DB.delete('cost_entries', existingCost.id);
                            console.log(`🗑️ Costo de llegada eliminado (fee = 0) para llegada ${arrival.id}`);
                        }
                    } catch (e) {
                        console.warn('Error eliminando costo de llegada:', e);
                    }
                }
            }

            const feeNum = parseFloat(arrival.arrival_fee) || 0;
            console.log(`${existingArrival ? '✅ Llegada actualizada' : '➕ Llegada creada'}: ${arrival.agency_id} - ${arrival.passengers} pasajeros - $${feeNum.toFixed(2)}`);
            return arrival;
        } catch (e) {
            console.error('Error saving arrival:', e);
            throw e;
        }
    }
};

window.ArrivalRules = ArrivalRules;

