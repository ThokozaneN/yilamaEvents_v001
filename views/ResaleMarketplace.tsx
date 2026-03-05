import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Event as AppEvent } from '../types';
import { Toast, ToastType } from '../components/Toast';

export const ResaleMarketplaceView: React.FC<{
    user: any;
    events: AppEvent[];
    onNavigate: (view: string) => void;
}> = ({ user, events, onNavigate }) => {
    const [activeTab, setActiveTab] = useState<'browse' | 'my_listings'>('browse');
    const [listings, setListings] = useState<any[]>([]);
    const [myListings, setMyListings] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [toast, setToast] = useState<{ message: string, type: ToastType } | null>(null);

    const showToast = (message: string, type: ToastType = 'info') => {
        setToast({ message, type });
    };

    const fetchListings = useCallback(async () => {
        setIsLoading(true);
        try {
            // Fetch public active listings
            const { data: publicData, error: publicErr } = await supabase
                .from('resale_listings')
                .select(`
          id, resale_price, original_price, status, created_at,
          ticket:tickets(public_id, event_id, ticket_type:ticket_types(name))
        `)
                .eq('status', 'active');

            if (publicErr) throw publicErr;

            // Filter out user's own listings from public browse
            const browseable = (publicData || []).filter(l => l.seller_user_id !== user?.id);

            // We map the event data manually here for performance
            const enrichedBrowse = browseable.map(l => ({
                ...l,
                event: events.find(e => e.id === l.ticket?.event_id)
            })).filter(l => l.event); // Only show if we know the event

            setListings(enrichedBrowse);

            // Fetch user's own listings (including sold/cancelled history)
            if (user) {
                const { data: myData, error: myErr } = await supabase
                    .from('resale_listings')
                    .select(`
              id, resale_price, original_price, status, created_at,
              ticket:tickets(public_id, event_id, ticket_type:ticket_types(name))
            `)
                    .eq('seller_user_id', user.id)
                    .order('created_at', { ascending: false });

                if (!myErr && myData) {
                    const enrichedMine = myData.map(l => ({
                        ...l,
                        event: events.find(e => e.id === l.ticket?.event_id)
                    }));
                    setMyListings(enrichedMine);
                }
            }

        } catch (err: any) {
            console.error("Failed to fetch listings", err);
        } finally {
            setIsLoading(false);
        }
    }, [user, events]);

    useEffect(() => {
        fetchListings();
    }, [fetchListings]);

    const handleBuy = async (listingId: string) => {
        if (!user) {
            onNavigate('auth');
            return;
        }

        if (!confirm("Are you sure you want to purchase this ticket from the marketplace?")) return;

        setIsProcessing(true);
        try {
            const { data, error } = await supabase.rpc('purchase_resale_ticket', {
                p_listing_id: listingId
            });

            if (error) throw error;
            if (!data.success) throw new Error(data.message);

            showToast("Purchase successful! Ticket is in your Wallet.", "success");
            fetchListings(); // Refresh UI
            setTimeout(() => onNavigate('wallet'), 1500);

        } catch (err: any) {
            showToast(err.message, "error");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleCancelListing = async (ticketPublicId: string) => {
        if (!confirm("Remove this listing from the marketplace?")) return;

        setIsProcessing(true);
        try {
            const { data, error } = await supabase.rpc('cancel_ticket_resale', {
                p_ticket_public_id: ticketPublicId
            });

            if (error) throw error;
            if (!data.success) throw new Error(data.message);

            showToast("Listing cancelled.", "success");
            fetchListings();
        } catch (err: any) {
            showToast(err.message, "error");
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="px-6 md:px-12 py-12 max-w-7xl mx-auto space-y-12 animate-in fade-in pb-32">
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

            <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-4">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-500">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        <span className="text-[10px] font-black uppercase tracking-widest">Escrow Protected</span>
                    </div>
                    <h1 className="text-5xl md:text-7xl font-black tracking-tighter themed-text leading-none uppercase">Ticket<br />Exchange</h1>
                    <p className="text-zinc-500 font-medium text-lg max-w-md">Secure, fan-to-fan verified ticket resale marketplace.</p>
                </div>

                <div className="flex bg-zinc-100 dark:bg-white/5 p-1 rounded-full border themed-border w-fit shrink-0 shrink-0">
                    <button onClick={() => setActiveTab('browse')} className={`px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'browse' ? 'bg-black dark:bg-white text-white dark:text-black shadow-lg' : 'themed-text opacity-50'}`}>Buy Tickets</button>
                    <button onClick={() => setActiveTab('my_listings')} className={`px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'my_listings' ? 'bg-black dark:bg-white text-white dark:text-black shadow-lg' : 'themed-text opacity-50'}`}>My Listings</button>
                </div>
            </header>

            {/* BROWSE LISTINGS */}
            {activeTab === 'browse' && (
                <div className="space-y-6">
                    {isLoading ? (
                        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-black dark:border-white border-t-transparent flex rounded-full animate-spin"></div></div>
                    ) : listings.length === 0 ? (
                        <div className="text-center py-32 border border-dashed themed-border rounded-[3rem] opacity-50">
                            <p className="font-bold uppercase tracking-widest text-xs">No active listings available</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {listings.map(l => (
                                <div key={l.id} className="themed-card border themed-border rounded-[2.5rem] bg-white dark:bg-zinc-900 overflow-hidden flex flex-col hover:-translate-y-1 transition-transform shadow-lg group">
                                    <div className="aspect-[21/9] relative overflow-hidden">
                                        <img src={l.event?.image_url} className="w-full h-full object-cover opacity-80 group-hover:scale-105 transition-transform duration-700" alt="" />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                                        <div className="absolute bottom-4 left-4">
                                            <h3 className="text-white font-black text-xl leading-tight">{l.event?.title || 'Unknown Event'}</h3>
                                            <p className="text-white/60 text-[9px] uppercase font-bold tracking-widest mt-1">{l.ticket?.ticket_type?.name || 'General Admission'}</p>
                                        </div>
                                    </div>
                                    <div className="p-6 flex flex-col gap-6 flex-1 justify-between">
                                        <div className="flex justify-between items-center bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                                            <div>
                                                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 mb-1">Face Value</p>
                                                <p className="font-bold text-zinc-500 line-through">R{l.original_price}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[9px] font-black uppercase tracking-widest text-blue-500 mb-1">Listed Price</p>
                                                <p className="font-black text-2xl themed-text">R{l.resale_price}</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleBuy(l.id)}
                                            disabled={isProcessing}
                                            className="w-full py-4 bg-black dark:bg-white text-white dark:text-black rounded-2xl font-black text-[10px] uppercase tracking-widest hover:scale-[0.98] transition-transform shadow-xl disabled:opacity-50"
                                        >
                                            Buy Now
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* MY LISTINGS */}
            {activeTab === 'my_listings' && (
                <div className="space-y-6">
                    {!user ? (
                        <div className="text-center py-20"><p className="text-zinc-500">Please log in to view your listings.</p></div>
                    ) : isLoading ? (
                        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-black dark:border-white border-t-transparent flex rounded-full animate-spin"></div></div>
                    ) : myListings.length === 0 ? (
                        <div className="text-center py-32 border border-dashed themed-border rounded-[3rem] opacity-50">
                            <p className="font-bold uppercase tracking-widest text-xs">You have no active listings</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {myListings.map(l => (
                                <div key={l.id} className="p-6 border themed-border rounded-[2rem] flex flex-col sm:flex-row justify-between sm:items-center gap-6 bg-zinc-50 dark:bg-zinc-800/30">
                                    <div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className={`w-2 h-2 rounded-full ${l.status === 'active' ? 'bg-green-500 animate-pulse' : l.status === 'sold' ? 'bg-blue-500' : 'bg-red-500'}`} />
                                            <span className="text-[9px] font-black uppercase tracking-widest opacity-60">{l.status}</span>
                                        </div>
                                        <h4 className="font-black text-lg themed-text">{l.event?.title || 'Unknown Event'}</h4>
                                        <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 mt-1">Ticket: {l.ticket?.public_id.split('-')[0]}... ({l.ticket?.ticket_type?.name})</p>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        <div className="text-right">
                                            <p className="text-[9px] font-black uppercase tracking-widest opacity-40">Price</p>
                                            <p className="font-black themed-text">R{l.resale_price}</p>
                                        </div>
                                        {l.status === 'active' && (
                                            <button
                                                onClick={() => handleCancelListing(l.ticket?.public_id)}
                                                disabled={isProcessing}
                                                className="px-6 py-3 bg-red-50 text-red-600 dark:bg-red-500/10 border border-red-500/20 rounded-full text-[9px] font-black uppercase tracking-widest transition-colors hover:bg-red-100 disabled:opacity-50"
                                            >
                                                Cancel
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

        </div>
    );
};
