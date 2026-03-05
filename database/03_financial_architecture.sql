/*
  # Yilama Events: Financial Architecture v1.0
  
  Dependencies: 02_auth_and_profiles.sql

  ## Core Financial Logic:
  - Ledger-based accounting (financial_transactions)
  - Strict numeric types for currency
  - Idempotent payment recording
  - Subscription & Payout management

  ## Tables:
  1. plans & subscriptions (Recurring revenue)
  2. orders & order_items (Commerce)
  3. payments (Gateway record)
  4. financial_transactions (Immutable Ledger)
  5. payouts (Settlements)
  6. refunds (Reversals)
*/

-- 1. Subscription System

-- Plans (Static definition of tiers)
create table if not exists plans (
    id text primary key, -- 'free', 'pro', 'premium'
    name text not null,
    price numeric(10,2) not null check (price >= 0),
    currency text default 'ZAR',
    
    -- Operational Limits
    events_limit int not null default 1,
    tickets_limit int not null default 100,
    scanners_limit int not null default 1,
    commission_rate numeric(4,3) not null default 0.100, -- e.g. 0.10 for 10%
    
    features jsonb default '{}'::jsonb,
    is_active boolean default true,
    created_at timestamptz default now()
);

-- Seed Plans (Idempotent update)
insert into plans (id, name, price, events_limit, tickets_limit, scanners_limit, commission_rate, features) values 
('free', 'Starter', 0.00, 2, 200, 0, 0.100, '{"payout_speed": "standard"}'::jsonb),
('pro', 'Professional', 199.00, 10, 2000, 5, 0.070, '{"payout_speed": "fast", "branding": true}'::jsonb),
('premium', 'Business', 499.00, 999999, 999999, 100, 0.040, '{"payout_speed": "instant", "branding": true, "analytics": "advanced"}'::jsonb)
on conflict (id) do update set
    events_limit = excluded.events_limit,
    tickets_limit = excluded.tickets_limit,
    scanners_limit = excluded.scanners_limit,
    commission_rate = excluded.commission_rate,
    features = excluded.features;

-- Subscriptions
create table if not exists subscriptions (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid references profiles(id) on delete cascade not null,
    plan_id text references plans(id) not null,
    
    status text not null check (status in ('active', 'cancelled', 'past_due', 'pending_verification')),
    
    current_period_start timestamptz not null,
    current_period_end timestamptz not null,
    
    cancel_at_period_end boolean default false,
    
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- 2. Commerce System (Orders)

create table if not exists orders (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid references profiles(id) on delete set null, -- Buyer
    event_id uuid references events(id) on delete restrict not null,
    
    total_amount numeric(10,2) not null check (total_amount >= 0),
    currency text default 'ZAR',
    
    status text not null check (status in ('pending', 'paid', 'failed', 'refunded')),
    metadata jsonb default '{}'::jsonb, -- Promo codes, referral info
    
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create table if not exists order_items (
    id uuid primary key default uuid_generate_v4(),
    order_id uuid references orders(id) on delete cascade not null,
    ticket_id uuid references tickets(id) on delete restrict, -- Specific ticket instance
    
    price_at_purchase numeric(10,2) not null check (price_at_purchase >= 0),
    
    created_at timestamptz default now()
);

-- 3. Payments (Gateway I/O)

create table if not exists payments (
    id uuid primary key default uuid_generate_v4(),
    order_id uuid references orders(id) on delete restrict not null,
    
    provider text not null, -- 'payfast', 'stripe', 'manual'
    provider_tx_id text not null,
    
    amount numeric(10,2) not null check (amount >= 0),
    currency text default 'ZAR',
    
    status text not null check (status in ('pending', 'completed', 'failed', 'refunded')),
    provider_metadata jsonb,
    
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    
    unique(provider, provider_tx_id) -- Idempotency constraint
);

-- 4. Ledger System (Single Source of Truth)

create table if not exists financial_transactions (
    id uuid primary key default uuid_generate_v4(),
    
    wallet_user_id uuid references profiles(id) not null, -- Who owns this balance impact
    
    type text not null check (type in ('credit', 'debit')),
    amount numeric(10,2) not null check (amount > 0), -- Always positive, type determines sign
    
    category text not null check (category in ('ticket_sale', 'platform_fee', 'payout', 'refund', 'subscription_charge', 'adjustment')),
    
    reference_type text not null, -- 'order', 'payout', 'subscription'
    reference_id uuid not null,
    
    description text,
    
    -- Snapshot of balance AFTER this tx. 
    -- Note: We generally calculate running balance from sum, but storing a snapshot helps validaton.
    -- For this strict requirement, we'll calculate it via Trigger or Application logic.
    -- Adding it here for audit speed.
    balance_after numeric(10,2), 
    
    created_at timestamptz default now()
);

-- Index for fast ledger checksums
create index idx_ledger_user_created on financial_transactions(wallet_user_id, created_at desc);

-- 5. Settlements

create table if not exists payouts (
    id uuid primary key default uuid_generate_v4(),
    organizer_id uuid references profiles(id) not null,
    
    amount numeric(10,2) not null check (amount > 0),
    currency text default 'ZAR',
    
    status text not null check (status in ('pending', 'processing', 'paid', 'failed')),
    
    bank_reference text,
    processed_at timestamptz,
    expected_payout_date timestamptz not null,
    
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create table if not exists refunds (
    id uuid primary key default uuid_generate_v4(),
    payment_id uuid references payments(id) not null,
    item_id uuid references order_items(id), -- Optional partial refund
    
    amount numeric(10,2) not null check (amount > 0),
    reason text,
    
    status text default 'pending', -- pending, completed
    
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create table if not exists platform_fees (
    id uuid primary key default uuid_generate_v4(),
    order_id uuid references orders(id) not null,
    
    amount numeric(10,2) not null check (amount >= 0),
    percentage_applied numeric(5,4), -- e.g. 0.05 for 5%
    
    created_at timestamptz default now()
);

-- 6. Triggers for updated_at
create trigger update_subscriptions_modtime before update on subscriptions for each row execute procedure update_updated_at_column();
create trigger update_orders_modtime before update on orders for each row execute procedure update_updated_at_column();
create trigger update_payments_modtime before update on payments for each row execute procedure update_updated_at_column();
create trigger update_payouts_modtime before update on payouts for each row execute procedure update_updated_at_column();
create trigger update_refunds_modtime before update on refunds for each row execute procedure update_updated_at_column();

-- 7. RLS Policies

alter table subscriptions enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table payments enable row level security;
alter table financial_transactions enable row level security;
alter table payouts enable row level security;
alter table refunds enable row level security;
alter table plans enable row level security;
alter table platform_fees enable row level security;

-- Plans Public Read
create policy "Plans are viewable by everyone" on plans for select using (true);

-- Subscriptions (User view own)
create policy "Users manage own subscriptions" on subscriptions 
    for all using (auth.uid() = user_id);

-- Orders (User view own, Organizer view event orders)
create policy "Users view own orders" on orders 
    for select using (auth.uid() = user_id);
    
create policy "Organizers view orders for their events" on orders 
    for select using (
        exists (
            select 1 from events 
            where events.id = orders.event_id 
            and events.organizer_id = auth.uid()
        )
    );

-- Order Items
create policy "Users view own order items" on order_items
    for select using (
        exists (
            select 1 from orders 
            where orders.id = order_items.order_id 
            and orders.user_id = auth.uid()
        )
    );
    
create policy "Organizers view items for their events" on order_items
    for select using (
        exists (
            select 1 from orders
            join events on orders.event_id = events.id
            where orders.id = order_items.order_id
            and events.organizer_id = auth.uid()
        )
    );

-- Financial Transactions (Strict Ownership)
create policy "Organizers view own ledger" on financial_transactions
    for select using (auth.uid() = wallet_user_id);

-- Payouts
create policy "Organizers manage payouts" on payouts
    for select using (auth.uid() = organizer_id);
    
-- Payments & Fees (Protected, Admin or Internal System mostly)
-- Allowing users to see their own payments
create policy "Users view own payments" on payments
    for select using (
        exists (
            select 1 from orders
            where orders.id = payments.order_id
            and orders.user_id = auth.uid()
        )
    );
