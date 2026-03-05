
# Yilama Events: Production Hardening Test Checklist

Use this list to verify that the security layer is correctly implemented.

### 1. Role Escalation Prevention
- [ ] **Signup Spoofing**: Create a new account and attempt to pass `{"role": "admin"}` in user metadata. Verify the database profile role is still `'user'`.
- [ ] **Manual Profile Edit**: As a standard user, try to `UPDATE profiles SET role = 'organizer'`. Verify the change is ignored/reverted by the `tr_protect_profile_meta` trigger.

### 2. Payment Gating
- [ ] **Direct Minting**: Call `finalize_sale` with a random string for `p_provider_ref`. Verify it fails with `PAYMENT_NOT_FOUND`.
- [ ] **Unconfirmed Payment**: Manually insert a payment with `status = 'pending'`. Call `finalize_sale`. Verify it fails with `PAYMENT_NOT_CONFIRMED`.
- [ ] **Double Spending**: Use a confirmed payment to mint a ticket. Try calling `finalize_sale` with the same `provider_ref` again. Verify it fails.

### 3. Marketplace & Resale
- [ ] **Organizer Resale**: As an organizer, try to list one of your own tickets (bought as attendee) for resale. Verify it fails with `ONLY_ATTENDEES_CAN_USE_MARKETPLACE`.
- [ ] **Price Cap**: Try to list a ticket for 150% of its original price. Verify it fails with `PRICE_EXCEEDS_CAP`.

### 4. Scanning & Entry
- [ ] **Double Scan**: Use `redeem_ticket` on a valid ticket. Call it again with the same ID. Verify the response is `already-used` with the original timestamp.
- [ ] **Unauthorized Scanner**: Try to scan a ticket for an event where you are not the organizer or an assigned scanner. Verify it fails with `UNAUTHORIZED_SCANNER_FOR_EVENT`.

### 5. Media & Storage
- [ ] **Cross-Organizer Edit**: As Organizer A, try to delete a poster located in folder `{Organizer B UID}/poster.jpg`. Verify access is denied.

### 6. Limits & Tiers
- [ ] **Event Limits**: On a FREE tier, try to create a 3rd active event. Verify the `check_event_limit` trigger blocks the insert.
- [ ] **Scanner Limits**: Try to add more scanners to an event than allowed by your current tier. Verify the `check_scanner_limit` trigger blocks the insert.
