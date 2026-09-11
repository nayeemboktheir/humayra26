-- Audit §1.6 — every payment callback does a SELECT and an UPDATE keyed on
-- orders.payment_invoice (paystation-verify-payment), and no index covered that column
-- in any migration, including the unapplied hot_path_indexes batch. Both statements were
-- sequential scans on the orders table on every single payment.
CREATE INDEX IF NOT EXISTS idx_orders_payment_invoice
  ON public.orders (payment_invoice);
