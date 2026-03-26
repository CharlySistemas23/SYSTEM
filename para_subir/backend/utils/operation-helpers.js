export const safeRollback = async (client, scope = 'operation') => {
  try {
    await client.query('ROLLBACK');
  } catch (rollbackError) {
    console.warn(`No se pudo ejecutar ROLLBACK limpio en ${scope}:`, rollbackError.message);
  }
};

export const createOperationLogger = (scope) => (event, details = {}) => {
  console.log(JSON.stringify({
    scope,
    event,
    timestamp: new Date().toISOString(),
    ...details
  }));
};