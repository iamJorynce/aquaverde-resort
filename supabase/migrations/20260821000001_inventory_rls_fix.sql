-- =============================================================================
-- Fixes inventory-related RLS policies so they match the app's own role rules
-- (app/dashboard/permissions.ts):
--
--   MODULE_ACCESS.inventory        -> super_admin, resort_owner, front_desk, cashier
--     (can OPEN the Inventory page and VIEW items/categories)
--
--   ACTION_PERMISSIONS.canManageInventoryCatalog -> super_admin, resort_owner
--     (only admins can create/edit/delete items and categories)
--
--   Manual stock in/out (app/api/inventory POST)  -> super_admin, resort_owner, front_desk
--   POS auto-deduct on sale (app/api/pos, POSPage) -> super_admin, resort_owner,
--     front_desk, cashier, restaurant (whoever is allowed to process a POS sale)
--
-- Without this, the UI can let a cashier open Inventory / process a POS sale,
-- but Supabase silently returns zero rows (SELECT) or rejects the insert
-- (INSERT) if the underlying RLS policy doesn't include their role — which is
-- what caused "walay makita nga inventory kay cashier".
-- =============================================================================

-- ---------------------------------------------------------------------------
-- inventory_categories
-- ---------------------------------------------------------------------------
alter table inventory_categories enable row level security;

drop policy if exists "inventory_categories_select" on inventory_categories;
create policy "inventory_categories_select"
  on inventory_categories for select
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super_admin', 'resort_owner', 'front_desk', 'cashier')
    )
  );

drop policy if exists "inventory_categories_write" on inventory_categories;
create policy "inventory_categories_write"
  on inventory_categories for all
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

-- ---------------------------------------------------------------------------
-- inventory_items
-- ---------------------------------------------------------------------------
alter table inventory_items enable row level security;

drop policy if exists "inventory_items_select" on inventory_items;
create policy "inventory_items_select"
  on inventory_items for select
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super_admin', 'resort_owner', 'front_desk', 'cashier')
    )
  );

-- Only admins can create items, edit item details, or deactivate/remove them.
drop policy if exists "inventory_items_write" on inventory_items;
create policy "inventory_items_write"
  on inventory_items for insert
  to authenticated
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super_admin', 'resort_owner')
    )
  );

drop policy if exists "inventory_items_update" on inventory_items;
create policy "inventory_items_update"
  on inventory_items for update
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

drop policy if exists "inventory_items_delete" on inventory_items;
create policy "inventory_items_delete"
  on inventory_items for delete
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super_admin', 'resort_owner')
    )
  );

-- ---------------------------------------------------------------------------
-- inventory_movements
-- Manual Stock In/Out (InventoryPage UI, admin-gated) -> super_admin, resort_owner
-- POS sale auto-deduct (app/api/pos, POSPage)         -> super_admin, resort_owner,
--   front_desk, cashier, restaurant
--
-- RLS can only key off role, not which UI flow triggered the insert, so the
-- policy below allows the union of both (front_desk is included because it's
-- one of the roles allowed to process a POS sale, not because it can use the
-- manual Stock In/Out buttons — those are now gated to admins only in the UI
-- and in the POST /api/inventory route).
-- ---------------------------------------------------------------------------
alter table inventory_movements enable row level security;

drop policy if exists "inventory_movements_select" on inventory_movements;
create policy "inventory_movements_select"
  on inventory_movements for select
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super_admin', 'resort_owner', 'front_desk', 'cashier')
    )
  );

drop policy if exists "inventory_movements_insert" on inventory_movements;
create policy "inventory_movements_insert"
  on inventory_movements for insert
  to authenticated
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super_admin', 'resort_owner', 'front_desk', 'cashier', 'restaurant')
    )
  );

-- ---------------------------------------------------------------------------
-- suppliers — joined into inventory_items(*, suppliers(name)); same viewers
-- as inventory_items so the join doesn't silently come back null for cashier.
-- ---------------------------------------------------------------------------
alter table suppliers enable row level security;

drop policy if exists "suppliers_select" on suppliers;
create policy "suppliers_select"
  on suppliers for select
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('super_admin', 'resort_owner', 'front_desk', 'cashier')
    )
  );

drop policy if exists "suppliers_write" on suppliers;
create policy "suppliers_write"
  on suppliers for all
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
