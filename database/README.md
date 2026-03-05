
# Yilama Events: Security & Logic Layer

## Database Design Goals
- **Financial Integrity**: Platform fees (0% vs 2%) are calculated via the `finalize_sale` Postgres function to prevent client-side manipulation.
- **Anti-Fraud**: The `tickets` table uses RLS to ensure only the owner can view the QR code, and financial audit fields are immutable.
- **Atomic Scanning**: The logic ensures a ticket cannot be "Used" twice through atomic updates using `FOR UPDATE` locks in the `redeem_ticket` RPC.

## Key Tables
- `profiles`: Extends Supabase Auth with roles (`user`, `organizer`, `scanner`, `admin`) and tiers (`free`, `pro`, `premium`).
- `events`: Stores event details, capacity limits, and real-time revenue snapshots.
- `tickets`: Digital assets with a unique `public_id` used for the QR code.

## Storage Setup (Event Posters)
To enable poster uploads, follow these steps in the Supabase Dashboard:

1. **Create Bucket**: Go to **Storage**, create a bucket named `event-posters`, and set it to **Public**.
2. **Apply Policies**: Run the `database/storage_policies.sql` in the SQL Editor.
3. **Verify RLS**:
   - `SELECT`: Allowed for everyone (Public).
   - `INSERT`: Allowed only for authenticated users with the `organizer` role.
   - `UPDATE/DELETE`: Allowed only for the owner of the file (UID matching folder name) or `admin`.

## Setup
1. Execute `security_layer.sql` in the Supabase SQL Editor to initialize the core schema.
2. Execute `storage_policies.sql` to secure the poster bucket.
3. Ensure the `auth.users` trigger is active to automatically create `profiles` entries upon signup.

## Admin Access
To grant yourself full administrative privileges, run:
```sql
UPDATE public.profiles SET role = 'admin' WHERE email = 'your-email@example.com';
```
