// Manejo centralizado de errores
export const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Agregar headers CORS incluso en caso de error
  const origin = req.headers.origin;
  const raw = (process.env.ALLOWED_ORIGINS || process.env.CORS_ORIGIN || '').split(',').map(o => o.trim()).filter(Boolean);
  const allowAll = raw.length === 0 || raw.includes('*');
  
  if (allowAll || !origin || raw.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-username, x-branch-id');
  }

  // Error de validación
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Error de validación',
      details: err.message
    });
  }

  // Error de base de datos
  if (err.code && err.code.startsWith('23')) {
    return res.status(400).json({
      error: 'Error de integridad de datos',
      details: err.message
    });
  }

  // Error de autenticación
  if (err.status === 401 || err.status === 403) {
    return res.status(err.status).json({
      error: err.message || 'No autorizado'
    });
  }

  // Error genérico
  res.status(err.status || 500).json({
    error: err.message || 'Error interno del servidor',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};
