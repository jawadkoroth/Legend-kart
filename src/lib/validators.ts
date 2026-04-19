import { z } from 'zod';

export const customerSchema = z.object({
  name: z.string().min(2, 'Name is required').max(100),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit phone number'),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
});

export const addressSchema = z.object({
  line1: z.string().min(5, 'Address is required').max(200),
  line2: z.string().max(200).optional().or(z.literal('')),
  city: z.string().min(2, 'City is required').max(100),
  state: z.string().min(2, 'State is required').max(100),
  pincode: z.string().regex(/^\d{6}$/, 'Enter a valid 6-digit pincode'),
});

export const createOrderSchema = z.object({
  product_id: z.string().uuid(),
  size: z.string().min(1, 'Select a size'),
  quantity: z.number().int().min(1).max(5).default(1),
  customer: customerSchema,
  shipping_address: addressSchema,
  payment_method: z.enum(['cod', 'online']),
  coupon_code: z.string().optional().or(z.literal('')),
});

export const validateCouponSchema = z.object({
  code: z.string().min(1, 'Enter a coupon code'),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type CustomerInput = z.infer<typeof customerSchema>;
export type AddressInput = z.infer<typeof addressSchema>;
