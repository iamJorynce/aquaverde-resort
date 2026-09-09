-- Fixes a class of bugs where voiding a transaction in Remittance did not
-- cascade to the resources that transaction actually paid for:
--   1. Equipment rentals stayed status='active' and equipment.available_qty
--      was never restored — the unit looked permanently "rented out".
--   2. POS sales had no way back to their order, so the ingredient/stock
--      deducted at sale time was never restored on void.
--
-- Nullable, no backfill — existing rows simply have these as null and are
-- skipped by the void-cascade logic (same "null = untouched" pattern as
-- booking_addons.category above).

alter table transactions
  add column if not exists equipment_rental_id uuid references equipment_rentals(id);

comment on column transactions.equipment_rental_id is
  'Set when txn_type = equipment_rental. Lets voiding the transaction cascade to restore equipment_rentals.status and equipment.available_qty.';

-- transactions.order_id already exists and references orders, but was never
-- populated by the direct-payment POS path — see app/api/pos/route.ts.
comment on column transactions.order_id is
  'Set for txn_type = pos (direct payment, not room-charge). Lets voiding the transaction cascade to reverse the inventory_movements that were deducted at sale time.';
