
import React from 'react';

export const APP_NAME = "Yilama Events";

export const CATEGORIES = [
  "All",
  "Music",
  "Conferences",
  "Festivals",
  "Nightlife",
  "Workshops",
  "Sports",
  "Gospel",
  "Comedy"
];

export const MOCK_EVENTS = [
  {
    id: '1',
    organizer_id: 'org1',
    title: 'Cape Town Jazz Festival',
    description: 'The ultimate annual music experience in the heart of Mother City.',
    venue: 'Cape Town International Convention Centre',
    starts_at: '2024-10-15T19:00:00Z',
    price: 850,
    image_url: 'https://picsum.photos/seed/jazz/1200/800',
    category: 'Music',
    total_ticket_limit: 5000,
    calculated_fee_rate: 0.02,
    latitude: -33.9169,
    longitude: 18.4233
  },
  {
    id: '2',
    organizer_id: 'org2',
    title: 'Local Vinyl Night',
    description: 'A small community gathering for analog music lovers.',
    venue: 'The Record Room, Observatory',
    starts_at: '2024-07-06T20:00:00Z',
    price: 150,
    image_url: 'https://picsum.photos/seed/records/1200/800',
    category: 'Music',
    total_ticket_limit: 80,
    calculated_fee_rate: 0,
    latitude: -33.9372,
    longitude: 18.4681
  },
  {
    id: '3',
    organizer_id: 'org3',
    title: 'Johannesburg Tech Summit',
    description: 'Connecting innovators across the continent.',
    venue: 'Sandton Convention Centre',
    starts_at: '2024-11-20T09:00:00Z',
    price: 1200,
    image_url: 'https://picsum.photos/seed/tech/1200/800',
    category: 'Conferences',
    total_ticket_limit: 1200,
    calculated_fee_rate: 0.02,
    latitude: -26.1065,
    longitude: 28.0526
  }
];

export const LEGAL_CONTENT = {
  terms: {
    title: "Terms of Use",
    body: `Effective Date: 1 February 2026

Welcome to Yilama Events. These Terms govern your access to and use of our Service.

1. DEFINITIONS: User, Organizer, Ticket Buyer, Event, Ticket, QR Code.
2. ELIGIBILITY: You must be at least 18 years old or have parental consent.
3. ACCOUNT REGISTRATION: Provide accurate info, keep credentials secure.
4. ROLE TYPES: User, Organizer, Scanner, Admin. Role self-assignment is prohibited.
5. ORGANIZER VERIFICATION: Requires approval. We reserve the right to revoke status for fraud.
6. TICKETS AND ACCESS: Issued digitally via QR code. Validation occurs at entrance. Duplication is prohibited.
7. PRICING AND FEES: 0% fee for <100 tickets. 2% platform fee for >=100 tickets.
8. PAYMENTS: Processed via third-party providers (PayFast, Ozow, Stripe).
9. REFUNDS: Determined by Organizers. Yilama is not responsible for cancellations.
10. USER CONDUCT: No illegal activities, hacking, or harassment.
11. INTELLECTUAL PROPERTY: Belong to Yilama Events.
12. LIMITATION OF LIABILITY: Yilama is not liable for event cancellations or technical failures.
13. DATA AND PRIVACY: Governed by our Privacy Policy.
14. TERMINATION: We reserve the right to suspend accounts violating Terms.
15. CHANGES: We may update these Terms. Continued use implies acceptance.
16. GOVERNING LAW: Laws of the Republic of South Africa.
17. CONTACT: support@yilamaevents.co.za`
  },
  privacy: {
    title: "Privacy Policy",
    body: `Effective Date: 1 February 2026

1. Introduction: Explains how we collect, use, and protect your info.
2. Information We Collect: Name, Email, Phone, Account Credentials, Verification details, Ticket data, and Technical info.
3. How We Use Information: Authentication, Ticket issuance, Fraud prevention, and Service improvement.
4. Data Storage and Security: Use of Supabase, encrypted auth, and Role-Based Access Control.
5. Sharing: Shared with payment providers and event organizers (limited) or legal authorities.
6. Retention: Only as long as necessary for service delivery or legal obligations.
7. Your Rights: Access, correction, or deletion of data.
8. Changes: Policy may be updated.
9. Contact: privacy@yilamaevents.co.za`
  },
  organizer: {
    title: "Organizer Agreement",
    body: `Effective Date: 1 February 2026

This Organizer Agreement governs the relationship between Yilama Events and approved event organizers.

1. Organizer Eligibility
To become an Organizer, you must:
- Apply through the platform
- Provide accurate information
- Receive approval from Yilama Events
Approval may be revoked at any time.

2. Organizer Responsibilities
Organizers agree to:
- Provide truthful event information
- Deliver events as advertised
- Comply with applicable laws
- Avoid fraudulent or misleading practices

3. Ticketing and Pricing
Organizers set ticket prices and types (e.g., General, VIP, VVIP, custom tiers).
Platform Fee Structure:
- Events with fewer than 100 tickets: no platform fee
- Events with 100 or more tickets: 2% platform fee per ticket type
Fees are calculated server-side and cannot be manipulated.

4. Event Management
Organizers are responsible for:
- Event execution
- Venue arrangements
- Security and logistics
Yilama Events is not responsible for event quality or delivery.

5. Suspension and Termination
We reserve the right to:
- Suspend or remove events
- Revoke organizer status
- Withhold payouts in cases of fraud or violations

6. Liability
Organizers indemnify Yilama Events against claims arising from their events.`
  },
  refund: {
    title: "Refund Policy",
    body: `Effective Date: 1 February 2026

1. General Rule
Refund policies are primarily determined by event organizers.
Yilama Events acts as a ticketing platform and is not the event host.

2. Buyer Refunds
Refunds may be issued if:
- The organizer approves a refund
- The event is cancelled or postponed
- Required by law
Platform fees may be non-refundable unless otherwise stated.

3. Organizer Refund Obligations
Organizers are responsible for:
- Communicating refund policies clearly
- Processing approved refunds promptly

4. Disputes
Yilama Events may assist in dispute resolution but is not obligated to issue refunds.`
  },
  disclaimer: {
    title: "Fraud & Scanning Disclaimer",
    body: `Effective Date: 1 February 2026

1. Ticket Authenticity
Each ticket issued through Yilama Events contains a unique QR code.
Attempting to:
- Duplicate tickets
- Manipulate QR codes
- Bypass scanning systems
is strictly prohibited and may result in legal action.

2. Scanning and Validation
Tickets are validated in real time through secure backend systems.
Once scanned and marked as “used,” tickets cannot be reused.
Duplicate scans will be rejected automatically.

3. Organizer and Scanner Responsibility
Organizers and assigned scanners must:
- Use only authorized scanning tools
- Follow platform validation procedures
- Avoid manual overrides or unauthorized access
Misuse of scanning systems may result in suspension or legal consequences.

4. Limitation of Liability
Yilama Events is not liable for:
- Denied entry due to invalid or duplicated tickets
- Organizer misconduct
- Technical failures beyond reasonable control

5. Fraud prevention
We reserve the right to:
- Investigate suspicious activity
- Suspend accounts
- Share information with authorities when required`
  }
};

export const SUPABASE_SCHEMA_SQL = `-- Schema updated for Pricing v2
-- See database/security_layer.sql for full content
`;
