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

            // Obtener sucursal actual y filtrar reglas
            const currentBranchId = typeof BranchManager !== 'undefined' ? BranchManager.getCurrentBranchId() : null;
            const isAdmin = typeof UserManager !== 'undefined' && (
                UserManager.currentUser?.role === 'admin' || 
                UserManager.currentUser?.permissions?.includes('all')
            );
            const viewAllBranches = isAdmin;
            
            // Obtener reglas activas para esta agencia (filtrado automático)
            const allRules = await DB.getAll('arrival_rate_rules', null, null, { 
                filterByBranch: !viewAllBranches, 
                branchIdField: 'branch_id' 
            }) || [];
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'arrival_rules.js:24',message:'All rules loaded',data:{totalRules:allRules.length,agencyRules:allRules.filter(r=>r.agency_id===agencyId).map(r=>({id:r.id,min:r.min_passengers,max:r.max_passengers,branch:r.branch_id,unit:r.unit_type}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            const activeRules = allRules.filter(rule => {
                if (rule.agency_id !== agencyId) return false;
                
                // Verificar vigencia
                const ruleFrom = rule.active_from || '2000-01-01';
                if (date < ruleFrom) return false;
                if (rule.active_until && date > rule.active_until) return false;

                // Verificar tienda (si es null, aplica a todas)
                if (rule.branch_id && rule.branch_id !== branchId) return false;

                // Verificar tipo de unidad
                // Si la regla tiene unit_type (no es null/vacío), debe coincidir exactamente
                // Si la regla NO tiene unit_type (null/vacío), aplica a todos los tipos de unidad
                if (rule.unit_type) {
                    // La regla es específica para un tipo de unidad
                    // Solo aplica si unitType coincide o si unitType es null/vacío (aplica a todos)
                    if (unitType && unitType !== '' && rule.unit_type !== unitType) return false;
                }
                // Si rule.unit_type es null/vacío, la regla aplica a todos los tipos (no filtrar)

                return true;
            });
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
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/d085ffd8-d37f-46dc-af23-0f9fbbe46595',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'arrival_rules.js:75',message:'No applicable rule found',data:{agencyName,passengers,unitType,branchId,activeRulesCount:activeRules.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                // #endregion
                return { 
                    calculatedFee: 0, 
                    overrideRequired: true, 
                    message: `No hay regla definida para ${agencyName} con ${passengers} PAX${unitType ? ` (${unitType})` : ''} en esta tienda` 
                };
            }

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
            const { date, branch_id, agency_id, unit_type } = arrivalData;
            
            // Buscar si ya existe (buscar por agency_id y branch_id, unit_type puede variar)
            const existing = await DB.query('agency_arrivals', 'date', date);
            const existingArrival = existing.find(a => 
                a.branch_id === branch_id && 
                a.agency_id === agency_id &&
                (a.unit_type || null) === (unit_type || null)
            ) || existing.find(a => 
                a.branch_id === branch_id && 
                a.agency_id === agency_id &&
                (!a.unit_type || a.unit_type === null) &&
                (!unit_type || unit_type === null)
            );

            const arrival = {
                id: existingArrival?.id || Utils.generateId(),
                date: date,
                branch_id: branch_id,
                agency_id: agency_id,
                passengers: arrivalData.passengers || 0,
                units: arrivalData.units || 1,
                unit_type: unit_type || null,
                calculated_fee: arrivalData.calculated_fee || 0,
                override: arrivalData.override || false,
                override_amount: arrivalData.override_amount || null,
                override_reason: arrivalData.override_reason || null,
                arrival_fee: arrivalData.override ? 
                    (arrivalData.override_amount || 0) : 
                    (arrivalData.calculated_fee || 0),
                notes: arrivalData.notes || '',
                created_at: existingArrival?.created_at || new Date().toISOString(),
                updated_at: new Date().toISOString(),
                sync_status: 'pending'
            };

            await DB.put('agency_arrivals', arrival);
            await SyncManager.addToQueue('agency_arrival', arrival.id);

            // Registrar costo de pago de llegadas automáticamente
            if (typeof Costs !== 'undefined' && arrival.arrival_fee > 0) {
                await Costs.registerArrivalPayment(
                    arrival.id,
                    arrival.arrival_fee,
                    arrival.branch_id,
                    arrival.agency_id,
                    arrival.passengers
                );
            }

            return arrival;
        } catch (e) {
            console.error('Error saving arrival:', e);
            throw e;
        }
    }
};

window.ArrivalRules = ArrivalRules;

