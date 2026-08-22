-- =============================================================================
-- resort_settings: open up SELECT to everyone (anon + authenticated)
--
-- The columns on this table (resort_name, contact, email, address,
-- check_in_time, check_out_time) are the same information already shown
-- on the public marketing site, receipts, and guest emails/SMS — none of
-- it is sensitive. The original policy restricted SELECT to
-- super_admin/resort_owner only, which meant nothing outside the
-- Settings page itself could ever read a saved value (public site, guest
-- receipts printed by front desk/cashier, confirmation emails, etc. all
-- had to hardcode the values instead).
--
-- UPDATE stays restricted to super_admin/resort_owner — only read access
-- is being widened here.
-- =============================================================================

drop policy if exists "resort_settings_select" on resort_settings;
create policy "resort_settings_select"
  on resort_settings for select
  to anon, authenticated
  using (true);
