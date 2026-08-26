-- default_day_rate/default_overnight_rate on cottage_types_config were
-- meant as a convenience pre-fill when adding a new cottage of a given
-- type, but every cottage's actual price always comes from its own
-- day_rate/overnight_rate column (see app/dashboard/DayUsePage.tsx) — the
-- "default" fields were never used for anything else and just added a
-- second, confusing place that looked like it set a price but didn't.
alter table cottage_types_config
  drop column if exists default_day_rate,
  drop column if exists default_overnight_rate;
