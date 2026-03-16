export const getLockedInventoryItem = async (client, itemId, branchId = null) => {
  if (!itemId) return null;

  let sql = 'SELECT * FROM inventory_items WHERE id = $1';
  const params = [itemId];

  if (branchId) {
    sql += ' AND branch_id = $2';
    params.push(branchId);
  }

  sql += ' FOR UPDATE';

  const result = await client.query(sql, params);
  return result.rows[0] || null;
};
