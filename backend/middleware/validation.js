// Middleware de validación mejorado
import { body, validationResult } from 'express-validator';

export const validateInventoryItem = [
  body('sku').notEmpty().withMessage('SKU es requerido'),
  body('name').notEmpty().withMessage('Nombre es requerido'),
  body('price').isFloat({ min: 0 }).withMessage('Precio debe ser mayor o igual a 0'),
  body('stock_actual').optional().isInt({ min: 0 }).withMessage('Stock debe ser un número entero positivo'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
];

export const validateSale = [
  body('items').isArray({ min: 1 }).withMessage('Debe tener al menos un item'),
  body('items.*.item_id').notEmpty().withMessage('Item ID es requerido'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Cantidad debe ser mayor a 0'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
];

export const validateCustomer = [
  body('name').notEmpty().withMessage('Nombre es requerido'),
  body('email').optional().isEmail().withMessage('Email inválido'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
];
