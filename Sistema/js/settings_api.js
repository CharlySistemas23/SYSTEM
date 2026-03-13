// Settings API - Configuración inicial del servidor

const SettingsAPI = {
    async showServerConfig() {
        const currentURL = (await DB.get('settings', 'api_url'))?.value || '';
        
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h3>Configuración del Servidor</h3>
                    <button class="modal-close" onclick="this.closest('.modal').remove()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>URL del Servidor (Railway)</label>
                        <input type="text" id="server-url-input" class="form-input" 
                               placeholder="https://tu-app.railway.app" 
                               value="${currentURL}">
                        <small style="color: var(--color-text-secondary); margin-top: 4px; display: block;">
                            Ingresa la URL de tu servidor en Railway
                        </small>
                    </div>
                    
                    <div id="server-status" style="margin-top: var(--spacing-md); padding: var(--spacing-sm); 
                         border-radius: var(--radius-md); display: none;">
                    </div>
                    
                    <div style="display: flex; gap: var(--spacing-sm); margin-top: var(--spacing-md);">
                        <button class="btn-primary" id="test-connection-btn">
                            <i class="fas fa-plug"></i> Probar Conexión
                        </button>
                        <button class="btn-secondary" id="save-server-config-btn">
                            <i class="fas fa-save"></i> Guardar
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Event listeners
        document.getElementById('test-connection-btn').addEventListener('click', async () => {
            await this.testConnection();
        });
        
        document.getElementById('save-server-config-btn').addEventListener('click', async () => {
            await this.saveConfig();
        });
        
        // Cerrar al hacer clic fuera
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    },

    async testConnection() {
        const urlInput = document.getElementById('server-url-input');
        const url = urlInput.value.trim();
        const statusDiv = document.getElementById('server-status');
        
        if (!url) {
            statusDiv.innerHTML = '<span style="color: var(--color-danger);">⚠️ Ingresa una URL</span>';
            statusDiv.style.display = 'block';
            return;
        }
        
        statusDiv.innerHTML = '<span>🔄 Probando conexión...</span>';
        statusDiv.style.display = 'block';
        statusDiv.style.background = 'var(--color-bg-secondary)';
        
        try {
            // Limpiar URL: eliminar barras finales y asegurar formato correcto
            const cleanUrl = url.replace(/\/+$/, ''); // Eliminar todas las barras finales
            const healthUrl = `${cleanUrl}/health`;
            
            console.log(`🔄 Probando conexión a: ${healthUrl}`);
            
            const response = await fetch(healthUrl, {
                method: 'GET',
                timeout: 5000
            });
            
            if (response.ok) {
                const data = await response.json();
                statusDiv.innerHTML = `
                    <span style="color: var(--color-success);">
                        ✅ Conexión exitosa<br>
                        <small>Servidor: ${data.status || 'OK'}</small>
                    </span>
                `;
                statusDiv.style.background = 'rgba(34, 197, 94, 0.1)';
            } else {
                throw new Error('Servidor no responde correctamente');
            }
        } catch (error) {
            statusDiv.innerHTML = `
                <span style="color: var(--color-danger);">
                    ❌ Error de conexión<br>
                    <small>${error.message}</small>
                </span>
            `;
            statusDiv.style.background = 'rgba(239, 68, 68, 0.1)';
        }
    },

    async saveConfig() {
        const urlInput = document.getElementById('server-url-input');
        const url = urlInput.value.trim();
        
        if (!url) {
            Utils.showNotification('Ingresa una URL válida', 'error');
            return;
        }
        
        // Validar formato de URL
        try {
            new URL(url);
        } catch (error) {
            Utils.showNotification('URL inválida', 'error');
            return;
        }
        
        try {
            // Guardar en settings
            await DB.put('settings', {
                key: 'api_url',
                value: url
            });
            
            // Configurar API
            if (typeof API !== 'undefined') {
                await API.setBaseURL(url);
            }
            
            Utils.showNotification('Configuración guardada', 'success');
            
            // Actualizar estado del topbar
            if (typeof window.App !== 'undefined' && window.App.updateTopbarStatus) {
                await window.App.updateTopbarStatus();
            } else if (typeof UI !== 'undefined' && UI.updateSyncStatus) {
                // Fallback: actualizar directamente
                const hasToken = (typeof API !== 'undefined' && API.token) || localStorage.getItem('api_token');
                const isConnected = url && typeof API !== 'undefined' && API.baseURL && hasToken;
                await UI.updateSyncStatus(isConnected, false);
            }
            
            // Cerrar modal
            document.querySelector('.modal').remove();
        } catch (error) {
            console.error('Error guardando configuración:', error);
            Utils.showNotification('Error al guardar configuración', 'error');
        }
    }
};

// Exportar para uso global
window.SettingsAPI = SettingsAPI;
