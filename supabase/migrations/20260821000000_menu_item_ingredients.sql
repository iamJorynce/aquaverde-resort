-- =============================================================================
-- Links menu_items (POS) to inventory_items (Inventory) as an optional "recipe".
-- When set for a menu item, selling it in the POS will:
--   1. Block the sale if any linked inventory item doesn't have enough stock.
--   2. Auto-deduct stock (via inventory_movements) on successful payment.
--
-- Recipe is OPTIONAL per item — a menu item with no rows here behaves exactly
-- as before (no stock check, no auto-deduction).
-- =============================================================================

create table if not exists menu_item_ingredients (
  id                 uuid primary key default gen_random_uuid(),
  menu_item_id       uuid not null references menu_items(id) on delete cascade,
  inventory_item_id  uuid not null references inventory_items(id) on delete cascade,
  quantity_per_unit  numeric not null default 1 check (quantity_per_unit > 0),
  created_at         timestamptz not null default now(),
  unique (menu_item_id, inventory_item_id)
);

create index if not exists idx_menu_item_ingredients_menu_item
  on menu_item_ingredients (menu_item_id);

create index if not exists idx_menu_item_ingredients_inventory_item
  on menu_item_ingredients (inventory_item_id);

alter table menu_item_ingredients enable row level security;

-- Any signed-in staff member can view recipes (needed by the POS to check
-- stock before checkout).
drop policy if exists "menu_item_ingredients_select" on menu_item_ingredients;
create policy "menu_item_ingredients_select"
  on menu_item_ingredients for select
  to authenticated
  using (true);

-- Only admins/owners can create, edit, or delete recipe rows.
drop policy if exists "menu_item_ingredients_write" on menu_item_ingredients;
create policy "menu_item_ingredients_write"
  on menu_item_ingredients for all
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super_admin', 'resort_owner')
    )
  )
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super_admin', 'resort_owner')
    )
  );
