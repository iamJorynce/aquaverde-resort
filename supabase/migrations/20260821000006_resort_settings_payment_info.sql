-- Payment routing details shown to guests when they choose GCash or Bank
-- Transfer at checkout ("Send payment to: ..."). These were previously
-- hardcoded directly in app/dashboard/booking-page.tsx and
-- app/(public)/booking/page.tsx — meaning updating the resort's actual
-- GCash number or bank account required a code deploy, and there was no
-- audit trail (updated_by/updated_at) for who changed payment routing
-- info, unlike every other resort_settings field.
alter table resort_settings
  add column if not exists gcash_number text,
  add column if not exists bank_name text,
  add column if not exists bank_account_number text;

comment on column resort_settings.gcash_number is 'Displayed to guests as "Send payment to" when GCash is selected at checkout.';
comment on column resort_settings.bank_name is 'Displayed to guests as the bank transfer recipient.';
comment on column resort_settings.bank_account_number is 'Displayed to guests as the bank transfer account number.';
