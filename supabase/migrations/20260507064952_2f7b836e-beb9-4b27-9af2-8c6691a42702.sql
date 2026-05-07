-- Fix stuck order: HT-MOV2YZFL-DXJ — confirmed paid via bKash trx DE71VVFL1R per PayStation API
UPDATE public.orders
SET payment_status = 'paid',
    payment_trx_id = 'DE71VVFL1R',
    payment_method = 'bKash',
    status = 'pending',
    updated_at = now()
WHERE payment_invoice = 'PS-1778133829089'
  AND payment_status = 'unpaid';