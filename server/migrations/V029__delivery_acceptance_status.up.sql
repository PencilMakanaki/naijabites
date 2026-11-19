ALTER TABLE deliveries DROP CHECK ck_deliveries_status;
ALTER TABLE deliveries ADD CONSTRAINT ck_deliveries_status CHECK(status IN ('pending_assignment','assigned','accepted','picked_up','in_transit','delivered','failed','returned'));
