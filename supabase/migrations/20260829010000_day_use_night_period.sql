-- "Night Use" is the same product as Day Use (same areas/cottages/wristband
-- flow) — the only difference guests actually asked about is the rates.
-- So instead of a parallel set of tables, we just tag each rate row with
-- a period. Existing rows default to 'day' and keep working exactly as
-- before; staff add new rows with period='night' to price the evening
-- session differently.
alter table day_use_rates
  add column if not exists period text not null default 'day';

alter table day_use_rates
  drop constraint if exists day_use_rates_period_check;
alter table day_use_rates
  add constraint day_use_rates_period_check check (period in ('day', 'night'));

-- Tag each entry with which period it was registered under, so reports
-- can split day-use revenue from night-use revenue later if needed.
alter table day_use_entries
  add column if not exists period text not null default 'day';

alter table day_use_entries
  drop constraint if exists day_use_entries_period_check;
alter table day_use_entries
  add constraint day_use_entries_period_check check (period in ('day', 'night'));

comment on column day_use_rates.period is 'day or night — lets the same area (e.g. Pool, Beach) have a different per-guest rate for a night-use session.';
comment on column day_use_entries.period is 'Which rate period (day/night) was used to price this entry.';
