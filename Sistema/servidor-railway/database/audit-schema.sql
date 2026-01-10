-- Tabla de Auditoría
-- Registra todas las acciones importantes del sistema

CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255),
    username VARCHAR(100),
    action VARCHAR(100) NOT NULL, -- 'create', 'update', 'delete', 'login', 'logout', etc.
    entity_type VARCHAR(100) NOT NULL, -- 'sale', 'employee', 'inventory_item', etc.
    entity_id VARCHAR(255),
    branch_id VARCHAR(255),
    old_data JSONB,
    new_data JSONB,
    changes JSONB, -- Diferencias entre old_data y new_data
    ip_address VARCHAR(45),
    user_agent TEXT,
    metadata JSONB, -- Información adicional
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (branch_id) REFERENCES catalog_branches(id) ON DELETE SET NULL
);

-- Índices para auditoría
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_id ON audit_logs(entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_branch_id ON audit_logs(branch_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_action ON audit_logs(user_id, action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type_id ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_branch_date ON audit_logs(branch_id, created_at DESC);
