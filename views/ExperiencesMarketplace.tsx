import React, { useState, useEffect } from 'react';
import { Toast, ToastType } from '../components/Toast';
import { MainModuleNav } from '../components/MainModuleNav';
import { supabase } from '../lib/supabase';
import { EventCardSkeleton } from '../components/Skeleton';

interface ExperienceSession {
    id: string;
    start_time: string;
    end_time: string;
    max_capacity: number;
    booked_count: number;
    price_override?: number;
    status: string;
}

interface Experience {
    id: string;
    organizer_id: string;
    title: string;
    description: string;
    location_data: string;
    base_price: number;
    status: string;
    image_url: string;
    category: string;
    sessions?: ExperienceSession[];
}

interface Reservation {
    id: string;
    session_id: string;
    quantity: number;
    status: string;
    expires_at: string;
    session?: {
        start_time: string;
        end_time: string;
        experience?: {
            title: string;
            location_data: string;
            image_url: string;
        };
    };
}

export const ExperiencesMarketplaceView: React.FC<{
    user: any;
    onNavigate: (view: string) => void;
}> = ({ user, onNavigate }) => {
    const [activeTab, setActiveTab] = useState<'browse' | 'my_bookings'>('browse');
    const [toast, setToast] = useState<{ message: string, type: ToastType } | null>(null);
    const [experiences, setExperiences] = useState<Experience[]>([]);
    const [reservations, setReservations] = useState<Reservation[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isReserving, setIsReserving] = useState(false);
    const [selectedExp, setSelectedExp] = useState<Experience | null>(null);

    useEffect(() => {
        fetchExperiences();
        if (user) {
            fetchReservations();
        }
    }, [user]);

    const fetchExperiences = async () => {
        try {
            setIsLoading(true);
            const { data, error } = await supabase
                .from('experiences')
                .select('*, sessions:experience_sessions(*)')
                .eq('status', 'published')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setExperiences(data || []);
        } catch (err: any) {
            showToast(err.message, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const fetchReservations = async () => {
        if (!user) return;
        try {
            const { data, error } = await supabase
                .from('experience_reservations')
                .select('*, session:experience_sessions(*, experience:experiences(*))')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setReservations(data || []);
        } catch (err: any) {
            console.error(err);
        }
    };

    const handleReserve = async (sessionId: string, quantity: number = 1) => {
        if (!user) {
            onNavigate('auth');
            return;
        }

        setIsReserving(true);
        try {
            const { error } = await supabase.rpc('reserve_experience_slot', {
                p_session_id: sessionId,
                p_user_id: user.id,
                p_quantity: quantity
            });

            if (error) throw error;

            showToast("Slot reserved successfully! (MVP stub to cart)", "success");
            setSelectedExp(null);
            fetchExperiences();
            fetchReservations();
            setActiveTab('my_bookings');
        } catch (err: any) {
            showToast(err.message, 'error');
        } finally {
            setIsReserving(false);
        }
    };

    const showToast = (message: string, type: ToastType = 'info') => {
        setToast({ message, type });
    };

    const formatDateTime = (dateStr: string) => {
        return new Date(dateStr).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    };

    const isComingSoon = true;
    if (isComingSoon) {
        return (
            <div className="px-6 md:px-12 py-12 max-w-7xl mx-auto space-y-12 animate-in fade-in pb-32 relative min-h-[80vh] flex flex-col">
                <header className="flex flex-col gap-8">
                    <MainModuleNav activeModule="tours" onNavigate={onNavigate} />
                </header>
                <div className="flex-1 flex flex-col items-center justify-center space-y-6 text-center mt-12">
                    <div className="w-24 h-24 bg-orange-500/10 rounded-full flex items-center justify-center text-orange-500 mx-auto">
                        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <h1 className="text-4xl md:text-6xl font-black tracking-tighter uppercase themed-text">Explore</h1>
                    <p className="text-xl text-zinc-500 dark:text-zinc-400 font-medium max-w-lg mx-auto">
                        Curated experiences and exclusive adventures are coming soon.
                    </p>
                    <button
                        onClick={() => onNavigate('home')}
                        className="mt-8 px-8 py-4 bg-black dark:bg-white text-white dark:text-black rounded-full font-black uppercase tracking-widest text-sm hover:scale-105 transition-transform"
                    >
                        Return to Events
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="px-6 md:px-12 py-12 max-w-7xl mx-auto space-y-12 animate-in fade-in pb-32 relative">
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

            <header className="flex flex-col gap-8">
                <MainModuleNav activeModule="tours" onNavigate={onNavigate} />

                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="space-y-4">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-500">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="text-[10px] font-black uppercase tracking-widest">Expansion Feature Module</span>
                        </div>
                        <p className="text-zinc-500 font-medium text-lg max-w-md">Curated, time-slot based adventures and exclusive access bookings.</p>
                    </div>

                    <div className="flex bg-zinc-100 dark:bg-white/5 p-1 rounded-full border themed-border w-fit shrink-0">
                        <button onClick={() => setActiveTab('browse')} className={`px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'browse' ? 'bg-black dark:bg-white text-white dark:text-black shadow-lg' : 'themed-text opacity-50'}`}>Explore Destinations</button>
                        <button onClick={() => { if (!user) onNavigate('auth'); else setActiveTab('my_bookings'); }} className={`px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'my_bookings' ? 'bg-black dark:bg-white text-white dark:text-black shadow-lg' : 'themed-text opacity-50'}`}>My Itinerary</button>
                    </div>
                </div>
            </header>

            {/* BROWSE LISTINGS - AIRBNB EXPERIENCE STYLE */}
            {activeTab === 'browse' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8">
                        {isLoading ? Array(4).fill(0).map((_, i) => <EventCardSkeleton key={i} />) : experiences.map((exp) => (
                            <div key={exp.id} className="group cursor-pointer flex flex-col gap-3" onClick={() => setSelectedExp(exp)}>
                                {/* Image Container - Tall Portrait Ratio like Airbnb */}
                                <div className="aspect-[3/4] relative overflow-hidden rounded-2xl bg-zinc-100 dark:bg-zinc-800">
                                    {exp.image_url ? (
                                        <img src={exp.image_url} className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105" alt={exp.title} />
                                    ) : (
                                        <div className="w-full h-full bg-zinc-200 dark:bg-zinc-800" />
                                    )}
                                    {/* Like Button overlay */}
                                    <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button className="p-2 bg-white/50 backdrop-blur-md rounded-full hover:bg-white transition-colors" onClick={(e) => { e.stopPropagation(); showToast("Saved to wish list!", "success"); }}>
                                            <svg className="w-4 h-4 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>

                                {/* Minimal Typography Details */}
                                <div className="flex flex-col gap-0.5 px-1">
                                    <div className="flex justify-between items-start">
                                        <p className="font-semibold text-sm themed-text truncate pr-4">{exp.location_data}</p>
                                        <div className="flex items-center gap-1 text-sm themed-text shrink-0">
                                            <svg className="w-3 h-3 text-current" fill="currentColor" viewBox="0 0 20 20">
                                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                            </svg>
                                            <span>{(4.5 + Math.random() * 0.5).toFixed(2)}</span>
                                        </div>
                                    </div>
                                    <p className="text-sm themed-text opacity-60 truncate">{exp.title}</p>
                                    <p className="text-sm themed-text mt-1">
                                        <span className="font-semibold">From R{exp.base_price}</span> / person
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* MY BOOKINGS */}
            {activeTab === 'my_bookings' && (
                <div className="space-y-6">
                    {reservations.length === 0 ? (
                        <div className="text-center py-32 border border-dashed themed-border rounded-[3rem] opacity-50">
                            <p className="font-bold uppercase tracking-widest text-xs">No upcoming reservations</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {reservations.map((res) => (
                                <div key={res.id} className="flex gap-4 p-4 border themed-border rounded-3xl bg-white dark:bg-zinc-900">
                                    <div className="w-24 h-full rounded-2xl overflow-hidden shrink-0">
                                        <img src={res.session?.experience?.image_url} alt="" className="w-full h-full object-cover" />
                                    </div>
                                    <div className="flex flex-col justify-center">
                                        <h4 className="font-bold text-lg leading-tight themed-text">{res.session?.experience?.title}</h4>
                                        <p className="text-xs themed-text opacity-60 mt-1">{res.session?.experience?.location_data}</p>
                                        <div className="mt-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-orange-500">
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3" />
                                            </svg>
                                            {res.session ? formatDateTime(res.session.start_time) : ''}
                                        </div>
                                        <div className="mt-1 flex items-center gap-2">
                                            <span className={`px-2 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-widest ${res.status === 'confirmed' ? 'bg-green-100 text-green-700' : res.status === 'reserved' ? 'bg-orange-100 text-orange-700' : 'bg-zinc-100 text-zinc-500'}`}>
                                                {res.status}
                                            </span>
                                            <span className="text-[10px] font-bold themed-text opacity-50">Qty: {res.quantity}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* SELECTION MODAL */}
            {selectedExp && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedExp(null)} />
                    <div className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden relative z-10 animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b themed-border flex justify-between items-center">
                            <h2 className="font-black text-xl uppercase tracking-widest themed-text truncate pr-4">{selectedExp.title} <span className="text-orange-500 block text-xs mt-1">Available Slots</span></h2>
                            <button onClick={() => setSelectedExp(null)} className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors shrink-0">
                                <svg className="w-5 h-5 themed-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
                            {selectedExp.sessions && selectedExp.sessions.length > 0 ? (
                                selectedExp.sessions.map((session) => {
                                    const available = session.max_capacity - session.booked_count;
                                    const isFull = available <= 0;
                                    const price = session.price_override || selectedExp.base_price;
                                    return (
                                        <div key={session.id} className={`p-4 border themed-border rounded-2xl flex justify-between items-center ${isFull ? 'opacity-50 grayscale' : ''}`}>
                                            <div>
                                                <p className="font-bold themed-text text-sm">
                                                    {formatDateTime(session.start_time)}
                                                </p>
                                                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mt-1">
                                                    {available} slots left
                                                </p>
                                            </div>
                                            <button
                                                disabled={isFull || isReserving}
                                                onClick={() => handleReserve(session.id, 1)}
                                                className={`px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-transform ${isFull ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500' : 'bg-black dark:bg-white text-white dark:text-black hover:scale-[0.98]'}`}
                                            >
                                                {isReserving ? '...' : isFull ? 'Sold Out' : `Book R${price}`}
                                            </button>
                                        </div>
                                    )
                                })
                            ) : (
                                <p className="text-center italic opacity-50 py-8 text-sm">No sessions currently scheduled.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
