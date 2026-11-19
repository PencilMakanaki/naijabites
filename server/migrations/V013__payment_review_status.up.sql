ALTER TABLE orders
  DROP CHECK ck_orders_status,
  ADD CONSTRAINT ck_orders_status
    CHECK (status IN (
      'pending_payment',
      'confirmed',
      'payment_review',
      'processing',
      'ready_for_dispatch',
      'out_for_delivery',
      'delivered',
      'cancelled'
    ));