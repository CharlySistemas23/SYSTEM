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
// Recibe io directamente de req.io (más flexible)
export function emitToBranch(io, branchId, event, data) {
    if (!io) {
        // Si no se pasa io, intentar usar la instancia global
        if (!ioInstance) {
            console.warn('⚠️ Socket.io instance no está disponible para emitir evento');
            return;
        }
        io = ioInstance;
    }
    
    if (branchId) {
        io.to(`branch_${branchId}`).emit(event, data);
    }
    
    // También emitir a admin (sala branch_all)
    io.to('branch_all').emit(event, data);
}

// Emitir evento a todas las sucursales
// Recibe io directamente de req.io (más flexible)
export function emitToAll(io, event, data) {
    if (!io) {
        // Si no se pasa io, intentar usar la instancia global
        if (!ioInstance) {
            console.warn('⚠️ Socket.io instance no está disponible para emitir evento');
            return;
        }
        io = ioInstance;
    }
    io.emit(event, data);
}

