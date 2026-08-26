-- =============================================================================
-- room_types_config.type: enum -> free text
--
-- room_types_config.type was a fixed 5-value enum (standard | deluxe |
-- superior | suite | family), separate from the already-free-text `name`
-- column. In practice `name` is what's actually shown almost everywhere
-- (dropdowns, receipts) — `type` only surfaces as a minor fallback
-- description and directly on the public homepage — so having a SECOND,
-- more rigid classification field made it impossible to add a genuinely
-- new room category (e.g. "Penthouse") without a migration + code change,
-- even though `name` itself was already fully free-text.
--
-- This converts the column to plain text so any value can be entered from
-- the dashboard going forward. Existing rows keep their current value
-- (e.g. 'standard') unchanged — nothing is renamed or deleted, so this is
-- non-destructive and safe to apply even with existing room_types_config
-- rows and rooms referencing them.
--
-- Verified before writing this: the `room_type` enum type is used ONLY by
-- this one column (room_types_config.type) — no other table/column
-- references it, so converting it here has no effect anywhere else.
-- =============================================================================

alter table room_types_config
  alter column type type text using type::text;

-- Deliberately NOT dropping the now-unused `room_type` enum type here.
-- An unused enum type sitting in the schema is completely harmless, and
-- dropping it adds risk (it would fail loudly if anything outside this
-- project's migrations folder still references it) for zero functional
-- benefit. Safe to clean up manually later if you want to, but not
-- necessary.
