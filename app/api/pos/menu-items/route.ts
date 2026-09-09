import { NextRequest } from 'next/server'
import { getSupabaseAndUser, ok, err, unauthorized, forbidden, requireRole } from '@/lib/api-helpers'

/**
 * GET /api/pos/menu-items
 *
 * Returns only menu items that are linked to inventory AND currently in stock.
 * Items with no inventory link (old/unlinked items) are never returned.
 *
 * Strategy:
 *   1. Fetch IDs of items that have a direct_inventory_item_id with stock > 0.
 *   2. Fetch IDs of items that have recipe ingredients where every ingredient
 *      has enough stock for at least 1 serving.
 *   3. Return the union of those two sets — everything else is excluded.
 */
export async function GET(request: NextRequest) {
  const { supabase, profile } = await getSupabaseAndUser()
  if (!profile) return unauthorized()
  if (!requireRole(profile.role, ['super_admin', 'resort_owner', 'front_desk', 'cashier', 'restaurant']))
    return forbidden()

  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category') ?? undefined
  const search   = searchParams.get('search') ?? undefined

  const db = supabase as any

  // ── Step 1: menu items linked via direct_inventory_item_id ──────────────
  // Fetch all menu items that have a direct stock link, along with that
  // inventory item's current stock.
  const { data: directLinked, error: e1 } = await db
    .from('menu_items')
    .select('id, name, description, price, category_id, image_url, direct_inventory_item_id, menu_categories(id, name), inventory_items(id, current_stock, unit)')
    .eq('is_available', true)
    .not('direct_inventory_item_id', 'is', null)

  if (e1) return err(e1.message)

  // ── Step 2: menu items linked via recipe ingredients ────────────────────
  // Fetch all ingredient rows with their inventory stock.
  const { data: ingredientRows, error: e2 } = await db
    .from('menu_item_ingredients')
    .select('menu_item_id, quantity_per_unit, inventory_items(id, current_stock, unit)')

  if (e2) return err(e2.message)

  // ── Step 3: fetch full menu item data for recipe-linked items ───────────
  // Collect unique menu_item_ids that appear in ingredients
  const recipeItemIds: string[] = Array.from(
    new Set((ingredientRows ?? []).map((r: any) => r.menu_item_id))
  )

  let recipeLinked: any[] = []
  if (recipeItemIds.length > 0) {
    const { data: recipeItems, error: e3 } = await db
      .from('menu_items')
      .select('id, name, description, price, category_id, image_url, menu_categories(id, name)')
      .eq('is_available', true)
      .in('id', recipeItemIds)

    if (e3) return err(e3.message)
    recipeLinked = recipeItems ?? []
  }

  // ── Step 4: filter direct-linked items by stock > 0 ─────────────────────
  const availableDirect = (directLinked ?? []).filter((item: any) => {
    const stock = item.inventory_items?.current_stock ?? 0
    return stock > 0
  })

  // ── Step 5: filter recipe-linked items — every ingredient must have stock ≥ qty_per_unit
  const ingredientsByItem = (ingredientRows ?? []).reduce((acc: Record<string, any[]>, row: any) => {
    if (!acc[row.menu_item_id]) acc[row.menu_item_id] = []
    acc[row.menu_item_id].push(row)
    return acc
  }, {})

  const availableRecipe = recipeLinked.filter((item: any) => {
    const ings = ingredientsByItem[item.id] ?? []
    if (ings.length === 0) return false  // no ingredients found — treat as unlinked, hide
    return ings.every((ing: any) => {
      const stock    = ing.inventory_items?.current_stock ?? 0
      const perUnit  = ing.quantity_per_unit ?? 1
      return stock >= perUnit
    })
  })

  // ── Step 6: merge, deduplicate (item could have both — direct wins), filter, shape ──
  // Build a map: id → shaped item. Direct-linked items take precedence.
  const resultMap = new Map<string, any>()

  for (const item of availableRecipe) {
    const ings = ingredientsByItem[item.id] ?? []
    const maxQty = ings.reduce((min: number, ing: any) => {
      const stock   = ing.inventory_items?.current_stock ?? 0
      const perUnit = ing.quantity_per_unit ?? 1
      return Math.min(min, Math.floor(stock / perUnit))
    }, Infinity)

    resultMap.set(item.id, {
      id:          item.id,
      name:        item.name,
      description: item.description ?? null,
      price:       item.price,
      category:    item.menu_categories?.name ?? 'Uncategorised',
      category_id: item.category_id,
      image_url:   item.image_url ?? null,
      max_qty:     isFinite(maxQty) ? maxQty : null,
    })
  }

  for (const item of availableDirect) {
    const stock = item.inventory_items?.current_stock ?? 0
    resultMap.set(item.id, {
      id:          item.id,
      name:        item.name,
      description: item.description ?? null,
      price:       item.price,
      category:    item.menu_categories?.name ?? 'Uncategorised',
      category_id: item.category_id,
      image_url:   item.image_url ?? null,
      max_qty:     Math.floor(stock),
    })
  }

  let result = Array.from(resultMap.values())
    .sort((a, b) => a.name.localeCompare(b.name))

  // Apply search filter
  if (search) {
    const q = search.toLowerCase()
    result = result.filter(i => i.name.toLowerCase().includes(q))
  }

  // Apply category filter
  if (category) {
    result = result.filter(i => i.category.toLowerCase() === category.toLowerCase())
  }

  return ok(result)
}
