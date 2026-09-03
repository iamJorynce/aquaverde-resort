-- Tags each booking_addons line with a category so reports/remittance can
-- break out revenue by type (e.g. cottage add-ons for an already-checked-in
-- room guest) instead of everything being lumped into "room" at checkout.
-- Nullable + no backfill: existing rows (equipment, damage charges, POS
-- charge-to-room items, etc.) simply have category = null and keep behaving
-- exactly as before. Only new call sites that want a breakdown line set it.
alter table booking_addons
  add column if not exists category text;

comment on column booking_addons.category is
  'Optional reporting tag, e.g. cottage_addon. Null = uncategorized (equipment, damage charges, POS items charged to room, etc.) and is folded into the room total at checkout like before.';
