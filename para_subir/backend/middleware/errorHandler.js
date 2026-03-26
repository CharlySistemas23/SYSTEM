// Manejo centralizado de errores
export const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Agregar headers CORS incluso en caso de error
  const origin = req.headers.origin;
  const normalizeOrigin = (rawOrigin) => {
    if (!rawOrigin) return null;
    let cleanOrigin = String(rawOrigin).trim();
    if (!cleanOrigin) return null;
    if (!cleanOrigin.startsWith('http://') && !cleanOrigin.startsWith('https://')) {
      cleanOrigin = `https://${cleanOrigin}`;
    }
    return cleanOrigin.replace(/\/+$/, '');
  };

  const explicitOrigins = (process.env.ALLOWED_ORIGINS || process.env.CORS_ORIGIN || '')
    .split(',')
    .map(o => normalizeOrigin(o))
    .filter(Boolean);

  const autoOrigins = [
    process.env.RAILWAY_PUBLIC_DOMAIN,
    process.env.FRONTEND_URL,
    process.env.PUBLIC_URL,
    process.env.APP_URL,
    process.env.VERCEL_URL
  ].map(value => normalizeOrigin(value)).filter(Boolean);

  const allowedOrigins = Array.from(new Set([...explicitOrigins, ...autoOrigins]));
  const allowAll = allowedOrigins.length === 0 || allowedOrigins.includes('*');
  
  if (allowAll || !origin || allowedOrigins.includes(origin)) {
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
