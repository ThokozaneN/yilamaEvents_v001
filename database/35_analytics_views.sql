/*
  # Yilama Events: Deep Analytics Views v1.0
  
  Dependencies: 03_financial_architecture.sql, 05_ticketing_and_scanning.sql

  ## Architecture:
  - Materialized or standard Views to aggregate data securely without duplication.
  - Exposes conversion rates, funnel data, and revenue breakdowns for the Organizer Dashboard.
*/

-- 1. Organizer Revenue Breakdown
-- Groups financial transactions to show clear cashflow per event
create or replace view v_organizer_revenue_breakdown as
select 
    e.organizer_id,
    o.event_id,
    e.title as event_title,
    sum(case when ft.type = 'credit' and ft.category = 'ticket_sale' then ft.amount else 0 end) as gross_revenue,
    sum(case when ft.type = 'debit' and ft.category = 'platform_fee' then ft.amount else 0 end) as total_fees,
    sum(case when ft.type = 'debit' and ft.category = 'refund' then ft.amount else 0 end) as total_refunds,
    
    -- Net revenue = sales - fees - refunds
    sum(case when ft.type = 'credit' then ft.amount else -ft.amount end) as net_revenue
from financial_transactions ft
join orders o on ft.reference_id = o.id and ft.reference_type = 'order'
join events e on o.event_id = e.id
group by e.organizer_id, o.event_id, e.title;


-- 2. Ticket Sales Velocity & Performance
-- Shows which tiers are performing best, fast.
create or replace view v_ticket_performance as
select 
    tt.event_id,
    tt.id as ticket_type_id,
    tt.name as tier_name,
    tt.price as current_price,
    tt.quantity_limit,
    tt.quantity_sold,
    
    case 
        when tt.quantity_limit > 0 then (tt.quantity_sold::numeric / tt.quantity_limit::numeric) * 100 
        else 0 
    end as sell_through_rate,
    
    -- Aggregating tickets created in last 24 hours to show velocity
    (select count(*) from tickets t where t.ticket_type_id = tt.id and t.created_at >= (now() - interval '24 hours')) as velocity_24h

from ticket_types tt;


-- 3. Validation / Scanning Funnel
-- Shows the drop-off between tickets sold and tickets actually scanned at the door
create or replace view v_event_attendance_funnel as
select 
    e.id as event_id,
    e.organizer_id,
    
    (select count(*) from tickets t where t.event_id = e.id and t.status = 'valid') as tickets_sold_unscanned,
    (select count(*) from tickets t where t.event_id = e.id and t.status = 'used') as tickets_scanned_in,
    
    -- Calculate check-in rate
    case 
        when (select count(*) from tickets t where t.event_id = e.id and t.status in ('valid', 'used')) > 0 
        then 
            (select count(*) from tickets t where t.event_id = e.id and t.status = 'used')::numeric / 
            (select count(*) from tickets t where t.event_id = e.id and t.status in ('valid', 'used'))::numeric
        else 0
    end as check_in_rate

from events e;
