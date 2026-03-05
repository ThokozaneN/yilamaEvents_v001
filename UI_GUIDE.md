
# Yilama Events: UI/UX Reference Guide

This document provides a detailed breakdown of the visual architecture and user experience design for the **Yilama Events** platform.

## 1. Design Language & Aesthetics
The application follows a **Premium Apple-Inspired Aesthetic**, characterized by:
- **Glassmorphism**: Extensive use of `apple-blur` (backdrop-filter) on navigation and modals.
- **High-Fidelity Curvature**: Container border radii set to `rounded-[3.5rem]` for a modern, tactile feel.
- **Typography**: Montserrat font family with heavy tracking (`tracking-tighter`) for headings and wide tracking (`tracking-[0.2em]`) for metadata.
- **Theme Support**: 
    - **Light**: Crisp white backgrounds with subtle zinc accents.
    - **Dark**: Deep charcoal with high contrast.
    - **Matte Black**: Pure OLED black (`#000000`) with minimal borders.
- **Motion Design**: Powered by GSAP, featuring staggered entrance animations and `active:scale-95` tactile feedback.

---

## 2. Global Components

### Preloader
The entry point of the app. It features an animated dark gradient background, a glowing "Y" brand icon, and a "Smart Crawl" progress bar that synchronizes with the initial Supabase session and event data fetch.

### Navbar (Top)
A fixed, blurred header containing the brand identity and user context. It provides a quick toggle between "Sign In" and the user's first name with a logout option.

### Floating Navigation (Bottom)
The primary navigation hub. Designed for mobile-first ergonomics, it sits at the bottom of the screen with a blurred glass background. It features five core pillars:
1. **Home**: Event Discovery.
2. **Wallet**: Personal Asset Storage.
3. **Scanner**: Professional Gate Control.
4. **Dashboard**: Organizer Operations.
5. **Settings**: Configuration & Identity.

---

## 3. Page-by-Page Breakdown

### Home View (The Discovery Hub)
- **Header**: Massive "Events" heading using ultra-bold typography.
- **Search**: A focused, blurred input field for real-time filtering of titles, artists, and venues.
- **Categories**: An overflow-scrolling pill navigation (Music, Nightlife, etc.) with a dynamic underline indicator.
- **Event Grid**: A responsive layout using **Event Cards**. Each card features an aspect ratio of 4:5, custom text shadows for readability over imagery, and an "Apple Blur" badge showing the date and price.

### Event Detail View (The Experience Portal)
- **Visual Split**: Large-scale poster artwork on the left/top; interactive details on the right/bottom.
- **AI Venue Intel**: Integrated data about the venue, including "Floor Plan" toggles.
- **Checkout Flow**: A multi-step modal system:
    - **Selection**: Quantity and tier choice.
    - **Details**: Buyer information capture.
    - **Payment**: Simulation of high-end South African gateways (PayFast, Capitec Pay, etc.).
    - **Processing**: Animated authorization sequence.

### Digital Wallet (The Asset Vault)
- **Interactive Stacks**: Tickets for the same event are "stacked" visually.
- **Ticket Modal**: An Apple Wallet-style card that displays:
    - Dynamic SVG QR Code.
    - **Anti-Scalp Resale**: Ability to list tickets on the marketplace with a capped price (110% max).
    - **Peer-to-Peer Transfer**: Secure transfer to other users via email.

### Gate Control (Professional Scanner)
- **Real-time Engine**: Uses the device camera with a "Laser" scan animation.
- **State Feedback**: Large, full-screen color-coded states:
    - **Green**: "Approved" entry.
    - **Amber**: "Used Already" (prevents double entry).
    - **Red**: "Invalid" or unauthorized.
- **Security Lock**: Built-in rate limiting that locks the scanner after 5 failed attempts to prevent brute-force attacks.

### Organizer Studio (Management)
- **Metrics Dashboard**: Deep-card stats for Settlement Balances, Active Points, and Asset Audience.
- **Event Creator**: A multi-section form featuring:
    - **AI Poster Audit**: Automatically runs a safety check on uploaded artwork via Gemini.
    - **Venue Intelligence**: Automatically suggests ticket tiers and seating plans based on the venue name.
    - **Settlement Logic**: Choice between "Direct" (upfront fee) or "Escrow" (deferred fee) models.

### Settings & Identity
- **Profile Architecture**: Deep-editing of legal names, business details, and social handles.
- **Appearance Control**: Real-time theme switching.
- **Accessibility Toggles**: High Contrast, Large Text, and Reduced Motion settings that instantly update the DOM.

---

## 4. Technical Features
- **Offline Reliability**: Tickets are cached for offline access at the gate.
- **Role-Based Access (RBAC)**: Views like the Scanner and Dashboard are strictly hidden from standard attendees.
- **Security Logging**: All scanning attempts and payment events are logged server-side for auditing.
