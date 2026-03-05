

export enum UserRole {
  USER = 'user',
  ORGANIZER = 'organizer',
  SCANNER = 'scanner',
  ADMIN = 'admin'
}

export enum OrganizerTier {
  FREE = 'free',
  PRO = 'pro',
  PREMIUM = 'premium'
}

export interface Plan {
  id: string;
  name: string;
  price: number;
  currency: string;
  events_limit: number;
  tickets_limit: number;
  scanners_limit: number;
  commission_rate: number;
  features: Record<string, any>;
}

export enum TicketStatus {
  VALID = 'valid',
  USED = 'used',
  TRANSFERRED = 'transferred',
  LISTED = 'listed',
  RESERVED = 'reserved' // Used by seating flow until payment confirmed
}

// Added to resolve import errors in Wallet.tsx
export type TransferType = 'gift' | 'resale';

// Added to resolve import errors in Wallet.tsx
export interface TicketTransfer {
  id: string;
  ticket_id: string;
  from_user_id: string;
  to_email: string;
  transfer_type: TransferType;
  resale_price?: number;
  status: 'pending' | 'accepted' | 'declined' | 'completed';
  direction: 'sent' | 'received';
  event_title: string;
}

// Added to resolve import errors in Scanner.tsx
export interface EventScannerAssignment {
  id: string;
  event_id: string;
  scanner_user_id: string;
  gate_name: string;
  is_active: boolean;
  event?: Event;
}

export interface Profile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  organizer_tier: OrganizerTier;
  email_verified: boolean;
  organizer_status: 'draft' | 'pending' | 'verified' | 'rejected' | 'suspended' | 'needs_update';
  // Fix: Object literal may only specify known properties, and 'organizer_trust_score' does not exist in type 'Profile'
  organizer_trust_score?: number;
  created_at?: string;
  // Added to resolve errors in Settings.tsx and OrganizerDashboard.tsx
  business_name?: string;
  bank_name?: string;
  account_number?: string;
  account_holder?: string;
  account_type?: string;
  branch_code?: string;
  // Verification document URLs
  id_proof_url?: string;
  organization_proof_url?: string;
  address_proof_url?: string;
  id_number?: string;
  organization_phone?: string;
  // Social Media & Avatar
  avatar_url?: string;
  instagram_handle?: string;
  twitter_handle?: string;
  website_url?: string;
  facebook_handle?: string;
}

// Multi-Day Event Support
export interface EventDate {
  id?: string;
  event_id?: string;
  starts_at: string;
  ends_at?: string;
  venue?: string; // Optional override
  lineup?: string[]; // Optional override
  created_at?: string;
}

export interface TicketAccessRules {
  max_entries?: number;
  allowed_zones?: string[];
  cooldown_minutes?: number;
}

export interface TicketType {
  id: string;
  event_id: string;
  name: string;
  price: number;
  quantity_limit: number;
  quantity_sold: number;
  event_date_id?: string | null; // Null means valid for all dates
  access_rules?: TicketAccessRules;
}

export interface Event {
  id: string;
  organizer_id: string;
  title: string;
  description: string;
  venue: string; // Default venue
  starts_at: string; // Default start date (or first date)
  ends_at?: string; // Default end date (or last date)
  latitude?: number;
  longitude?: number;
  image_url: string;
  category: string;
  status: 'draft' | 'published' | 'cancelled' | 'ended' | 'coming_soon';
  headliners: string[]; // Default lineup
  prohibitions: string[];
  parking_info?: string;
  is_cooler_box_allowed?: boolean;
  cooler_box_price?: number;
  total_ticket_limit: number;
  gross_revenue?: number;
  fee_preference?: 'upfront' | 'post_event';
  tiers?: TicketType[];
  dates?: EventDate[]; // New field for multi-day events
  price?: number;
  layout_id?: string;
  is_seated?: boolean;
  created_at?: string;
  organizer?: Profile;
}

export interface Ticket {
  id: string;
  public_id: string;
  secret_key?: string; // Cryptographic secret (client-side generated QR uses this)
  event_id: string;
  ticket_type_id: string;
  owner_user_id: string;
  attendee_name: string;
  status: TicketStatus;
  used_at?: string;
  scanned_by?: string;
  qr_payload?: string;
  gross_amount: number;
  price?: number; // Alias used in some older queries
  event?: Event;
  seat_id?: string;
  // Joined relations (when fetched with select)
  ticket_type?: { id: string; name: string; price: number };
  metadata?: Record<string, any>; // Contains attendee_name and other custom data
}

export type SeatStatus = 'available' | 'reserved' | 'sold' | 'blocked';

export interface VenueSeat {
  id: string;
  zone_id: string;
  section_id?: string; // Phase 2: Hierarchical grouping
  row_identifier: string;
  seat_identifier: string;
  svg_cx?: number;
  svg_cy?: number;
  positional_modifier: number;
  status: SeatStatus;
  event_id?: string;
}

export interface VenueSection {
  id: string;
  layout_id: string;
  name: string;
  svg_path_data: string;
  color_code?: string;
  zone_id?: string;
  capacity: number;
}

export interface VenueZone {
  id: string;
  layout_id: string;
  name: string;
  color_code: string;
  price_multiplier: number;
  capacity: number;
  created_at: string;
}

export interface VenueLayout {
  id: string;
  organizer_id: string;
  name: string;
  is_template: boolean;
  max_capacity: number;
  svg_structure?: any;
  created_at: string;
  updated_at: string;
}

export interface EventCategory {
  id: string;
  name: string;
  slug: string;
  icon: string;
  label?: string;
  description?: string;
  sort_order?: number;
}

export interface FinancialTransaction {
  id: string;
  created_at: string;
  type: 'credit' | 'debit';
  amount: number;
  category: 'ticket_sale' | 'platform_fee' | 'payout' | 'refund' | 'subscription_charge' | 'adjustment';
  description: string;
  reference_type: string;
  reference_id: string;
}

export interface Payout {
  id: string;
  organizer_id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'processing' | 'paid' | 'failed';
  bank_reference?: string;
  processed_at?: string;
  expected_payout_date: string;
  created_at: string;
  updated_at: string;
}

export interface FinancialSummary {
  metadata: {
    organizer_name: string;
    organizer_tier: string;
    period_start: string;
    period_end: string;
    generated_at: string;
  };
  metrics: {
    gross_sales: number;
    total_refunds: number;
    platform_fees: number;
    tier_deductions: number;
    net_payouts: number;
    opening_balance: number;
    closing_balance: number;
    net_change: number;
  };
  transactions: FinancialTransaction[];
}

export interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: 'system' | 'event_update' | 'ticket_purchase' | 'fraud_alert' | 'premium_launch';
  action_url?: string;
  is_read: boolean;
  created_at: string;
}