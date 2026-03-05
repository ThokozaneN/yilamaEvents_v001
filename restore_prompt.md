# Yilama Events: Restoration Prompt

To recreate this application from scratch, use the following detailed prompt. This captures the architecture, visual language, and specific logic implemented.

---

## The Prompt

**Role:** Act as a world-class senior frontend engineer and UI/UX designer.

**Objective:** Build "Yilama Events", a modern, production-ready local events ticketing platform for South Africa. The UI must follow a premium Apple-inspired aesthetic (heavy use of `backdrop-filter`, large border radii, bold typography, and smooth GSAP animations).

**Architecture Requirements:**
- **Stack:** React 19, Tailwind CSS, GSAP for animations, Supabase for backend, Zod for validation, and Vitest for automated testing.
- **Themes:** Support three distinct themes: `light`, `dark`, and `matte-black`.
- **Quality Assurance:** Implement unit tests for business logic (Zod schemas) and component tests for critical UI (Navbar, EventCard).
- **CI/CD:** Configure GitHub Actions for automated testing and deployment.

**Key Feature Specifications:**
1.  **Identity & Preloader:** 
    - Implement a Preloader that displays for at least 1.2 seconds.
    - Visually: A glowing black "Y" icon above "YILAMA EVENTS" text with a progress bar.
2.  **Authentication & Verification:**
    - Role-based access: `User`, `Organizer`, `Scanner`, `Admin`.
    - Strict email verification enforcement for ticket purchases.
    - Zod-validated forms for all user inputs.
3.  **Discovery & Ticketing:**
    - Home view with category filtering and proximity-based sorting.
    - Event Detail view with AI Venue Intel and multi-tier inventory tracking.
4.  **Checkout Flow:**
    - Atomic checkout process consolidating intents and fulfillment.
    - Simulation of PayFast gateway for production testing.
5.  **Digital Wallet & Marketplace:**
    - Digital assets with peer-to-peer transfer and price-capped resale (110% cap).
6.  **Gate Control (Scanner):**
    - Real-time QR scanning with brute-force protection (lockout after 5 failed attempts).

**Infrastructure:**
- **Monitoring:** Integrated Sentry for production error tracking.
- **Health Check:** Specialized `/health` endpoint monitoring DB, Storage, and AI Engine status.
- **Backups:** Documented daily backup and Point-in-Time Recovery (PITR) strategy.

---

## Instructions for the Engineer
When using this prompt, ensure that the file structure follows:
- `App.tsx` (Main router and state)
- `lib/validation.ts` (Zod schemas)
- `lib/monitoring.ts` (Sentry/Health logic)
- `tests/` (Vitest test suite)
- `.github/workflows/` (CI/CD pipeline)
- `types.ts` (Enums and Interfaces)
