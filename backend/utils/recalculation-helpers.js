export const roundCurrency = (value) => Math.round((Number(value) || 0) * 100) / 100;

export const calculateSaleItemSubtotal = (item) => {
  const quantity = Number(item?.quantity) || 0;
  const unitPrice = Number(item?.unit_price) || 0;
  const discountPercent = Number(item?.discount_percent) || 0;
  const baseSubtotal = quantity * unitPrice;
  return roundCurrency(baseSubtotal * (1 - (discountPercent / 100)));
};

export const recalculatePurchaseOrderTotals = async (client, orderId) => {
  const orderResult = await client.query(
    `SELECT id, tax_amount, discount_amount, shipping_cost
     FROM purchase_orders
     WHERE id = $1
     FOR UPDATE`,
    [orderId]
  );

  if (orderResult.rows.length === 0) {
    throw new Error('ORDER_NOT_FOUND');
  }

  const order = orderResult.rows[0];
  const itemsResult = await client.query(
    `SELECT COALESCE(SUM((quantity_ordered * unit_price) - COALESCE(discount_amount, 0)), 0) AS subtotal
     FROM purchase_order_items
     WHERE purchase_order_id = $1`,
    [orderId]
  );

  const subtotal = parseFloat(itemsResult.rows[0]?.subtotal || 0);
  const total = subtotal
    + parseFloat(order.tax_amount || 0)
    - parseFloat(order.discount_amount || 0)
    + parseFloat(order.shipping_cost || 0);

  await client.query(
    'UPDATE purchase_orders SET subtotal = $1, total_amount = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
    [subtotal, total, orderId]
  );

  return { subtotal, total, order };
};
