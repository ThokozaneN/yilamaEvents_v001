
import React, { useState } from 'react';
import { Profile, OrganizerTier } from '../types';
import { supabase } from '../lib/supabase';
// P-7.4: GSAP removed — cards use CSS stagger animation via index.css dash-stagger

interface TierSelectionProps {
  user: Profile;
  onTierSelected: (tier: OrganizerTier) => void;
}

export const TierSelectionView: React.FC<TierSelectionProps> = ({ user, onTierSelected }) => {
  const [loading, setLoading] = useState<OrganizerTier | null>(null);

  // M-9.1: Free tier uses sandbox RPC (no payment needed).
  //        Pro/Premium redirect to the real PayFast billing checkout.
  const handleSelectTier = async (tier: OrganizerTier) => {
    setLoading(tier);
    try {
      if (tier === OrganizerTier.FREE) {
        // Free plan — activate via sandbox RPC (no payment needed)
        const { data, error } = await supabase
          .rpc('create_sandbox_subscription', { p_plan_id: 'free' });
        if (error) throw error;
        if (data && !data.success) throw new Error(data.message);
        localStorage.setItem(`yilama_onboarded_${user.id}`, 'true');
        onTierSelected(tier);
      } else {
        // Paid plan — initiate real PayFast billing checkout
        const { data, error } = await supabase.functions.invoke('create-billing-checkout', {
          body: { tier: tier.toLowerCase() },
        });
        if (error) throw error;
        if (!data?.url || !data?.params) throw new Error('Could not initiate billing. Please try again.');

        // Build + submit PayFast redirect form
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = data.url;
        Object.entries(data.params as Record<string, string>).forEach(([key, value]) => {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = key;
          input.value = value;
          form.appendChild(input);
        });
        document.body.appendChild(form);
        form.submit();
        // Page navigates away — no need for setLoading(null)
        return;
      }
    } catch (err: any) {
      alert(err.message || 'Failed to update your plan. Please try again.');
      setLoading(null);
    }
  };

  const tiers = [
    {
      id: OrganizerTier.FREE,
      name: "Starter",
      description: "Sell tickets to unlimited events with zero monthly cost. Perfect for independent promoters.",
      price: "R0",
      billingNote: "Free forever",
      feeNote: "2% per ticket sold",
      features: [
        "Unlimited Events",
        "1 Ticket Type per Event",
        "1 Scanner Account",
        "Basic Analytics",
        "Escrow Payouts",
        "Full QR Ticket System",
      ],
      cta: "Start for Free",
      isPopular: false,
      highlight: "Beat Computicket: half the fees, no subscription",
    },
    {
      id: OrganizerTier.PRO,
      name: "Professional",
      description: "The full toolkit for serious organisers — multiple ticket tiers, AI revenue insights, and reserved seating.",
      price: "R79",
      billingNote: "Billed Monthly",
      feeNote: "2% per ticket sold",
      features: [
        "Unlimited Events",
        "10 Ticket Types per Event",
        "5 Scanner Accounts",
        "AI Revenue Engine (Gemini)",
        "Advanced Analytics & Funnel",
        "VenueBuilder (Reserved Seating)",
        "Prepaid Payouts",
        "Attendee Resale Enabled",
      ],
      cta: "Go Pro",
      isPopular: true,
      highlight: "Most popular",
    },
    {
      id: OrganizerTier.PREMIUM,
      name: "Premium",
      description: "For agencies, festivals and high-volume venues. Lowest fees on the market.",
      price: "R119",
      billingNote: "Billed Monthly",
      feeNote: "1.5% per ticket sold",
      features: [
        "Unlimited Events",
        "Unlimited Ticket Types",
        "Unlimited Scanners",
        "AI Revenue Engine (Priority)",
        "Full Analytics Suite",
        "VenueBuilder + Complex Maps",
        "Priority Payouts & Support",
        "Full API & Webhook Access",
        "White-label Options",
        "Dedicated Account Manager",
      ],
      cta: "Go Premium",
      isPopular: false,
      highlight: "Lowest fees — 1.5% vs Computicket's 4.5%",
    },
  ];

  return (
    <div className="px-6 md:px-12 py-12 max-w-7xl mx-auto min-h-[80vh] flex flex-col justify-center">
      <div className="mb-16 space-y-4">
        <div className="inline-block px-4 py-1.5 rounded-full bg-black dark:bg-white text-white dark:text-black text-[9px] font-black uppercase tracking-[0.2em] mb-4">
          Choose Your Plan
        </div>
        <h1 className="text-5xl md:text-7xl font-bold tracking-tighter themed-text leading-none">
          Start Selling<br />Tickets Today
        </h1>
        <p className="text-zinc-500 font-medium max-w-2xl text-lg leading-relaxed">
          Welcome, <span className="text-black dark:text-white font-bold">{user.name}</span>.{" "}
          All plans include unlimited events — upgrade for more ticket types, scanners, and AI tools.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch dash-stagger">
        {tiers.map((tier) => (
          <div
            key={tier.id}
            className={`relative p-10 rounded-[3.5rem] border-2 transition-all flex flex-col group ${tier.isPopular
              ? 'border-black dark:border-white themed-card shadow-2xl scale-[1.02] z-10'
              : 'border-zinc-100 dark:border-zinc-800 themed-secondary-bg opacity-90'
              }`}
          >
            {tier.isPopular && (
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-5 py-1.5 bg-black dark:bg-white text-white dark:text-black text-[8px] font-black uppercase tracking-widest rounded-full shadow-xl">
                Most Popular
              </div>
            )}

            <div className="mb-6">
              <h3 className="text-2xl font-black themed-text mb-2 tracking-tighter uppercase">{tier.name}</h3>
              <p className="text-[10px] font-bold themed-text opacity-40 uppercase tracking-widest leading-relaxed">{tier.description}</p>
            </div>

            <div className="mb-8">
              <div className="flex items-baseline gap-1">
                <p className="text-4xl font-black themed-text tracking-tighter">{tier.price}</p>
                {tier.id !== OrganizerTier.FREE && <span className="text-xs font-bold text-zinc-400">/mo</span>}
              </div>
              <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mt-1">{tier.billingNote}</p>
              <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20">
                <span className="text-[9px] font-black text-green-600 dark:text-green-400 uppercase tracking-widest">{tier.feeNote}</span>
              </div>
            </div>

            {/* Competitive highlight */}
            {tier.highlight && (
              <div className="mb-6 px-4 py-2 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900">
                <p className="text-[9px] font-black uppercase tracking-widest opacity-50 themed-text">{tier.highlight}</p>
              </div>
            )}

            <div className="space-y-3 mb-10 flex-grow">
              {tier.features.map((feature, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
                    <svg className="w-2.5 h-2.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-xs font-bold themed-text opacity-70 tracking-tight">{feature}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => handleSelectTier(tier.id)}
              disabled={!!loading}
              className={`w-full py-6 rounded-[1.8rem] text-[10px] font-black uppercase tracking-[0.2em] transition-all active:scale-95 flex items-center justify-center gap-3 ${tier.isPopular
                ? 'bg-black dark:bg-white text-white dark:text-black shadow-2xl hover:brightness-110'
                : 'themed-card border themed-border themed-text hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black'
                }`}
            >
              {loading === tier.id ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  {tier.id !== OrganizerTier.FREE && (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                  )}
                  {tier.cta}
                </>
              )}
            </button>
          </div>
        ))}
      </div>

      <div className="mt-20 text-center opacity-30">
        <p className="text-[9px] font-bold themed-text uppercase tracking-[0.3em]">
          Secure Payment via PayFast · 256-bit SSL · Cancel Anytime
        </p>
      </div>
    </div>
  );
};
