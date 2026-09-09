-- Soft-delete for booking_addons, matching the existing transactions.voided
-- pattern instead of hard-deleting rows. Voiding a room/checkout payment
-- (Remittance) now marks the addons it covered as voided instead of
-- removing them, so the audit trail (what was charged, when, and why it
-- was reversed) stays in the table itself rather than only in activity_logs.
--
-- Defaults to false with a backfill (not null), so every existing read
-- site needs `.eq('voided', false)` added to keep excluding these — see
-- app code for the call sites this touches.
alter table booking_addons
  add column if not exists voided boolean not null default false;

alter table booking_addons
  add column if not exists voided_at timestamptz;

alter table booking_addons
  add column if not exists void_reason text;

comment on column booking_addons.voided is
  'True when the payment that covered this extra was later voided (Remittance). Excluded from bills, extras badges, and remittance breakdowns, but kept as a record.';
