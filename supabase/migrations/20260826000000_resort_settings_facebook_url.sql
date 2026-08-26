-- Facebook page link shown to guests on the public Contact page. Was
-- previously hardcoded directly in app/(public)/contact/page.tsx as
-- 'facebook.com/aquaverderesort' — meaning updating the resort's actual
-- Facebook page required a code deploy, unlike every other piece of
-- contact info on that page (email, phone, address), which already come
-- from resort_settings.
alter table resort_settings
  add column if not exists facebook_url text;

comment on column resort_settings.facebook_url is 'Displayed as the Facebook link on the public Contact page.';
