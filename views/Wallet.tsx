import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Ticket, TicketStatus, TicketTransfer, Profile } from '../types';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '../lib/supabase';
import { downloadICS } from '../lib/calendar';
import { logError } from '../lib/monitoring';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TicketGroup {
  eventId: string;
  event: Ticket['event'];
  tickets: Ticket[];
  count: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatDate = (dateStr?: string) => {
  if (!dateStr) return 'TBA';
  return new Date(dateStr).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

const formatTime = (dateStr?: string) => {
  if (!dateStr) return 'TBA';
  return new Date(dateStr).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};

// ─── Ticket Card (grouped) ────────────────────────────────────────────────────

const TicketCard: React.FC<{ group: TicketGroup; onClick: (ticket: Ticket) => void }> = ({ group, onClick }) => {
  const ticket = group.tickets[0]; // representative ticket
  if (!ticket) return null; // Defensive guard
  const hasImage = !!ticket.event?.image_url;

  return (
    <div
      onClick={() => onClick(ticket)}
      className="cursor-pointer group select-none"
      style={{ perspective: '1000px' }}
    >
      {/* Stack shadow for multiple tickets */}
      {group.count > 1 && (
        <>
          <div className="absolute inset-x-4 -bottom-3 h-full rounded-[28px] bg-black/10 dark:bg-white/5 blur-sm" />
          <div className="absolute inset-x-2 -bottom-1.5 h-full rounded-[28px] themed-card border themed-border opacity-60" />
        </>
      )}

      {/* Main ticket body */}
      <div className="relative rounded-[28px] overflow-hidden shadow-xl border themed-border group-hover:-translate-y-2 group-hover:shadow-2xl transition-all duration-500 themed-card">

        {/* === TOP — Event image + info === */}
        <div className="relative h-40 overflow-hidden bg-zinc-900">
          {hasImage ? (
            <img src={ticket.event?.image_url} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt="" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-violet-600 to-indigo-800" />
          )}
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

          {/* Count badge */}
          {group.count > 1 && (
            <div className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white text-black flex items-center justify-center font-black text-sm shadow-lg">
              {group.count}
            </div>
          )}

          {/* Ticket tier badge */}
          <div className="absolute top-3 left-3 px-3 py-1 bg-white/15 backdrop-blur-md rounded-full text-white text-[9px] font-black uppercase tracking-widest border border-white/20">
            {ticket.ticket_type?.name || 'General'}
          </div>

          {/* Event title */}
          <div className="absolute bottom-4 left-4 right-4">
            <h3 className="text-white font-black text-lg leading-tight tracking-tight line-clamp-2">
              {ticket.event?.title}
            </h3>
          </div>
        </div>

        {/* === PERFORATION LINE === */}
        <div className="relative flex items-center">
          {/* Left notch */}
          <div className="absolute -left-3 w-6 h-6 rounded-full bg-zinc-100 dark:bg-zinc-900 border themed-border z-10" />
          {/* Right notch */}
          <div className="absolute -right-3 w-6 h-6 rounded-full bg-zinc-100 dark:bg-zinc-900 border themed-border z-10" />
          {/* Dashed line */}
          <div className="flex-1 mx-4 border-t-2 border-dashed themed-border opacity-40" />
        </div>

        {/* === BOTTOM — Details stub === */}
        <div className="px-5 py-4 flex items-center justify-between gap-4">
          {/* Date & Venue */}
          <div className="space-y-1 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest opacity-40 themed-text">Date</p>
            <p className="text-sm font-bold themed-text truncate">{formatDate(ticket.event?.starts_at)}</p>
            <p className="text-[10px] font-bold opacity-50 themed-text truncate">{ticket.event?.venue || 'Venue TBA'}</p>
          </div>

          {/* Mini QR / barcode strip */}
          <div className="shrink-0 flex flex-col items-center gap-1">
            <div className="w-12 h-12 bg-zinc-100 dark:bg-zinc-800 rounded-lg flex items-center justify-center overflow-hidden">
              <QRCodeSVG value={ticket.qr_payload || ticket.public_id || ticket.id} size={44} level="L" />
            </div>
            <p className="text-[10px] font-mono text-center font-bold text-black dark:text-white w-14 truncate tracking-wider">{ticket.public_id?.slice(0, 8) || 'TICKETID'}</p>
          </div>
        </div>

        {/* Bottom status bar */}
        <div className="px-5 pb-4 flex items-center justify-between">
          <div className="absolute top-4 right-4 z-10">
            <div className="bg-green-500/20 backdrop-blur-md px-2 py-1 rounded text-[10px] items-center gap-1.5 flex uppercase font-bold tracking-wider text-green-400">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              {ticket.status}
            </div>
          </div>
          <svg className="w-4 h-4 opacity-30 themed-text group-hover:opacity-70 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </div>
  );
};

// ─── Main Wallet View ─────────────────────────────────────────────────────────

export const WalletView: React.FC<{ user: Profile; tickets: Ticket[]; onNavigate?: (view: string) => void }> = ({ user, tickets, onNavigate }) => {
  const [selectedTicketIdx, setSelectedTicketIdx] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'valid' | 'transfers' | 'waitlists'>('valid');
  const [transfers, setTransfers] = useState<TicketTransfer[]>([]);
  const [waitlists, setWaitlists] = useState<any[]>([]);
  const [transferMode, setTransferMode] = useState<'gift' | 'transfer_sell' | 'market_list'>('gift');
  const [toEmail, setToEmail] = useState('');
  const [resalePrice, setResalePrice] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const touchStartX = React.useRef<number>(0);

  // All valid tickets as a flat list for navigation
  const allValidTickets = useMemo(() => tickets.filter(t => t.status === TicketStatus.VALID), [tickets]);
  const selectedTicket = selectedTicketIdx !== null ? allValidTickets[selectedTicketIdx] ?? null : null;

  const openTicket = useCallback((ticket: Ticket) => {
    const idx = allValidTickets.findIndex(t => t.id === ticket.id);
    setSelectedTicketIdx(idx >= 0 ? idx : 0);
    setIsFlipped(false);
  }, [allValidTickets]);

  const navigate = useCallback((dir: 1 | -1) => {
    setSelectedTicketIdx(prev => {
      if (prev === null) return null;
      const next = prev + dir;
      if (next < 0 || next >= allValidTickets.length) return prev;
      setIsFlipped(false);
      return next;
    });
  }, [allValidTickets.length]);

  const closeOverlay = useCallback(() => { setSelectedTicketIdx(null); setIsFlipped(false); }, []);

  // Keyboard navigation
  useEffect(() => {
    if (selectedTicketIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') navigate(-1);
      if (e.key === 'ArrowRight') navigate(1);
      if (e.key === 'Escape') closeOverlay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedTicketIdx, navigate, closeOverlay]);

  const fetchTransfers = useCallback(async () => {
    const { data } = await supabase.from('v_my_transfers').select('*');
    if (data) setTransfers(data);
  }, []);

  useEffect(() => { fetchTransfers(); }, [fetchTransfers]);
  useEffect(() => { if (selectedTicket === null) setIsFlipped(false); }, [selectedTicket]);

  useEffect(() => {
    const fetchWaitlists = async () => {
      if (!user?.id) return;
      const { data } = await supabase
        .from('event_waitlists')
        .select('*, event:events(*)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (data) setWaitlists(data);
    };
    fetchWaitlists();
  }, [user.id]);

  // Hide the floating navbar while a ticket overlay is open (avoids blocking the Manage button on mobile)
  useEffect(() => {
    if (selectedTicketIdx !== null) {
      document.body.classList.add('ticket-overlay-open');
    } else {
      document.body.classList.remove('ticket-overlay-open');
    }
    return () => document.body.classList.remove('ticket-overlay-open');
  }, [selectedTicketIdx]);

  // Group valid tickets by event
  const ticketGroups = useMemo<TicketGroup[]>(() => {
    const valid = tickets.filter(t => t.status === TicketStatus.VALID);
    const map = new Map<string, TicketGroup>();
    for (const t of valid) {
      const key = t.event_id || t.id;
      if (map.has(key)) {
        map.get(key)!.tickets.push(t);
        map.get(key)!.count++;
      } else {
        map.set(key, { eventId: key, event: t.event, tickets: [t], count: 1 });
      }
    }
    return Array.from(map.values());
  }, [tickets]);

  const handleInitiateAction = async () => {
    if (!selectedTicket || isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (transferMode === 'market_list') {
        const price = parseFloat(resalePrice);
        if (isNaN(price) || price <= 0) throw new Error('Valid price required.');
        const { data, error } = await supabase.rpc('list_ticket_for_resale', {
          p_ticket_public_id: selectedTicket.public_id,
          p_resale_price: price,
        });
        if (error) throw error;
        if (!data.success) throw new Error(data.message);
        alert('Ticket listed on the global marketplace securely!');
      } else {
        if (!toEmail) throw new Error('Recipient email required');
        const { error } = await supabase.rpc('initiate_transfer', {
          p_ticket_id: selectedTicket.id,
          p_to_email: toEmail,
          p_transfer_type: transferMode === 'transfer_sell' ? 'resale' : 'gift',
          p_resale_price: transferMode === 'transfer_sell' ? parseFloat(resalePrice) : null,
        });
        if (error) throw error;
        alert('Direct Transfer Initiated Successfully');
      }
      closeOverlay();
      fetchTransfers();
    } catch (err: any) {
      alert(err.message);
      logError(err); // Log the error
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRespond = async (id: string, accept: boolean) => {
    try {
      const { error } = await supabase.rpc('respond_to_transfer', { p_transfer_id: id, p_accept: accept });
      if (error) throw error;
      fetchTransfers();
    } catch (err: any) {
      alert(err.message);
      logError(err); // Log the error
    }
  };

  const handleShareTicket = async () => {
    if (!selectedTicket?.event) return;
    const shareData = {
      title: "I'm going to " + selectedTicket.event.title + "!",
      text: "I just secured my ticket for " + selectedTicket.event.title + ". Get yours on Yilama Events!",
      url: window.location.origin,
    };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch (e) { console.log(e); }
    } else {
      navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
      alert('Copied to clipboard!');
    }
  };

  const handleCalendarTicket = () => {
    if (!selectedTicket?.event) return;
    downloadICS({
      title: selectedTicket.event.title,
      description: selectedTicket.event.description || 'Yilama Event Ticket',
      location: selectedTicket.event.venue || 'TBA',
      startTime: selectedTicket.event?.starts_at || new Date().toISOString(),
      endTime: selectedTicket.event?.ends_at || new Date().toISOString(),
      url: window.location.origin,
    }, `${selectedTicket.event.title.replace(/\s+/g, '_')}_ticket.ics`);
  };

  return (
    <div className="px-4 sm:px-6 md:px-12 py-8 sm:py-12 max-w-7xl mx-auto space-y-10 sm:space-y-12">

      {/* ── Header ── */}
      <header className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 sm:gap-6">
        <div className="space-y-2">
          <h1 className="text-5xl sm:text-6xl font-bold tracking-tighter themed-text">Vault</h1>
          <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Digital Asset Management</p>
        </div>
        <div className="flex w-full sm:w-auto bg-zinc-100 dark:bg-white/5 p-1 rounded-full border themed-border">
          <button onClick={() => setActiveTab('valid')} className={`flex-1 sm:flex-none px-4 sm:px-6 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${activeTab === 'valid' ? 'bg-black dark:bg-white text-white dark:text-black shadow-lg' : 'themed-text opacity-40'}`}>
            Tickets {ticketGroups.length > 0 && <span className="ml-1 opacity-60">({ticketGroups.length})</span>}
          </button>
          <button onClick={() => setActiveTab('transfers')} className={`flex-1 sm:flex-none px-4 sm:px-6 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${activeTab === 'transfers' ? 'bg-black dark:bg-white text-white dark:text-black shadow-lg' : 'themed-text opacity-40'}`}>Marketplace</button>
          <button onClick={() => setActiveTab('waitlists')} className={`flex-1 sm:flex-none px-4 sm:px-6 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${activeTab === 'waitlists' ? 'bg-black dark:bg-white text-white dark:text-black shadow-lg' : 'themed-text opacity-40'}`}>
            Waitlist {waitlists.length > 0 && <span className="ml-1 opacity-60">({waitlists.length})</span>}
          </button>
          {onNavigate && (
            <button onClick={() => onNavigate('resale')} className="hidden sm:inline-block flex-1 sm:flex-none px-4 sm:px-6 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all themed-text opacity-40 hover:opacity-100 hover:bg-zinc-200 dark:hover:bg-white/10">Exchange</button>
          )}
        </div>
      </header>

      {/* ── Tickets Tab ── */}
      {activeTab === 'valid' && (
        <>
          {ticketGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 space-y-4 text-center">
              <div className="w-20 h-20 rounded-full bg-zinc-100 dark:bg-white/5 flex items-center justify-center mb-2">
                <svg className="w-9 h-9 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                </svg>
              </div>
              <p className="text-xl font-black themed-text opacity-30">No tickets yet</p>
              <p className="text-sm opacity-30 themed-text">Your purchased tickets will appear here</p>
              {onNavigate && (
                <button onClick={() => onNavigate('explore')} className="mt-4 px-8 py-3 bg-black dark:bg-white text-white dark:text-black rounded-full font-black text-[10px] uppercase tracking-widest">
                  Explore Events
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {ticketGroups.map(group => (
                <div key={group.eventId} className="relative pb-3">
                  <TicketCard group={group} onClick={openTicket} />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Transfers Tab ── */}
      {activeTab === 'transfers' && (
        <div className="space-y-6">
          {transfers.length === 0
            ? <p className="text-center opacity-30 py-20 italic">No marketplace activity found.</p>
            : transfers.map(tr => (
              <div key={tr.id} className="p-8 themed-card border themed-border rounded-[2.5rem] flex flex-col md:flex-row justify-between items-center gap-6">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`text-[8px] font-black px-3 py-1 rounded-full uppercase tracking-widest ${tr.direction === 'sent' ? 'bg-blue-500 text-white' : 'bg-orange-500 text-white'}`}>{tr.direction}</span>
                    <span className="text-[10px] font-bold themed-text opacity-40">{tr.transfer_type.toUpperCase()}</span>
                  </div>
                  <h4 className="text-lg font-black themed-text">{tr.event_title}</h4>
                  <p className="text-[10px] font-bold opacity-30 uppercase">{tr.direction === 'sent' ? `To: ${tr.to_email}` : `From: ${tr.from_user_id}`}</p>
                </div>
                <div className="flex items-center gap-4">
                  {tr.direction === 'received' && tr.status === 'pending' && (
                    <>
                      <button onClick={() => handleRespond(tr.id, true)} className="px-6 py-2.5 bg-green-500 text-white rounded-full font-black text-[9px] uppercase tracking-widest shadow-lg">Accept</button>
                      <button onClick={() => handleRespond(tr.id, false)} className="px-6 py-2.5 bg-red-500 text-white rounded-full font-black text-[9px] uppercase tracking-widest shadow-lg">Decline</button>
                    </>
                  )}
                  {tr.status !== 'pending' && <span className="text-[10px] font-black uppercase tracking-widest themed-text opacity-40">{tr.status}</span>}
                </div>
              </div>
            ))
          }
        </div>
      )}

      {/* ── Waitlists Tab ── */}
      {activeTab === 'waitlists' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {waitlists.length === 0 ? (
            <div className="col-span-full py-20 text-center opacity-30">
              <p className="italic">You are not on any waitlists.</p>
            </div>
          ) : (
            waitlists.map(w => (
              <div key={w.id} className="relative rounded-[2.5rem] overflow-hidden shadow-xl border themed-border themed-card group">
                <div className="h-40 relative">
                  {w.event?.image_url ? (
                    <img src={w.event.image_url} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt={w.event.title} />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-indigo-600 to-purple-800" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                  <div className="absolute top-4 right-4 px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-white text-[9px] font-black uppercase tracking-widest border border-white/20">
                    {w.status === 'waiting' ? 'Waiting' : w.status}
                  </div>
                  <div className="absolute bottom-4 left-4 right-4">
                    <h3 className="text-white font-black text-lg leading-tight truncate">{w.event?.title}</h3>
                  </div>
                </div>
                <div className="p-6">
                  <p className="text-sm font-bold themed-text">{formatDate(w.event?.starts_at)}</p>
                  <p className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest mt-1">
                    {w.status === 'notified' ? 'Tickets Available Now' : 'Pending Launch'}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Ticket Detail Overlay ── */}
      {selectedTicket && selectedTicketIdx !== null && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/60 apple-blur animate-in fade-in duration-300"
          onClick={(e) => { if (e.target === e.currentTarget) closeOverlay(); }}
        >
          {/* Desktop: Left arrow */}
          {allValidTickets.length > 1 && (
            <button
              onClick={() => navigate(-1)}
              className={`hidden sm:flex absolute left-4 xl:left-8 w-12 h-12 items-center justify-center bg-white/10 hover:bg-white/25 backdrop-blur-md rounded-full text-white transition-all z-50 ${selectedTicketIdx === 0 ? 'opacity-20 pointer-events-none' : ''}`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
            </button>
          )}

          {/* Desktop: Right arrow */}
          {allValidTickets.length > 1 && (
            <button
              onClick={() => navigate(1)}
              className={`hidden sm:flex absolute right-4 xl:right-8 w-12 h-12 items-center justify-center bg-white/10 hover:bg-white/25 backdrop-blur-md rounded-full text-white transition-all z-50 ${selectedTicketIdx === allValidTickets.length - 1 ? 'opacity-20 pointer-events-none' : ''}`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg>
            </button>
          )}

          <div
            className="relative w-full max-w-sm"
            style={{ perspective: '1000px' }}
            onTouchStart={(e) => {
              const touch = e.touches[0];
              if (touch) touchStartX.current = touch.clientX;
            }}
            onTouchEnd={(e) => {
              const touch = e.changedTouches[0];
              if (!touch) return;
              const delta = touchStartX.current - touch.clientX;
              if (Math.abs(delta) > 50) navigate(delta > 0 ? 1 : -1);
            }}
          >
            {/* Counter & Close row */}
            <div className="flex items-center justify-between mb-3 px-1">
              {allValidTickets.length > 1
                ? <span className="text-white/60 text-[10px] font-black uppercase tracking-widest">{selectedTicketIdx + 1} / {allValidTickets.length}</span>
                : <span />}
              <button
                onClick={closeOverlay}
                className="w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white transition-all"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Flip Card */}
            <div className={`relative w-full aspect-[9/16] transition-all duration-700 ${isFlipped ? '[transform:rotateY(180deg)]' : ''}`} style={{ transformStyle: 'preserve-3d' }}>

              {/* === FRONT: Ticket QR pass === */}
              <div className="absolute inset-0 rounded-[3rem] overflow-hidden shadow-2xl flex flex-col bg-white" style={{ backfaceVisibility: 'hidden' }}>

                {/* Top image band */}
                <div className="relative h-48">
                  {selectedTicket.event?.image_url ? (
                    <img src={selectedTicket.event.image_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-violet-600 to-indigo-800" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  <div className="absolute bottom-4 left-5 right-5">
                    <p className="text-white/60 text-[9px] font-black uppercase tracking-widest mb-1">
                      {selectedTicket.ticket_type?.name || 'General Admission'}
                    </p>
                    <h4 className="text-xl font-black text-white leading-tight tracking-tight">{selectedTicket.event?.title}</h4>
                  </div>
                </div>

                {/* Tear line */}
                <div className="relative flex items-center bg-white">
                  <div className="absolute -left-3 w-6 h-6 rounded-full bg-zinc-100 z-10" />
                  <div className="absolute -right-3 w-6 h-6 rounded-full bg-zinc-100 z-10" />
                  <div className="flex-1 mx-4 border-t-2 border-dashed border-zinc-200" />
                </div>

                {/* QR section */}
                <div className="flex-1 bg-white flex flex-col items-center justify-center px-8 py-6 space-y-4">
                  <div className="text-center">
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Admit One</p>
                    <p className="text-xl font-black text-black tracking-tight mt-0.5">{selectedTicket.attendee_name || selectedTicket.metadata?.attendee_name || 'Ticket Holder'}</p>
                  </div>

                  <div className="p-3 bg-white rounded-2xl shadow-inner border border-zinc-100">
                    <QRCodeSVG
                      value={selectedTicket.qr_payload || selectedTicket.public_id || selectedTicket.id}
                      size={170}
                      level="H"
                      imageSettings={{
                        src: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iYmxhY2siIHJ4PSIyNSIvPjx0ZXh0IHg9IjUwIiB5PSI3MCIgZmlsbD0id2hpdGUiIGZvbnQtc2l6ZT0iNjAiIGZvbnQtd2VpZ2h0PSJib2xkIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0iQXBwbGUgU0QsIEFyaWFsIj5ZPC90ZXh0Pjwvc3ZnPg==",
                        height: 36, width: 36, excavate: true,
                      }}
                    />
                  </div>

                  <p className="text-xs font-mono font-bold text-zinc-500 tracking-widest text-center">{selectedTicket.public_id?.slice(0, 8)}...{selectedTicket.public_id?.slice(-4)}</p>
                </div>

                {/* Footer */}
                <div className="p-5 bg-zinc-50 border-t border-zinc-100">
                  <button onClick={() => setIsFlipped(true)} className="w-full py-3.5 bg-black text-white rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 group">
                    <span>Manage & Details</span>
                    <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                  </button>
                </div>
              </div>

              {/* === BACK: Details & Actions === */}
              <div className="absolute inset-0 rounded-[3rem] overflow-hidden shadow-2xl flex flex-col bg-zinc-900 text-white" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                <div className="p-7 space-y-6 flex-1 overflow-y-auto">
                  {/* Event Details */}
                  <div className="space-y-3">
                    <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Event Details</h3>
                    <div className="flex gap-3 items-start">
                      <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-400 shrink-0">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">{selectedTicket.event?.venue || 'Venue TBA'}</p>
                      </div>
                    </div>
                    <div className="flex gap-3 items-start">
                      <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-400 shrink-0">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">{formatDate(selectedTicket.event?.starts_at)}</p>
                        <p className="text-xs text-zinc-500">{formatTime(selectedTicket.event?.starts_at)} – {formatTime(selectedTicket.event?.ends_at)}</p>
                      </div>
                    </div>
                    {/* Social & calendar actions */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button onClick={handleShareTicket} className="px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 font-bold text-[9px] uppercase tracking-widest text-white flex items-center gap-1.5 hover:bg-zinc-700 transition-colors">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                        Brag
                      </button>
                      <button onClick={handleCalendarTicket} className="px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 font-bold text-[9px] uppercase tracking-widest text-white flex items-center gap-1.5 hover:bg-zinc-700 transition-colors">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        Add to Cal
                      </button>
                    </div>
                  </div>

                  {/* Ticket Actions */}
                  <div className="space-y-3 pt-4 border-t border-zinc-800">
                    <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Ticket Actions</h3>
                    <div className="grid grid-cols-3 gap-1 p-1 bg-zinc-800 rounded-2xl border border-zinc-700">
                      <button onClick={() => setTransferMode('gift')} className={`py-2 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all ${transferMode === 'gift' ? 'bg-white text-black shadow-lg' : 'text-zinc-500 hover:text-white'}`}>Gift</button>
                      <button onClick={() => setTransferMode('transfer_sell')} className={`py-2 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all ${transferMode === 'transfer_sell' ? 'bg-white text-black shadow-lg' : 'text-zinc-500 hover:text-white'}`}>Direct Sell</button>
                      <button onClick={() => { setTransferMode('market_list'); setResalePrice(String(selectedTicket.gross_amount)); }} className={`py-2 rounded-xl text-[8px] font-black uppercase tracking-widest overflow-hidden whitespace-nowrap px-1 transition-all ${transferMode === 'market_list' ? 'bg-blue-500 text-white' : 'text-zinc-500 hover:text-white'}`}>List Public</button>
                    </div>

                    {transferMode !== 'market_list' && (
                      <input value={toEmail} onChange={e => setToEmail(e.target.value)} placeholder="Recipient Email" className="w-full bg-zinc-800 border-2 border-zinc-700 rounded-xl px-4 py-3 font-bold text-white text-xs outline-none focus:border-white transition-colors" />
                    )}

                    {(transferMode === 'transfer_sell' || transferMode === 'market_list') && (
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 font-bold">R</span>
                        <input type="number" value={resalePrice} onChange={e => setResalePrice(e.target.value)} placeholder="Price" className="w-full bg-zinc-800 border-2 border-zinc-700 rounded-xl pl-10 pr-4 py-3 font-bold text-white text-sm outline-none focus:border-white transition-colors" />
                        {transferMode === 'market_list' && (
                          <p className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold px-1 mt-1">Max: R{(selectedTicket.gross_amount * 1.10).toFixed(2)} (110% face value)</p>
                        )}
                      </div>
                    )}

                    <button onClick={handleInitiateAction} disabled={isSubmitting || (transferMode !== 'market_list' && !toEmail)} className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                      {isSubmitting ? 'Processing...' : transferMode === 'market_list' ? 'List on Marketplace' : 'Confirm Action'}
                    </button>
                  </div>
                </div>

                <div className="p-5 bg-zinc-900 border-t border-zinc-800">
                  <button onClick={() => setIsFlipped(false)} className="w-full py-3.5 bg-zinc-800 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-zinc-700 transition-colors flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                    Show QR Code
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
