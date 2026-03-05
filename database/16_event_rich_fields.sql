/*
  # Yilama Events: Rich Event Fields Extension
  
  Adds advanced fields for the Phase 2 UI Event Creation Wizard.
*/

ALTER TABLE events 
ADD COLUMN IF NOT EXISTS total_ticket_limit int default 100,
ADD COLUMN IF NOT EXISTS headliners text[] default array[]::text[],
ADD COLUMN IF NOT EXISTS prohibitions text[] default array[]::text[],
ADD COLUMN IF NOT EXISTS parking_info text,
ADD COLUMN IF NOT EXISTS is_cooler_box_allowed boolean default false,
ADD COLUMN IF NOT EXISTS cooler_box_price numeric(10,2) default 0.00,
ADD COLUMN IF NOT EXISTS gross_revenue numeric(10,2) default 0.00;
