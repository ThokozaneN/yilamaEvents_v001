
# Yilama Events: System Architecture & Data Flow

This document outlines the design patterns and technical infrastructure of the Yilama Events platform.

## 1. Core Tech Stack
- **Frontend**: React 19 (Functional Components, Hooks)
- **Styling**: Tailwind CSS (Utility-first, Custom Apple-inspired matte theme)
- **Animations**: GSAP (GreenSock) for high-performance layout transitions and preloading.
- **Backend**: Supabase (PostgreSQL + PostgREST + Auth)
- **AI Engine**: Gemini 3 Flash (via `@google/genai`) for smart pricing and audience growth insights.
- **Ticketing**: 
    - `qrcode.react`: Client-side SVG QR generation.
    - `jsqr`: Client-side real-time video frame QR decoding.

## 2. Data Model & Relationships
- **Profiles**: Extended User data containing `role` (user, organizer, scanner, admin) and `verification_status`.
- **Events**: Core experience records. Contains `calculated_fee_rate` snapshot (0% or 10%).
- **Ticket Types (Tiers)**: Linked to events, defining price and inventory limits.
- **Tickets**: Digital assets owned by Users. Contains financial snapshots (`gross_amount`, `platform_fee`, `net_amount`) at the moment of purchase.

## 3. Financial Integrity & AI Insights
- **Transparent Fees**: 0% for Community (<100) or 10% for Standard (100+) tickets.
- **Smart Pricing**: Uses Gemini 3 Flash to suggest competitive ZAR pricing based on category, venue prestige, and event title.
- **Sales Heatmap**: Visualizes geographic concentration of sales, helping organizers optimize local marketing.
- **Audience Intelligence (New)**: Analyzes event portfolios to generate growth trends using Gemini 3 Flash, alongside age and gender demographic breakdowns.

## 4. Ticketing Lifecycle
1. **Discovery**: Users browse the `HomeView`, filtered by proximity (Haversine formula).
2. **Purchase**: `EventDetailView` handles multi-step checkout via PayFast simulation.
3. **Wallet**: Tickets are cached in `localStorage` for offline QR access.
4. **Gate Control**: Scanners use `jsqr` for real-time validation via `getUserMedia`.

## 5. Security Layers (RLS)
- Public events discovery.
- Auth-restricted ticket ownership.
- Organizer-specific CRUD operations for event management.

## 6. Offline Strategy
- Full `localStorage` ticket persistence.
- Adaptive UI badges showing "Available Offline" status.
