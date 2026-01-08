// Helper para emitir eventos WebSocket desde las rutas
// La instancia de io se inicializa en server.js y se expone aquí

let ioInstance = null;

// Inicializar la instancia de io
export function initSocketIO(io) {
    ioInstance = io;
}

// Obtener la instancia de io
export function getIO() {
    if (!ioInstance) {
        console.warn('⚠️ Socket.io instance no está inicializada');
    }
    return ioInstance;
}

// Emitir evento a una sucursal específica
export function emitToBranch(branchId, event, data) {
    if (!ioInstance) return;
    
    if (branchId) {
        ioInstance.to(`branch_${branchId}`).emit(event, data);
    }
    
    // También emitir a admin (sala branch_all)
    ioInstance.to('branch_all').emit(event, data);
}

// Emitir evento a todas las sucursales
export function emitToAll(event, data) {
    if (!ioInstance) return;
    ioInstance.emit(event, data);
}

