import React, { useState, useEffect, useMemo } from 'react';
import { Event, Profile } from '../types';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { downloadICS } from '../lib/calendar';
import { SeatingSelectionModal } from '../components/seating/SeatingSelectionModal';
import { TicketType } from '../types';
import { Hourglass, Flame, Ticket as TicketIcon } from 'lucide-react';
// P-7.4: GSAP removed — checkout modal uses CSS animation (@keyframes checkout-in in index.css)

interface EventDetailProps {
  event: Event;
  user: Profile | null;
  onNavigateAuth: () => void;
  // Fix: Return type should be void | Promise<void> and include promoCode to match handlePurchase in App.tsx
  onPurchase: (qty: number, tierId?: string, attendeeNames?: string[], promoCode?: string, seatIds?: string[]) => void | Promise<void>;
}

export const EventDetailView: React.FC<EventDetailProps> = ({ event, user, onNavigateAuth, onPurchase }) => {
  const tiers = useMemo(() => event.tiers || [], [event]);
  const [selectedTierId, setSelectedTierId] = useState<string>(tiers[0]?.id || '');
  const [qty, setQty] = useState(1);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isSeatingModalOpen, setIsSeatingModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isJoinedWaitlist, setIsJoinedWaitlist] = useState(false);
  const [isJoiningWaitlist, setIsJoiningWaitlist] = useState(false);
  const [attendees, setAttendees] = useState<Profile[]>([]);
  const [totalAttendees, setTotalAttendees] = useState(0);
  // U-8.3: Promo code state
  const [promoCode, setPromoCode] = useState('');
  const [showPromo, setShowPromo] = useState(false);
  const MAX_QTY = 20; // A-6.2 client-side cap (server also enforces this)

  useEffect(() => {
    const fetchAttendees = async () => {
      // P-7.3: Fetch only 10 rows — enough to deduplicate 4 unique profiles
      const { data, count } = await supabase
        .from('tickets')
        .select(`
          owner_user_id,
          profiles:owner_user_id (id, name, avatar_url)
        `, { count: 'exact' })
        .eq('event_id', event.id)
        .eq('status', 'valid')
        .limit(10); // P-7.3: Was unbounded (full table scan on big events)


      if (data) {
        setTotalAttendees(count || 0);
        const uniqueProfilesMap = new Map();
        data.forEach((ticket: any) => {
          if (ticket.profiles && !uniqueProfilesMap.has(ticket.user_id)) {
            uniqueProfilesMap.set(ticket.user_id, ticket.profiles);
          }
        });
        setAttendees(Array.from(uniqueProfilesMap.values()).slice(0, 4));
      }
    };
    if (event.status !== 'coming_soon') {
      fetchAttendees();
    }
  }, [event.id, event.status]);

  useEffect(() => {
    const checkWaitlistStatus = async () => {
      if (user && event.status === 'coming_soon') {
        const { data } = await supabase
          .from('event_waitlists')
          .select('id')
          .eq('event_id', event.id)
          .eq('user_id', user.id)
          .maybeSingle();
        if (data) setIsJoinedWaitlist(true);
      }
    };
    checkWaitlistStatus();
  }, [user, event.id, event.status]);

  const handleJoinWaitlist = async () => {
    if (!user) { onNavigateAuth(); return; }
    setIsJoiningWaitlist(true);
    try {
      const { error } = await supabase.from('event_waitlists').insert([
        { event_id: event.id, user_id: user.id }
      ]);
      if (error && error.code !== '23505') throw error; // Ignore if already exists
      setIsJoinedWaitlist(true);
    } catch (err: any) {
      alert(`Failed to join waitlist: ${err.message}`);
    } finally {
      setIsJoiningWaitlist(false);
    }
  };

  useEffect(() => {
    if (tiers.length > 0 && !selectedTierId && tiers[0]) setSelectedTierId(tiers[0].id);
  }, [tiers, selectedTierId]);

  // P-7.4: Removed GSAP animation effect — checkout-pane uses CSS @keyframes checkout-in

  const [eventDates, setEventDates] = useState<any[]>([]);
  const [selectedDateId, setSelectedDateId] = useState<string | null>(null);

  useEffect(() => {
    const fetchDates = async () => {
      const { data } = await supabase
        .from('event_dates')
        .select('*')
        .eq('event_id', event.id)
        .order('starts_at', { ascending: true });

      if (data && data.length > 0) {
        setEventDates(data);
        // Optional: Auto-select first date if desired, or leave null for "All Dates"
        // setSelectedDateId(data[0].id);
      }
    };
    fetchDates();
  }, [event.id]);

  const filteredTiers = useMemo(() => {
    if (!selectedDateId) return tiers; // Show all if no date selected (or maybe show only "All Date" tickets?)
    // Show tickets linked to this date OR generic tickets (null)
    return tiers.filter(t => t.event_date_id === selectedDateId || t.event_date_id === null);
  }, [tiers, selectedDateId]);

  // Update selection when filtered tiers change
  useEffect(() => {
    // If the currently selected tier is no longer visible, select the first visible one
    if (filteredTiers.length > 0) {
      if (!filteredTiers.find(t => t.id === selectedTierId)) {
        const firstTier = filteredTiers[0];
        if (firstTier && firstTier.id) {
          setSelectedTierId(firstTier.id);
        }
      }
    }
  }, [filteredTiers, selectedTierId]);

  const selectedTier = tiers.find(t => t.id === selectedTierId);
  const totalPrice = (selectedTier?.price || 0) * qty;

  const handleFinalPurchase = async () => {
    if (!user) { onNavigateAuth(); return; }
    setIsProcessing(true);
    try {
      // U-8.3: Pass promoCode through to onPurchase
      await onPurchase(qty, selectedTierId, Array(qty).fill(user.name), promoCode || undefined);
      setIsCheckoutOpen(false);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const [shareText, setShareText] = useState('Share Event');
  const handleShare = async () => {
    const shareData = {
      title: event.title,
      text: `Check out ${event.title} on Yilama Events!`,
      url: window.location.href, // Since we don't have true deep links yet, this is a placeholder URL
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        console.log("Share failed or cancelled", err);
      }
    } else {
      navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
      setShareText('Copied Link!');
      setTimeout(() => setShareText('Share Event'), 2000);
    }
  };

  const handleCalendar = () => {
    downloadICS({
      title: event.title,
      description: event.description,
      location: event.venue,
      startTime: event.starts_at || new Date().toISOString(),
      endTime: event.ends_at || new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      url: window.location.href
    }, `${event.title.replace(/\s+/g, '_')}.ics`);
  };

  const prohibitionsList = event.prohibitions?.map(p => {
    const cleaned = p.replace('no-', '');
    let Icon = <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>;
    if (cleaned === 'weapons') Icon = <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>;
    if (cleaned === 'cameras') Icon = <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
    if (cleaned === 'under-18') Icon = <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>;
    return (
      <div key={p} className="p-4 themed-secondary-bg border themed-border rounded-2xl flex items-center gap-3 shadow-sm hover:shadow-md transition-shadow">
        <div className="opacity-50">{Icon}</div>
        <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">No {cleaned}</span>
      </div>
    );
  });

  return (
    <div className="px-6 md:px-12 py-12 max-w-7xl mx-auto space-y-20 animate-in fade-in duration-1000">
      {isCheckoutOpen && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/90 apple-blur overflow-hidden">
          {/* P-7.4: CSS animation replaces GSAP - defined as checkout-in keyframes in index.css */}
          <div className="checkout-pane themed-card w-full max-w-xl rounded-[2.5rem] sm:rounded-[4rem] border themed-border shadow-2xl p-6 sm:p-10 md:p-16 space-y-8 sm:space-y-12 relative overflow-hidden" style={{ animation: 'checkout-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}>
            <div className="absolute top-0 right-0 w-64 h-64 bg-zinc-500/5 rounded-full blur-[80px] -mr-32 -mt-32 pointer-events-none" />

            {/* U-8.1: Clear, human-readable heading */}
            <div className="space-y-1 relative z-10">
              <h2 className="text-2xl sm:text-4xl font-black uppercase tracking-tight themed-text">Order Summary</h2>
              <p className="text-[10px] font-medium themed-text opacity-40">{event.title}</p>
            </div>

            {/* Order details */}
            <div className="themed-secondary-bg rounded-[3rem] p-10 space-y-6 shadow-inner border themed-border relative z-10">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black opacity-30 uppercase tracking-widest">Ticket Type</span>
                <span className="text-lg font-black themed-text uppercase">{selectedTier?.name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black opacity-30 uppercase tracking-widest">Quantity</span>
                <span className="text-lg font-black themed-text">× {qty}</span>
              </div>
              <div className="pt-8 border-t themed-border flex justify-between items-end">
                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-30">Total</span>
                  <p className="text-4xl font-black themed-text tracking-tighter leading-none">R{totalPrice.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</p>
                </div>
                {/* U-8.5: Trust signal — secure checkout badge */}
                <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20">
                  <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                  <span className="text-[9px] font-black text-green-500 uppercase tracking-widest">Secure</span>
                </div>
              </div>

              {/* U-8.4: Fee transparency */}
              <p className="text-[9px] font-medium opacity-40 text-center pt-2">
                Prices are inclusive of all booking fees. Secure payment via PayFast.
              </p>
            </div>

            {/* U-8.3: Promo code field */}
            <div className="relative z-10 space-y-3">
              <button
                type="button"
                onClick={() => setShowPromo(v => !v)}
                className="text-[10px] font-black uppercase tracking-widest opacity-40 hover:opacity-80 transition-all flex items-center gap-2"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                {showPromo ? 'Hide' : 'Have a promo code?'}
              </button>
              {showPromo && (
                <input
                  type="text"
                  value={promoCode}
                  onChange={e => setPromoCode(e.target.value.toUpperCase())}
                  placeholder="Enter promo code"
                  className="w-full px-5 py-3 rounded-2xl themed-secondary-bg border themed-border text-sm font-bold themed-text uppercase tracking-widest placeholder-opacity-30 outline-none focus:ring-2 focus:ring-black dark:focus:ring-white transition-all"
                />
              )}
            </div>

            <div className="space-y-3 relative z-10">
              <button
                onClick={handleFinalPurchase}
                disabled={isProcessing}
                className="w-full py-7 bg-black dark:bg-white text-white dark:text-black rounded-[2.5rem] font-black text-sm uppercase tracking-[0.3em] shadow-2xl flex items-center justify-center gap-4 active:scale-95 transition-all disabled:opacity-60"
              >
                {isProcessing ? <div className="w-6 h-6 border-3 border-current border-t-transparent rounded-full animate-spin" /> : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                    <span>Pay with PayFast</span>
                  </>
                )}
              </button>
              {/* U-8.5: PayFast trust indicators */}
              <div className="flex flex-col items-center gap-4 opacity-40">
                <div className="flex flex-wrap justify-center gap-2">
                  {['Visa', 'Mastercard', 'Amex', 'Apple Pay', 'Samsung Pay'].map(m => (
                    <span key={m} className="px-2 py-1 border themed-border rounded text-[8px] font-black uppercase tracking-widest whitespace-nowrap">{m}</span>
                  ))}
                </div>
                <div className="flex items-center justify-center gap-2">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
                  <span className="text-[9px] font-bold uppercase tracking-widest">Securely Processed via PayFast · 256-bit SSL</span>
                </div>
              </div>
              <button
                onClick={() => { setIsCheckoutOpen(false); setShowPromo(false); setPromoCode(''); }}
                className="w-full py-3 text-[10px] font-black uppercase tracking-widest opacity-30 hover:opacity-70 transition-all"
              >Go Back</button>
            </div>
          </div>
        </div>, document.body
      )}

      {isSeatingModalOpen && selectedTier && (
        <SeatingSelectionModal
          eventId={event.id}
          baseTier={selectedTier as TicketType}
          onClose={() => setIsSeatingModalOpen(false)}
          onConfirmSelection={async (seatIds) => {
            if (!user) { onNavigateAuth(); return; }
            setIsProcessing(true);
            try {
              await onPurchase(seatIds.length, selectedTierId, Array(seatIds.length).fill(user.name), undefined, seatIds);
              setIsSeatingModalOpen(false);
            } catch (err: any) {
              alert(err.message);
            } finally {
              setIsProcessing(false);
            }
          }}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-20 items-start">
        <div className="lg:col-span-5 space-y-12">
          <div className="rounded-[4.5rem] overflow-hidden themed-secondary-bg aspect-[4/5] shadow-2xl border themed-border group">
            <img src={event.image_url} alt={event.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000" />
          </div>
          <div className="hidden lg:flex flex-wrap gap-4">
            {prohibitionsList}
          </div>
        </div>

        <div className="lg:col-span-7 space-y-16">
          <div className="space-y-8">
            <div className="space-y-4">
              <h1 className="text-5xl md:text-7xl font-black tracking-tight themed-text leading-none uppercase">{event.title}</h1>
              <div className="flex flex-wrap items-center gap-4">
                <span className="px-4 py-1.5 bg-black dark:bg-white text-white dark:text-black rounded-full font-bold text-[10px] uppercase tracking-widest">{event.category}</span>
                <span className="text-xs font-bold themed-text opacity-50 uppercase tracking-wider flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  {event.starts_at ? new Date(event.starts_at).toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Date TBA'}
                </span>
                <span className="text-xs font-bold themed-text opacity-50 uppercase tracking-wider flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  {event.venue}
                </span>
              </div>
            </div>
            <p className="text-lg font-medium themed-text opacity-70 leading-relaxed max-w-2xl">{event.description}</p>

            {(event.parking_info || event.is_cooler_box_allowed !== undefined) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                {event.parking_info && (
                  <div className="p-6 rounded-[2rem] themed-secondary-bg border themed-border space-y-2 shadow-sm">
                    <h3 className="text-[10px] font-black uppercase tracking-widest opacity-40">Parking Info</h3>
                    <p className="text-sm font-bold themed-text">{event.parking_info}</p>
                  </div>
                )}
                {event.is_cooler_box_allowed !== undefined && (
                  <div className="p-6 rounded-[2rem] themed-secondary-bg border themed-border space-y-2 shadow-sm">
                    <h3 className="text-[10px] font-black uppercase tracking-widest opacity-40">Cooler Boxes</h3>
                    <p className="text-sm font-bold themed-text">
                      {event.is_cooler_box_allowed
                        ? `Allowed${event.cooler_box_price ? ` — R${event.cooler_box_price}` : ' — Free'}`
                        : 'Not Allowed'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {event.prohibitions && event.prohibitions.length > 0 && (
              <div className="flex lg:hidden flex-wrap gap-4 pt-4">
                {prohibitionsList}
              </div>
            )}

            {/* Organizer Block */}
            {event.organizer && (
              <div className="pt-8 border-t themed-border space-y-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40 italic">Presented By</h3>
                    <p className="text-xl font-black themed-text uppercase tracking-tight">{event.organizer.business_name || event.organizer.name}</p>
                    {event.organizer.organizer_status === 'verified' && (
                      <div className="flex items-center gap-1.5 text-[9px] font-black text-green-500 uppercase tracking-widest mt-1">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                        Verified
                      </div>
                    )}
                  </div>

                  {/* Social Links - Only for Pro/Premium */}
                  {(event.organizer.organizer_tier === 'pro' || event.organizer.organizer_tier === 'premium') && (
                    <div className="flex items-center gap-2">
                      {event.organizer.instagram_handle && (
                        <a href={`https://instagram.com/${event.organizer.instagram_handle.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="p-3 rounded-full themed-secondary-bg border themed-border hover:scale-110 active:scale-90 transition-all group" title="Follow on Instagram">
                          <svg className="w-4 h-4 themed-text opacity-40 group-hover:opacity-100" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.266.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" /></svg>
                        </a>
                      )}
                      {event.organizer.twitter_handle && (
                        <a href={`https://twitter.com/${event.organizer.twitter_handle.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="p-3 rounded-full themed-secondary-bg border themed-border hover:scale-110 active:scale-90 transition-all group" title="Follow on Twitter">
                          <svg className="w-4 h-4 themed-text opacity-40 group-hover:opacity-100" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                        </a>
                      )}
                      {event.organizer.facebook_handle && (
                        <a href={`https://facebook.com/${event.organizer.facebook_handle}`} target="_blank" rel="noopener noreferrer" className="p-3 rounded-full themed-secondary-bg border themed-border hover:scale-110 active:scale-90 transition-all group" title="Follow on Facebook">
                          <svg className="w-4 h-4 themed-text opacity-40 group-hover:opacity-100" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
                        </a>
                      )}
                      {event.organizer.website_url && (
                        <a href={event.organizer.website_url.startsWith('http') ? event.organizer.website_url : `https://${event.organizer.website_url}`} target="_blank" rel="noopener noreferrer" className="p-3 rounded-full themed-secondary-bg border themed-border hover:scale-110 active:scale-90 transition-all group" title="Visit Website">
                          <svg className="w-4 h-4 themed-text opacity-40 group-hover:opacity-100" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Social & Calendar Actions */}
            <div className="flex flex-wrap gap-4 pt-4">
              <button
                onClick={handleShare}
                className="px-6 py-3 rounded-2xl themed-secondary-bg border themed-border font-black text-[10px] uppercase tracking-widest flex items-center gap-3 hover:scale-105 active:scale-95 transition-all shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                {shareText}
              </button>
              <button
                onClick={handleCalendar}
                className="px-6 py-3 rounded-2xl themed-secondary-bg border themed-border font-black text-[10px] uppercase tracking-widest flex items-center gap-3 hover:scale-105 active:scale-95 transition-all shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                Add to Calendar
              </button>
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="text-[11px] font-black uppercase tracking-[0.5em] themed-text opacity-30 ml-8">Access Control Protocols</h3>

            {/* Date Selection Chips */}
            {eventDates.length > 0 && (
              <div className="flex flex-wrap gap-3 px-2 pb-4">
                <button
                  onClick={() => setSelectedDateId(null)}
                  className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${selectedDateId === null
                    ? 'bg-black text-white dark:bg-white dark:text-black scale-105 shadow-lg'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 hover:text-black dark:hover:text-white'
                    }`}
                >
                  All Dates
                </button>
                {eventDates.map(date => (
                  <button
                    key={date.id}
                    onClick={() => setSelectedDateId(date.id)}
                    className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${selectedDateId === date.id
                      ? 'bg-black text-white dark:bg-white dark:text-black scale-105 shadow-lg'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 hover:text-black dark:hover:text-white'
                      }`}
                  >
                    {new Date(date.starts_at).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </button>
                ))}
              </div>
            )}

            {event.status === 'coming_soon' ? (
              <div className="p-8 sm:p-12 bg-purple-50 dark:bg-purple-900/10 border-2 border-purple-500/20 rounded-[3rem] text-center space-y-8 animate-in fade-in slide-in-from-bottom-4">
                <div className="w-20 h-20 mx-auto bg-purple-100 dark:bg-purple-500/20 rounded-full flex items-center justify-center text-purple-600 dark:text-purple-400 text-4xl mb-4 shadow-inner">
                  <Hourglass className="w-10 h-10 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="space-y-4">
                  <h3 className="text-3xl md:text-5xl font-black uppercase tracking-tighter text-purple-900 dark:text-purple-100">Coming Soon</h3>
                  <p className="text-purple-800/70 dark:text-purple-200/70 font-medium max-w-lg mx-auto text-lg leading-relaxed">
                    Be the first to know when tickets drop. Join the waitlist for exclusive early access and launch notifications.
                  </p>
                </div>
                {isJoinedWaitlist ? (
                  <div className="inline-flex items-center gap-3 px-8 py-4 bg-green-500/10 text-green-600 dark:text-green-400 rounded-full font-black text-xs uppercase tracking-widest border border-green-500/20">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                    You're on the list
                  </div>
                ) : (
                  <button
                    onClick={handleJoinWaitlist}
                    disabled={isJoiningWaitlist}
                    className="w-full md:w-auto px-12 py-5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-full font-black text-xs uppercase tracking-widest shadow-xl hover:shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                  >
                    {isJoiningWaitlist ? 'Joining...' : 'Join Waitlist'}
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {filteredTiers.map(t => {
                    // U-8.2: Scarcity signal — show remaining count when < 20 left
                    const remaining = (t.quantity_limit || 0) - (t.quantity_sold || 0) - ((t as any).quantity_reserved || 0);
                    const isLow = remaining > 0 && remaining < 20;
                    const isSoldOut = remaining <= 0 && (t.quantity_limit || 0) > 0;
                    return (
                      <div key={t.id} onClick={() => !isSoldOut && setSelectedTierId(t.id)} className={`p-5 sm:p-8 md:p-10 rounded-[2.5rem] sm:rounded-[3.5rem] border-2 transition-all duration-500 cursor-pointer flex justify-between items-center group shadow-sm ${isSoldOut ? 'opacity-30 cursor-not-allowed border-transparent themed-secondary-bg' : selectedTierId === t.id ? 'border-black dark:border-white themed-card shadow-2xl scale-[1.02]' : 'border-transparent themed-secondary-bg opacity-50 hover:opacity-80'}`}>
                        <div className="space-y-2">
                          <h4 className="text-2xl font-black themed-text uppercase leading-none">{t.name}</h4>
                          {/* U-8.2: Scarcity messaging */}
                          {isSoldOut ? (
                            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-red-400">Sold Out</p>
                          ) : isLow ? (
                            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-amber-500 animate-pulse"><Flame className="inline w-3 h-3 text-amber-500 mr-1" /> Only {remaining} left</p>
                          ) : (
                            <p className="text-[9px] font-black uppercase tracking-[0.3em] opacity-30">
                              {t.event_date_id ? 'Specific Date' : 'All Dates'}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="text-2xl sm:text-4xl font-black themed-text tracking-tighter">R{t.price}</span>
                        </div>
                      </div>
                    );
                  })}
                  {filteredTiers.length === 0 && (
                    <div className="p-12 rounded-[3rem] border-2 border-dashed border-zinc-200 dark:border-zinc-800 flex flex-col items-center justify-center gap-4 opacity-50">
                      <TicketIcon className="w-10 h-10 opacity-50" />
                      <p className="text-xs font-black uppercase tracking-widest">No tickets available for this date</p>
                    </div>
                  )}
                </div>

                <div className="p-6 sm:p-10 md:p-12 bg-black dark:bg-white text-white dark:text-black rounded-[3rem] sm:rounded-[4rem] shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-6 sm:gap-10">
                  <div className="flex items-center gap-10">
                    {/* A-6.2: quantity capped at MAX_QTY (20) client-side; server also enforces */}
                    <button onClick={() => setQty(Math.max(1, qty - 1))} className="w-16 h-16 rounded-full border-4 border-current flex items-center justify-center font-black text-2xl hover:bg-white/10 active:scale-90 transition-all">-</button>
                    <span className="text-5xl font-black tracking-tighter">{qty}</span>
                    <button onClick={() => setQty(Math.min(MAX_QTY, qty + 1))} className="w-16 h-16 rounded-full border-4 border-current flex items-center justify-center font-black text-2xl hover:bg-white/10 active:scale-90 transition-all" disabled={qty >= MAX_QTY}>+</button>
                  </div>
                  <button
                    onClick={() => {
                      if (event.is_seated) setIsSeatingModalOpen(true);
                      else setIsCheckoutOpen(true);
                    }}
                    className="w-full md:w-auto px-12 py-6 bg-black dark:bg-white text-white dark:text-black rounded-full font-bold text-sm uppercase tracking-widest shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-4"
                  >
                    <span>{event.is_seated ? 'Select Seats' : `Get Tickets — R${totalPrice}`}</span>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                  </button>
                </div>
              </>
            )}

            <div className="flex items-center gap-6 px-10">
              <div className="flex -space-x-4">
                {attendees.map(profile => (
                  <div key={profile.id} className="w-10 h-10 rounded-full border-4 border-white dark:border-black themed-secondary-bg overflow-hidden flex items-center justify-center bg-zinc-100 dark:bg-zinc-800">
                    {profile.avatar_url ? (
                      <img src={profile.avatar_url} alt={profile.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[10px] font-black uppercase">{profile.name.substring(0, 2)}</span>
                    )}
                  </div>
                ))}
                {attendees.length === 0 && (
                  <div className="w-10 h-10 rounded-full border-4 border-white dark:border-black themed-secondary-bg" />
                )}
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest opacity-40">
                {totalAttendees > 0
                  ? `Join ${totalAttendees >= 10 ? `${Math.round(totalAttendees / 10) * 10}+` : totalAttendees} attendee${totalAttendees !== 1 ? 's' : ''} securing assets for this performance.`
                  : `Be the first to secure assets for this performance.`}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
