import React, { useState, useRef, useEffect } from 'react';
import { Event, EventCategory, TicketType, Profile, Plan } from '../types';
import { supabase } from '../lib/supabase';
import { EventCard } from '../components/EventCard';
import { Sparkles, Theater, ClipboardList, Armchair, Rocket, Lock, Ticket as TicketIcon, BarChart3, Map as MapIcon } from 'lucide-react';
import { CategoryIcon } from '../components/CategoryIcon';
import usePlacesAutocomplete, { getGeocode, getLatLng } from 'use-places-autocomplete';
import { useLoadScript } from '@react-google-maps/api';

const libraries: any = ['places'];

interface EventCreationWizardProps {
    user: Profile;
    onClose: () => void;
    onEventCreated: (eventId?: string, isSeated?: boolean) => void;
    categories: EventCategory[];
}

const STEPS = [
    { id: 'essentials', title: 'The Vibe', icon: <Sparkles className="w-4 h-4" /> },
    { id: 'details', title: 'The Experience', icon: <Theater className="w-4 h-4" /> },
    { id: 'logistics', title: 'House Rules', icon: <ClipboardList className="w-4 h-4" /> },
    { id: 'seating', title: 'Venue Seating', icon: <Armchair className="w-4 h-4" /> },
    { id: 'tickets', title: 'Access Control', icon: <TicketIcon className="w-4 h-4" /> },
    { id: 'review', title: 'Launch', icon: <Rocket className="w-4 h-4" /> }
];

const PROHIBITIONS_LIST = [
    { id: 'no-alcohol', label: 'No Alcohol', icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg> },
    { id: 'no-smoking', label: 'No Smoking', icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg> },
    { id: 'no-weapons', label: 'No Weapons', icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg> },
    { id: 'no-cameras', label: 'No Cameras', icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
    { id: 'no-pets', label: 'No Pets', icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg> },
    { id: 'no-food', label: 'No Outside Food', icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg> },
    { id: 'no-under-18', label: 'No Under 18s', icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg> }
];

export const EventCreationWizard: React.FC<EventCreationWizardProps> = ({ user, onClose, onEventCreated, categories }) => {
    const [currentStep, setCurrentStep] = useState(0);
    const [formData, setFormData] = useState<Partial<Event>>({
        organizer_id: user.id,
        title: '',
        category: 'Music',
        starts_at: '',
        ends_at: '',
        venue: '',
        description: '',
        image_url: '',
        headliners: [],
        prohibitions: [],
        parking_info: '',
        is_cooler_box_allowed: false,
        cooler_box_price: 0,
        status: 'draft',
        tiers: [],
        fee_preference: 'post_event' as 'post_event' | 'upfront',
        is_seated: false
    });
    const [seatingMode, setSeatingMode] = useState<'none' | 'template' | 'custom'>('none');

    const { isLoaded: isMapsLoaded } = useLoadScript({
        googleMapsApiKey: (import.meta as any).env.VITE_GOOGLE_MAPS_API_KEY || '',
        libraries,
    });

    const {
        ready: placesReady,
        value: venueSearch,
        suggestions: { status: placesStatus, data: placesData },
        setValue: setVenueSearch,
        clearSuggestions: clearPlacesSuggestions,
    } = usePlacesAutocomplete({
        requestOptions: {
            // Optional constraints here (e.g. restrict to South Africa)
            // componentRestrictions: { country: "za" },
        },
        debounce: 300,
        defaultValue: formData.venue
    });

    const handleVenueSelect = async (address: string) => {
        setVenueSearch(address, false);
        clearPlacesSuggestions();

        try {
            const results = await getGeocode({ address });
            const { lat, lng } = await getLatLng(results[0] as any);
            setFormData(prev => ({ ...prev, venue: address, latitude: lat, longitude: lng }));
        } catch (error) {
            console.error("Geocoding Error: ", error);
            setFormData(prev => ({ ...prev, venue: address })); // Fallback
        }
    };

    const [ticketTiers, setTicketTiers] = useState<Partial<TicketType>[]>([
        { name: 'General Access', price: 0, quantity_limit: 100 }
    ]);

    const addTicketTier = () => {
        setTicketTiers([...ticketTiers, { name: 'New Tier', price: 0, quantity_limit: 50 }]);
    };

    const removeTicketTier = (tierIndex: number) => {
        if (ticketTiers.length > 1) {
            setTicketTiers(ticketTiers.filter((_, i) => i !== tierIndex));
        }
    };
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isPolishing, setIsPolishing] = useState(false);
    const [isAnalyzingPrice, setIsAnalyzingPrice] = useState(false);
    const [priceAdvice, setPriceAdvice] = useState<string | null>(null);
    const [plan, setPlan] = useState<Plan | null>(null);
    const [activeEventsCount, setActiveEventsCount] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const fetchLimits = async () => {
            try {
                // 1. Fetch Plan
                const { data: planData, error: planError } = await supabase
                    .rpc('get_organizer_plan', { p_user_id: user.id });

                if (planError) throw planError;
                if (planData && planData.length > 0) {
                    setPlan(planData[0]);
                }

                // 2. Fetch Active Events Count
                const { count, error: countError } = await supabase
                    .from('events')
                    .select('*', { count: 'exact', head: true })
                    .eq('organizer_id', user.id)
                    .not('status', 'in', '("ended", "cancelled")');

                if (countError) throw countError;
                setActiveEventsCount(count || 0);

            } catch (err) {
                console.error("Error fetching limits:", err);
            }
        };
        fetchLimits();
    }, [user.id]);

    // Category Logic
    const isMusic = formData.category === 'Music' || formData.category === 'Nightlife';
    const isBusiness = formData.category === 'Business' || formData.category === 'Tech';

    const handleNext = () => {
        if (currentStep < STEPS.length - 1) {
            setCurrentStep(prev => prev + 1);
        }
    };

    const handleBack = () => {
        if (currentStep > 0) {
            setCurrentStep(prev => prev - 1);
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // 1. Immediate Local Preview (Optimistic UI)
        const localPreviewUrl = URL.createObjectURL(file);
        setFormData(prev => ({ ...prev, image_url: localPreviewUrl }));

        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
            const safeUserId = user?.id || 'anon';
            const filePath = `${safeUserId}/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('event-images')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('event-images')
                .getPublicUrl(filePath);

            // 2. Update with permanent URL
            setFormData(prev => ({ ...prev, image_url: publicUrl }));
        } catch (err: any) {
            console.error("Upload failed:", err);
            alert(`Image upload failed: ${err.message || 'Unknown error'}`);
        }
    };

    const handleMagicPolish = async () => {
        if (!formData.description) return;
        setIsPolishing(true);
        try {
            const context = {
                category: formData.category || 'Event',
                tier: (plan?.id || 'free') as 'free' | 'pro' | 'premium',
                organizerName: user.business_name
            };
            const { data, error } = await supabase.functions.invoke('ai-assistant', {
                body: { type: 'marketing', input: formData.description, context }
            });
            if (error) throw error;
            setFormData(prev => ({ ...prev, description: data?.text || formData.description }));
        } catch (err: any) {
            console.error("AI Polish failed:", err);
            alert(`AI Polish failed: ${err.message || 'Unknown error'}`);
        } finally {
            setIsPolishing(false);
        }
    };

    const handlePriceStrategy = async () => {
        setIsAnalyzingPrice(true);
        try {
            const context = {
                category: formData.category || 'Event',
                tier: (plan?.id || 'free') as 'free' | 'pro' | 'premium'
            };
            const { data, error } = await supabase.functions.invoke('ai-assistant', {
                body: { type: 'pricing', input: { title: formData.title, tiers: ticketTiers }, context }
            });
            if (error) throw error;
            setPriceAdvice(data?.text || 'Analysis failed');
        } catch (err: any) {
            console.error("AI Price advice failed:", err);
            alert(`AI Strategy failed: ${err.message || 'Unknown error'}`);
        } finally {
            setIsAnalyzingPrice(false);
        }
    };

    const handleSubmit = async (publishStatus: 'published' | 'coming_soon' = 'published') => {
        setIsSubmitting(true);
        try {
            // 0. Pre-submission Checks
            if (plan && activeEventsCount >= plan.events_limit) {
                throw new Error(`Event limit reached. Your ${plan.name} plan allows only ${plan.events_limit} active events.`);
            }

            // 1. Prepare Payload - REMOVED gross_revenue
            const eventPayload = {
                organizer_id: user.id,
                title: formData.title || 'Untitled Event',
                description: formData.description || '',
                venue: formData.venue || 'TBA',
                starts_at: formData.starts_at ? new Date(formData.starts_at).toISOString() : new Date().toISOString(),
                ends_at: formData.ends_at ? new Date(formData.ends_at).toISOString() : null,
                image_url: formData.image_url || '',
                category: formData.category || 'Music',
                total_ticket_limit: formData.total_ticket_limit || 100,
                headliners: formData.headliners || [],
                prohibitions: formData.prohibitions || [],
                parking_info: formData.parking_info,
                is_cooler_box_allowed: formData.is_cooler_box_allowed,
                cooler_box_price: formData.cooler_box_price,
                fee_preference: formData.fee_preference || 'post_event',
                is_seated: formData.is_seated || false,
                status: publishStatus,
                latitude: formData.latitude,
                longitude: formData.longitude
            };

            // 2. Create Event
            const { data: eventData, error: eventError } = await supabase
                .from('events')
                .insert([eventPayload])
                .select()
                .single();

            if (eventError) {
                console.error("Supabase Event Insert Error:", eventError);
                throw eventError;
            }

            // 2.5 Insert Event Dates (if any)
            let dateIdMap: Record<string, string> = {}; // Map temp ID to real DB ID

            if (formData.dates && formData.dates.length > 0) {
                const datesToInsert = formData.dates.map(d => ({
                    event_id: eventData.id, // Link to real event ID
                    starts_at: d.starts_at ? new Date(d.starts_at).toISOString() : new Date().toISOString(),
                    ends_at: d.ends_at ? new Date(d.ends_at).toISOString() : null, // Handle blank/null
                    venue: d.venue || null,
                    lineup: d.lineup || []
                }));

                const { data: insertedDates, error: datesError } = await supabase
                    .from('event_dates')
                    .insert(datesToInsert)
                    .select();

                if (datesError) throw datesError;

                // Map the temp IDs to the real IDs
                if (insertedDates) {
                    formData.dates.forEach((tempDate, index) => {
                        if (insertedDates[index] && tempDate.id) {
                            dateIdMap[tempDate.id] = insertedDates[index].id;
                        }
                    });
                }
            }

            // 3. Create Tickets Tiers
            if (ticketTiers.length > 0) {
                const tiersToInsert = ticketTiers.map(t => {
                    // Resolve the real event_date_id using the map
                    const realEventDateId = t.event_date_id ? dateIdMap[t.event_date_id] : null;

                    return {
                        event_id: eventData.id,
                        name: t.name || 'General Access',
                        price: t.price || 0,
                        quantity_limit: t.quantity_limit || 100,
                        event_date_id: realEventDateId // Link to specific date
                    };
                });

                const { error: tierError } = await supabase
                    .from('ticket_types')
                    .insert(tiersToInsert);

                if (tierError) throw tierError;
            }

            onEventCreated(eventData?.id, formData.is_seated);
            onClose();
        } catch (err: any) {
            console.error("Submission Error:", err);
            alert(`Failed to launch: ${err.message || 'Check console for details'}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Render Step Content
    const renderStep = () => {
        switch (currentStep) {
            case 0: // Essentials
                return (
                    <div className="space-y-12 animate-in fade-in slide-in-from-right-8 duration-700 w-full max-w-4xl mx-auto">
                        <div className="space-y-4">
                            <label className="text-xs font-black uppercase tracking-widest opacity-40 ml-4 text-black dark:text-white">What's the vibe called?</label>
                            <input
                                autoFocus
                                type="text"
                                value={formData.title}
                                onChange={e => setFormData({ ...formData, title: e.target.value })}
                                className="w-full bg-zinc-50 dark:bg-zinc-900/50 hover:bg-zinc-100 dark:hover:bg-zinc-900 focus:bg-white dark:focus:bg-black p-6 rounded-[2rem] text-4xl md:text-5xl font-black text-black dark:text-white outline-none border border-transparent focus:border-black/20 dark:focus:border-white/20 transition-all shadow-sm focus:shadow-xl placeholder:opacity-20"
                                placeholder="The Next Big Thing"
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-4">
                                <label className="text-xs font-black uppercase tracking-widest opacity-40 ml-4 text-black dark:text-white">Category</label>
                                <div className="flex flex-wrap gap-3">
                                    {(categories || []).map(c => (
                                        <button
                                            key={c.id}
                                            onClick={() => setFormData({ ...formData, category: c.name })}
                                            className={`px-6 py-3 rounded-full text-[10px] md:text-xs font-black uppercase tracking-widest transition-all flex items-center ${formData.category === c.name
                                                ? 'bg-black dark:bg-white text-white dark:text-black scale-105 shadow-xl'
                                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 hover:text-black dark:hover:text-white'
                                                }`}
                                        >
                                            <CategoryIcon name={c.icon} className="mr-2" /> {c.name}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Image Upload Trigger */}
                            <div className="space-y-4 relative">
                                <label className="text-xs font-black uppercase tracking-widest opacity-40 ml-4 text-black dark:text-white">Cover Artwork</label>
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('scale-[1.02]', 'border-black', 'dark:border-white'); }}
                                    onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('scale-[1.02]', 'border-black', 'dark:border-white'); }}
                                    onDrop={async (e) => {
                                        e.preventDefault();
                                        e.currentTarget.classList.remove('scale-[1.02]', 'border-black', 'dark:border-white');
                                        const file = e.dataTransfer.files?.[0];
                                        if (file) {
                                            // 1. Immediate Local Preview
                                            const localPreviewUrl = URL.createObjectURL(file);
                                            setFormData(prev => ({ ...prev, image_url: localPreviewUrl }));

                                            try {
                                                const fileExt = file.name.split('.').pop();
                                                const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
                                                const safeUserId = user?.id || 'anon';
                                                const filePath = `${safeUserId}/${fileName}`;

                                                const { error: uploadError } = await supabase.storage
                                                    .from('event-images')
                                                    .upload(filePath, file);

                                                if (uploadError) throw uploadError;

                                                const { data: { publicUrl } } = supabase.storage
                                                    .from('event-images')
                                                    .getPublicUrl(filePath);

                                                setFormData(prev => ({ ...prev, image_url: publicUrl }));
                                            } catch (err: any) {
                                                console.error("Drop upload failed:", err);
                                                alert(`Upload failed: ${err.message || 'Unknown error'}`);
                                            }
                                        }
                                    }}
                                    className={`relative w-full aspect-[16/9] rounded-3xl overflow-hidden cursor-pointer group transition-all duration-500 border-2 ${formData.image_url ? 'border-transparent' : 'border-dashed border-zinc-200 dark:border-zinc-800 hover:border-black dark:hover:border-white'}`}
                                >
                                    {formData.image_url ? (
                                        <>
                                            <img src={formData.image_url} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt="Event preview" />
                                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">
                                                <span className="text-white font-black uppercase tracking-widest text-[10px] px-6 py-3 rounded-full border-2 border-white/20">Replace Asset</span>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-full text-zinc-400 group-hover:text-black dark:group-hover:text-white transition-colors gap-3">
                                            <svg className="w-8 h-8 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                            <span className="text-[10px] font-black uppercase tracking-widest">Drop or Upload Asset</span>
                                        </div>
                                    )}
                                    <input ref={fileInputRef} type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-8 pt-4">
                            <div className="space-y-4">
                                <label className="text-xs font-black uppercase tracking-widest opacity-40 ml-4 text-black dark:text-white">Doors Open</label>
                                <input
                                    type="datetime-local"
                                    value={formData.starts_at}
                                    min={(() => { const t = new Date(); t.setDate(t.getDate() + 1); t.setHours(0, 0, 0, 0); return t.toISOString().slice(0, 16); })()}
                                    onChange={e => setFormData({ ...formData, starts_at: e.target.value })}
                                    className="w-full bg-zinc-50 dark:bg-zinc-900/50 hover:bg-zinc-100 dark:hover:bg-zinc-900 focus:bg-white dark:focus:bg-black p-5 md:p-6 rounded-[1.5rem] md:rounded-[2rem] text-sm md:text-lg font-bold text-black dark:text-white outline-none border border-transparent focus:border-black/20 dark:focus:border-white/20 transition-all shadow-sm focus:shadow-xl"
                                />
                            </div>
                            <div className="space-y-4">
                                <label className="text-xs font-black uppercase tracking-widest opacity-40 ml-4 text-black dark:text-white">Curfew</label>
                                <input
                                    type="datetime-local"
                                    value={formData.ends_at === 'OVERNIGHT' ? '' : formData.ends_at}
                                    min={(() => { const t = new Date(); t.setDate(t.getDate() + 1); t.setHours(0, 0, 0, 0); return t.toISOString().slice(0, 16); })()}
                                    onChange={e => setFormData({ ...formData, ends_at: e.target.value })}
                                    className="w-full bg-zinc-50 dark:bg-zinc-900/50 hover:bg-zinc-100 dark:hover:bg-zinc-900 focus:bg-white dark:focus:bg-black p-5 md:p-6 rounded-[1.5rem] md:rounded-[2rem] text-sm md:text-lg font-bold text-black dark:text-white outline-none border border-transparent focus:border-black/20 dark:focus:border-white/20 transition-all shadow-sm focus:shadow-xl"
                                />
                            </div>
                        </div>
                    </div>
                );

            case 1: // Schedule (Date & Location)
                return (
                    <div className="space-y-12 animate-in fade-in slide-in-from-right-8 duration-700">
                        <div className="space-y-4">
                            <div className="flex justify-between items-center ml-4">
                                <label className="text-xs font-black uppercase tracking-widest opacity-40 text-black dark:text-white">The Experience</label>
                                {formData.description && (
                                    <button
                                        onClick={handleMagicPolish}
                                        disabled={isPolishing}
                                        className={`flex items-center gap-2 px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${isPolishing ? 'animate-pulse bg-zinc-100 dark:bg-zinc-800 text-zinc-400' : 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-lg shadow-purple-500/20 hover:scale-105 active:scale-95'}`}
                                    >
                                        <span>{isPolishing ? 'Casting Spell...' : 'Magic Polish'}</span>
                                        <Sparkles className="inline w-3 h-3 ml-1" />
                                    </button>
                                )}
                            </div>
                            <textarea
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                                className="w-full bg-zinc-50 dark:bg-zinc-900/50 hover:bg-zinc-100 dark:hover:bg-zinc-900 focus:bg-white dark:focus:bg-black p-6 md:p-8 rounded-[2rem] text-2xl md:text-3xl font-medium text-black dark:text-white outline-none border border-transparent focus:border-black/20 dark:focus:border-white/20 transition-all shadow-sm focus:shadow-xl resize-none h-48 placeholder:opacity-20 leading-snug custom-scrollbar"
                                placeholder="Tell them a story..."
                                autoFocus
                            />
                        </div>

                        <div className="space-y-8">
                            <div className="flex justify-between items-end ml-4">
                                <label className="text-xs font-black uppercase tracking-widest opacity-40 text-black dark:text-white">Event Schedule</label>
                                <button
                                    onClick={() => {
                                        const currentDates = formData.dates || [];
                                        const newDate = {
                                            id: crypto.randomUUID() as string,
                                            event_id: 'draft',
                                            starts_at: '',
                                            ends_at: '',
                                            venue: formData.venue || '',
                                            lineup: []
                                        };
                                        setFormData({ ...formData, dates: [...currentDates, newDate] });
                                    }}
                                    className="text-[10px] font-black uppercase tracking-widest bg-black dark:bg-white text-white dark:text-black px-6 py-3 rounded-full hover:scale-105 transition-transform shadow-lg"
                                >
                                    + Add Date
                                </button>
                            </div>

                            {/* Primary/Default Location */}
                            {(!formData.dates || formData.dates.length === 0) && (
                                <div className="space-y-6 p-6 md:p-8 bg-zinc-50 dark:bg-zinc-900/50 rounded-[2rem] border border-transparent hover:border-black/5 dark:hover:border-white/5 transition-all">
                                    <div className="space-y-4">
                                        <label className="text-[10px] font-black uppercase tracking-widest opacity-40 text-black dark:text-white">Primary Date & Venue</label>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                                            <input
                                                type="datetime-local"
                                                value={formData.starts_at}
                                                onChange={e => setFormData({ ...formData, starts_at: e.target.value })}
                                                className="w-full bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 hover:border-black/20 dark:hover:border-white/20 p-4 rounded-2xl text-sm font-bold text-black dark:text-white focus:outline-none focus:border-black/30 dark:focus:border-white/30 transition-all shadow-sm"
                                            />
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    value={venueSearch}
                                                    onChange={e => {
                                                        setVenueSearch(e.target.value);
                                                        setFormData({ ...formData, venue: e.target.value }); // Sync generic changes
                                                    }}
                                                    disabled={!placesReady || !isMapsLoaded}
                                                    className="w-full bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 hover:border-black/20 dark:hover:border-white/20 p-4 rounded-2xl text-sm font-bold text-black dark:text-white focus:outline-none focus:border-black/30 dark:focus:border-white/30 transition-all shadow-sm placeholder:opacity-30"
                                                    placeholder="Venue Name or Address"
                                                />
                                                {placesStatus === "OK" && (
                                                    <ul className="absolute z-10 w-full mt-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl overflow-hidden">
                                                        {placesData.map(({ place_id, description }) => (
                                                            <li
                                                                key={place_id}
                                                                onClick={() => handleVenueSelect(description)}
                                                                className="px-4 py-3 text-sm font-bold cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 themed-text"
                                                            >
                                                                {description}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    {isMusic && (
                                        <div className="space-y-4">
                                            <label className="text-xs font-black uppercase tracking-widest opacity-40 ml-4 themed-text">Headliners (Lineup)</label>
                                            <input
                                                type="text"
                                                value={formData.headliners?.join(', ')}
                                                onChange={e => setFormData({ ...formData, headliners: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                                                className="w-full themed-secondary-bg hover:themed-card focus:themed-card p-6 rounded-[2rem] text-2xl font-black themed-text outline-none border border-transparent focus:border-black/20 dark:focus:border-white/20 transition-all placeholder:opacity-20 uppercase"
                                                placeholder="e.g. Black Coffee, Shimza..."
                                            />
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Multi-Date Lists */}
                            <div className="space-y-4">
                                {formData.dates?.map((date, idx) => (
                                    <div key={idx} className="p-6 md:p-8 rounded-[2rem] border border-transparent bg-zinc-50 dark:bg-zinc-900/50 hover:border-black/5 dark:hover:border-white/5 transition-all group relative">
                                        <button
                                            onClick={() => {
                                                const newDates = formData.dates?.filter((_, i) => i !== idx);
                                                setFormData({ ...formData, dates: newDates });
                                            }}
                                            className="absolute top-6 right-6 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500/10 hover:bg-red-500/20 w-8 h-8 rounded-full flex items-center justify-center"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>

                                        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6 pr-8 md:pr-0">
                                            <div className="md:col-span-4 space-y-2">
                                                <label className="text-[10px] font-black uppercase tracking-widest opacity-40 text-black dark:text-white">When</label>
                                                <input
                                                    type="datetime-local"
                                                    value={date.starts_at}
                                                    onChange={e => {
                                                        const newDates = [...(formData.dates || [])];
                                                        newDates[idx] = { ...newDates[idx], starts_at: e.target.value };
                                                        setFormData({ ...formData, dates: newDates });
                                                    }}
                                                    className="w-full bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 hover:border-black/20 dark:hover:border-white/20 p-4 rounded-2xl text-sm font-bold text-black dark:text-white focus:outline-none focus:border-black/30 dark:focus:border-white/30 transition-all shadow-sm"
                                                />
                                            </div>
                                            <div className="md:col-span-4 space-y-2">
                                                <label className="text-[10px] font-black uppercase tracking-widest opacity-40 text-black dark:text-white">Where</label>
                                                <input
                                                    type="text"
                                                    value={date.venue || ''}
                                                    onChange={e => {
                                                        const newDates = [...(formData.dates || [])];
                                                        newDates[idx] = { ...newDates[idx], venue: e.target.value, starts_at: date.starts_at || '' };
                                                        setFormData({ ...formData, dates: newDates });
                                                    }}
                                                    className="w-full bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 hover:border-black/20 dark:hover:border-white/20 p-4 rounded-2xl text-sm font-bold text-black dark:text-white focus:outline-none focus:border-black/30 dark:focus:border-white/30 transition-all shadow-sm placeholder:opacity-30"
                                                    placeholder="Venue Override"
                                                />
                                            </div>
                                            <div className="md:col-span-4 space-y-2">
                                                <label className="text-[10px] font-black uppercase tracking-widest opacity-40 text-black dark:text-white">Who</label>
                                                <input
                                                    type="text"
                                                    value={date.lineup?.join(', ') || ''}
                                                    onChange={e => {
                                                        const newDates = [...(formData.dates || [])];
                                                        newDates[idx] = { ...newDates[idx], lineup: e.target.value.split(',').map(s => s.trim()).filter(Boolean), starts_at: date.starts_at || '' };
                                                        setFormData({ ...formData, dates: newDates });
                                                    }}
                                                    className="w-full bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 hover:border-black/20 dark:hover:border-white/20 p-4 rounded-2xl text-sm font-bold text-black dark:text-white focus:outline-none focus:border-black/30 dark:focus:border-white/30 transition-all shadow-sm placeholder:opacity-30"
                                                    placeholder="Lineup Override"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                );

            case 2: // Logistics
                return (
                    <div className="space-y-12 animate-in fade-in slide-in-from-right-8 duration-700 w-full max-w-4xl mx-auto">
                        {/* Prohibitions */}
                        <div className="space-y-6">
                            <label className="text-xs font-black uppercase tracking-widest opacity-40 ml-4 text-black dark:text-white">House Rules</label>
                            <div className="flex flex-wrap gap-4">
                                {PROHIBITIONS_LIST.map(p => {
                                    const isSelected = formData.prohibitions?.includes(p.id);
                                    return (
                                        <button
                                            key={p.id}
                                            onClick={() => {
                                                const current = formData.prohibitions || [];
                                                setFormData({
                                                    ...formData,
                                                    prohibitions: isSelected ? current.filter(id => id !== p.id) : [...current, p.id]
                                                });
                                            }}
                                            className={`px-8 py-5 rounded-[2rem] flex items-center gap-4 transition-all duration-300 ${isSelected
                                                ? 'bg-black dark:bg-white text-white dark:text-black scale-105 shadow-xl'
                                                : 'bg-zinc-50 dark:bg-zinc-900/50 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-500 hover:text-black dark:hover:text-white border border-transparent hover:border-black/10 dark:hover:border-white/10'
                                                }`}
                                        >
                                            <span className="text-2xl">{p.icon}</span>
                                            <span className="text-xs font-black uppercase tracking-widest">{p.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Cooler Box Logic */}
                        {!isBusiness && (
                            <div className="space-y-6">
                                <div className="flex items-center justify-between p-6 md:p-8 rounded-[2rem] bg-zinc-50 dark:bg-zinc-900/50 border border-transparent hover:border-black/5 dark:hover:border-white/5 transition-all">
                                    <div className="space-y-1">
                                        <label className="text-xs font-black uppercase tracking-widest text-black dark:text-white">Cooler Box Access</label>
                                        <p className="text-xs font-medium opacity-50 text-black dark:text-white">Can guests bring their own beverages?</p>
                                    </div>
                                    <button
                                        onClick={() => setFormData(prev => ({ ...prev, is_cooler_box_allowed: !prev.is_cooler_box_allowed }))}
                                        className={`w-14 h-8 rounded-full p-1 transition-all duration-300 ${formData.is_cooler_box_allowed ? 'bg-black dark:bg-white' : 'bg-zinc-200 dark:bg-zinc-800'}`}
                                    >
                                        <div className={`w-6 h-6 rounded-full bg-white dark:bg-black transition-transform duration-300 shadow-md ${formData.is_cooler_box_allowed ? 'translate-x-6' : ''}`} />
                                    </button>
                                </div>

                                {formData.is_cooler_box_allowed && (
                                    <div className="animate-in fade-in slide-in-from-top-4 pl-8 border-l-4 border-black dark:border-white space-y-4">
                                        <label className="text-xs font-black uppercase tracking-widest opacity-40 text-black dark:text-white">Corkage Fee (R)</label>
                                        <input
                                            type="number"
                                            value={formData.cooler_box_price}
                                            onChange={e => setFormData({ ...formData, cooler_box_price: parseInt(e.target.value) || 0 })}
                                            className="w-full bg-zinc-50 dark:bg-zinc-900/50 hover:bg-zinc-100 dark:hover:bg-zinc-900 focus:bg-white dark:focus:bg-black p-6 rounded-[2rem] text-3xl font-black text-black dark:text-white outline-none border border-transparent focus:border-black/20 dark:focus:border-white/20 transition-all shadow-sm focus:shadow-xl"
                                            placeholder="0"
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Parking */}
                        <div className="space-y-4">
                            <label className="text-xs font-black uppercase tracking-widest opacity-40 ml-4 text-black dark:text-white">Parking Intel</label>
                            <input
                                type="text"
                                value={formData.parking_info}
                                onChange={e => setFormData({ ...formData, parking_info: e.target.value })}
                                className="w-full bg-zinc-50 dark:bg-zinc-900/50 hover:bg-zinc-100 dark:hover:bg-zinc-900 focus:bg-white dark:focus:bg-black p-6 rounded-[2rem] text-xl font-medium text-black dark:text-white outline-none border border-transparent focus:border-black/20 dark:focus:border-white/20 transition-all shadow-sm focus:shadow-xl placeholder:opacity-30"
                                placeholder="e.g. Secure underground access"
                            />
                        </div>
                    </div>
                );

            case 3: // Seating
                const isPremium = user.organizer_tier === 'premium' || user.organizer_tier === 'pro';
                return (
                    <div className="space-y-12 animate-in fade-in slide-in-from-right-8 duration-700 w-full max-w-4xl mx-auto">
                        <div className="space-y-4">
                            <label className="text-xs font-black uppercase tracking-widest opacity-40 ml-4 text-black dark:text-white">Venue Layout & Seating</label>

                            {!isPremium ? (
                                <div className="p-8 md:p-12 bg-zinc-50 dark:bg-zinc-900/50 rounded-[3rem] border border-transparent hover:border-black/5 dark:hover:border-white/5 transition-all text-center space-y-8 relative overflow-hidden group">
                                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-purple-500/5 to-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                                    <div className="w-24 h-24 mx-auto bg-white dark:bg-black rounded-full flex items-center justify-center shadow-xl mb-4 relative z-10">
                                        <Lock className="w-10 h-10" />
                                    </div>
                                    <div className="space-y-4 relative z-10">
                                        <h3 className="text-3xl md:text-5xl font-black tracking-tighter uppercase text-black dark:text-white">Premium Floor Plans</h3>
                                        <p className="text-zinc-500 font-medium text-lg max-w-md mx-auto leading-relaxed">
                                            Visualize your venue. Maximize revenue with intelligent zone pricing and interactive seating charts.
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => window.location.href = '/settings?tab=subscription'}
                                        className="relative z-10 px-8 py-4 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full font-black text-xs uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl shadow-purple-500/20"
                                    >
                                        Unlock Seat Selection
                                    </button>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {[
                                        { id: 'none', title: 'General Admission', desc: 'No reserved seating. Standard entry.', icon: <TicketIcon className="w-4 h-4" /> },
                                        { id: 'custom', title: 'Custom Upload', desc: 'Import SVG seating maps.', icon: <MapIcon className="w-4 h-4" /> }
                                    ].map(mode => (
                                        <button
                                            key={mode.id}
                                            onClick={() => {
                                                setSeatingMode(mode.id as 'none' | 'custom');
                                                setFormData({ ...formData, is_seated: mode.id !== 'none' });
                                            }}
                                            className={`p-8 rounded-[2rem] border text-left transition-all duration-300 flex flex-col gap-4 ${seatingMode === mode.id ? 'bg-black dark:bg-white text-white dark:text-black border-transparent scale-105 shadow-2xl' : 'bg-zinc-50 dark:bg-zinc-900/50 border-transparent hover:border-black/10 dark:hover:border-white/10 text-black dark:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900'}`}
                                        >
                                            <span className="text-4xl">{mode.icon}</span>
                                            <div className="space-y-2">
                                                <h4 className="font-black tracking-widest uppercase text-sm">{mode.title}</h4>
                                                <p className={`text-xs font-medium leading-relaxed ${seatingMode === mode.id ? 'opacity-80' : 'text-zinc-500 dark:text-zinc-400'}`}>{mode.desc}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {isPremium && formData.is_seated && (
                                <div className="p-8 mt-8 bg-purple-50 dark:bg-purple-900/10 border border-purple-500/20 rounded-[2rem] animate-in fade-in slide-in-from-top-4">
                                    <p className="text-sm font-medium text-purple-900/80 dark:text-purple-200/80 text-center">
                                        Venue Configuration Builder will launch immediately after you hit Publish.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                );


            case 4: // Access (Tickets)
                return (
                    <div className="space-y-12 animate-in fade-in slide-in-from-right-8 duration-700 w-full max-w-4xl mx-auto">
                        <div className="space-y-4">
                            <label className="text-xs font-black uppercase tracking-widest opacity-40 ml-4 text-black dark:text-white">Total Capacity</label>
                            <input
                                type="number"
                                value={formData.total_ticket_limit}
                                onChange={e => setFormData({ ...formData, total_ticket_limit: parseInt(e.target.value) || 0 })}
                                className="w-full bg-zinc-50 dark:bg-zinc-900/50 hover:bg-zinc-100 dark:hover:bg-zinc-900 focus:bg-white dark:focus:bg-black p-6 rounded-[2rem] text-4xl md:text-5xl font-black text-black dark:text-white outline-none border border-transparent focus:border-black/20 dark:focus:border-white/20 transition-all shadow-sm focus:shadow-xl placeholder:opacity-20"
                                placeholder="e.g. 500"
                                disabled={formData.is_seated}
                            />
                            {formData.is_seated && (
                                <div className="flex justify-between items-center bg-zinc-50 dark:bg-zinc-900/50 p-6 rounded-[2rem]">
                                    <div className="flex items-center gap-4">
                                        <TicketIcon className="w-6 h-6" />
                                        <div>
                                            <h4 className="font-black uppercase tracking-widest text-xs">Total Tickets</h4>
                                            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1">
                                                {ticketTiers.reduce((acc, tier) => acc + (tier.quantity_limit || 0), 0)} / {formData.total_ticket_limit || 'âˆž'} Allocated
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={addTicketTier}
                                        className="w-12 h-12 bg-black dark:bg-white text-white dark:text-black rounded-full flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-xl"
                                    >
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="space-y-8">
                            <div className="flex justify-between items-end ml-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-black uppercase tracking-widest opacity-40 text-black dark:text-white">Ticket Stacks</label>
                                    <button
                                        onClick={handlePriceStrategy}
                                        disabled={isAnalyzingPrice}
                                        className="text-[10px] font-black uppercase tracking-widest text-purple-600 hover:text-purple-400 flex items-center gap-1 transition-colors"
                                    >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                        {isAnalyzingPrice ? 'Analyzing Market...' : 'Strategic AI Pricing'}
                                    </button>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                    {plan && (
                                        <p className={`text-[10px] font-black uppercase tracking-widest ${ticketTiers.reduce((acc, t) => acc + (t.quantity_limit || 0), 0) >= plan.tickets_limit ? 'text-red-500' : 'text-zinc-500'}`}>
                                            {ticketTiers.reduce((acc, t) => acc + (t.quantity_limit || 0), 0)} / {plan.tickets_limit} Allocated
                                        </p>
                                    )}
                                    <button
                                        onClick={() => setTicketTiers([...ticketTiers, { name: '', price: 0, quantity_limit: 100, event_date_id: null }])}
                                        disabled={plan ? ticketTiers.reduce((acc, t) => acc + (t.quantity_limit || 0), 0) >= plan.tickets_limit : false}
                                        className="text-[10px] font-black uppercase tracking-widest bg-black dark:bg-white text-white dark:text-black px-6 py-3 rounded-full hover:scale-105 transition-transform shadow-lg disabled:opacity-50 disabled:hover:scale-100"
                                    >
                                        + New Tier
                                    </button>
                                </div>
                            </div>

                            {priceAdvice && (
                                <div className="p-6 md:p-8 bg-purple-50 dark:bg-purple-900/10 border border-purple-500/20 rounded-[2rem] animate-in fade-in slide-in-from-top-4 shadow-lg shadow-purple-500/5">
                                    <div className="flex justify-between items-start mb-6">
                                        <span className="text-xs font-black uppercase tracking-widest text-purple-600 dark:text-purple-400 flex items-center gap-2">
                                            <Sparkles className="w-4 h-4 animate-pulse" /> Market Intel
                                        </span>
                                        <button onClick={() => setPriceAdvice(null)} className="text-purple-600/50 hover:text-purple-600 bg-purple-100 dark:bg-purple-900/30 p-2 rounded-full transition-colors">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                    </div>
                                    <div className="text-sm font-medium text-purple-900/80 dark:text-purple-200/80 leading-relaxed whitespace-pre-wrap">
                                        {priceAdvice}
                                    </div>
                                </div>
                            )}

                            <div className="grid gap-4">
                                {ticketTiers.map((tier, idx) => (
                                    <div key={idx} className="p-6 md:p-8 rounded-[2rem] bg-zinc-50 dark:bg-zinc-900/50 border border-transparent hover:border-black/5 dark:hover:border-white/5 transition-all flex flex-col gap-6 group relative">
                                        <button
                                            onClick={() => removeTicketTier(idx)}
                                            className="absolute top-6 right-6 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500/10 hover:bg-red-500/20 w-8 h-8 rounded-full flex items-center justify-center"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>

                                        <div className="flex flex-col md:flex-row gap-6 items-end w-full pr-8 md:pr-0">
                                            <div className="flex-1 space-y-2 w-full">
                                                <label className="text-[10px] font-black uppercase tracking-widest opacity-40 text-black dark:text-white">Tier Name</label>
                                                <input
                                                    type="text"
                                                    value={tier.name || ''}
                                                    onChange={e => {
                                                        const newTiers = [...ticketTiers];
                                                        if (newTiers[idx]) {
                                                            newTiers[idx] = { ...newTiers[idx], name: e.target.value };
                                                            setTicketTiers(newTiers);
                                                        }
                                                    }}
                                                    className="w-full bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 hover:border-black/20 dark:hover:border-white/20 p-4 rounded-2xl text-lg font-bold text-black dark:text-white focus:outline-none focus:border-black/30 dark:focus:border-white/30 transition-all shadow-sm"
                                                    placeholder="e.g. VIP Access"
                                                />
                                            </div>
                                            <div className="w-full md:w-40 space-y-2">
                                                <label className="text-[10px] font-black uppercase tracking-widest opacity-40 text-black dark:text-white">Base Price (R)</label>
                                                <input
                                                    type="number"
                                                    value={tier.price || 0}
                                                    onChange={e => {
                                                        const newTiers = [...ticketTiers];
                                                        if (newTiers[idx]) {
                                                            newTiers[idx] = { ...newTiers[idx], price: parseInt(e.target.value) || 0 };
                                                            setTicketTiers(newTiers);
                                                        }
                                                    }}
                                                    className="w-full bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 hover:border-black/20 dark:hover:border-white/20 p-4 rounded-2xl text-lg font-bold text-black dark:text-white focus:outline-none focus:border-black/30 dark:focus:border-white/30 transition-all shadow-sm"
                                                />
                                            </div>
                                            <div className="w-full md:w-32 space-y-2 relative">
                                                <label className="text-[10px] font-black uppercase tracking-widest opacity-40 text-black dark:text-white">Allocated</label>
                                                <input
                                                    type="number"
                                                    value={tier.quantity_limit || 0}
                                                    disabled={formData.is_seated}
                                                    onChange={e => {
                                                        const val = parseInt(e.target.value) || 0;
                                                        const currentTotal = ticketTiers.reduce((acc, t, i) => i === idx ? acc : acc + (t.quantity_limit || 0), 0);

                                                        if (plan && (currentTotal + val) > plan.tickets_limit) {
                                                            alert(`Your ${plan.name} plan is limited to ${plan.tickets_limit} tickets. You only have ${plan.tickets_limit - currentTotal} tickets remaining to allocate.`);
                                                            return;
                                                        }
                                                        const newTiers = [...ticketTiers];
                                                        if (newTiers[idx]) {
                                                            newTiers[idx] = { ...newTiers[idx], quantity_limit: val };
                                                            setTicketTiers(newTiers);
                                                        }
                                                    }}
                                                    className={`w-full bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 hover:border-black/20 dark:hover:border-white/20 p-4 rounded-2xl text-lg font-bold text-black dark:text-white focus:outline-none focus:border-black/30 dark:focus:border-white/30 transition-all shadow-sm ${formData.is_seated ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                />
                                                {plan && !formData.is_seated && (
                                                    <span className="absolute -bottom-5 left-0 text-[8px] font-black uppercase tracking-widest text-zinc-400">
                                                        Max {plan.tickets_limit - ticketTiers.reduce((acc, t, i) => i === idx ? acc : acc + (t.quantity_limit || 0), 0)} Left
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Date Selection for Ticket */}
                                        {formData.dates && formData.dates.length > 0 && (
                                            <div className="w-full">
                                                <label className="text-[10px] font-black uppercase tracking-widest opacity-30 text-black dark:text-white mb-2 block">Valid For</label>
                                                <div className="flex flex-wrap gap-2">
                                                    <button
                                                        onClick={() => {
                                                            const newTiers = [...ticketTiers];
                                                            if (newTiers[idx]) {
                                                                newTiers[idx] = { ...newTiers[idx], event_date_id: null };
                                                                setTicketTiers(newTiers);
                                                            }
                                                        }}
                                                        className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${!tier.event_date_id ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800'}`}
                                                    >
                                                        All Dates
                                                    </button>
                                                    {formData.dates.map(date => (
                                                        <button
                                                            key={date.id}
                                                            onClick={() => {
                                                                const newTiers = [...ticketTiers];
                                                                if (newTiers[idx]) {
                                                                    newTiers[idx] = { ...newTiers[idx], event_date_id: date.id };
                                                                    setTicketTiers(newTiers);
                                                                }
                                                            }}
                                                            className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${tier.event_date_id === date.id ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800'}`}
                                                        >
                                                            {date.starts_at ? new Date(date.starts_at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }) : 'Date?'}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Advanced Access Rules */}
                                        <div className="w-full border-t border-zinc-200 dark:border-zinc-800 pt-4 space-y-4">
                                            <div className="flex items-center gap-2 mb-2">
                                                <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                                <p className="text-[10px] font-black uppercase tracking-widest text-black dark:text-white opacity-70">Advanced Access Rules</p>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                <div className="space-y-1">
                                                    <label className="text-[10px] font-black uppercase tracking-widest opacity-30 text-black dark:text-white">Max Entries</label>
                                                    <input
                                                        type="number"
                                                        value={tier.access_rules?.max_entries || 1}
                                                        onChange={e => {
                                                            const newTiers = [...ticketTiers];
                                                            if (newTiers[idx]) {
                                                                const rules = newTiers[idx].access_rules || {};
                                                                newTiers[idx] = { ...newTiers[idx], access_rules: { ...rules, max_entries: parseInt(e.target.value) || 1 } };
                                                                setTicketTiers(newTiers);
                                                            }
                                                        }}
                                                        className="w-full bg-transparent border-b border-transparent group-hover:border-black/10 dark:group-hover:border-white/10 text-sm font-bold text-black dark:text-white focus:outline-none"
                                                        placeholder="1 = Single Entry"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[10px] font-black uppercase tracking-widest opacity-30 text-black dark:text-white">Cooldown (Mins)</label>
                                                    <input
                                                        type="number"
                                                        value={tier.access_rules?.cooldown_minutes || 0}
                                                        onChange={e => {
                                                            const newTiers = [...ticketTiers];
                                                            if (newTiers[idx]) {
                                                                const rules = newTiers[idx].access_rules || {};
                                                                newTiers[idx] = { ...newTiers[idx], access_rules: { ...rules, cooldown_minutes: parseInt(e.target.value) || 0 } };
                                                                setTicketTiers(newTiers);
                                                            }
                                                        }}
                                                        className="w-full bg-transparent border-b border-transparent group-hover:border-black/10 dark:group-hover:border-white/10 text-sm font-bold text-black dark:text-white focus:outline-none"
                                                        placeholder="0 = No limit"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[10px] font-black uppercase tracking-widest opacity-30 text-black dark:text-white">Allowed Zones</label>
                                                    <input
                                                        type="text"
                                                        value={tier.access_rules?.allowed_zones?.join(', ') || ''}
                                                        onChange={e => {
                                                            const newTiers = [...ticketTiers];
                                                            if (newTiers[idx]) {
                                                                const rules = newTiers[idx].access_rules || {};
                                                                const zones = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                                                                newTiers[idx] = { ...newTiers[idx], access_rules: { ...rules, allowed_zones: zones } };
                                                                setTicketTiers(newTiers);
                                                            }
                                                        }}
                                                        className="w-full bg-transparent border-b border-transparent group-hover:border-black/10 dark:group-hover:border-white/10 text-sm font-bold text-black dark:text-white focus:outline-none placeholder:opacity-40"
                                                        placeholder="e.g. general, vip, backstage"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                );

            case 5: // Review
                const estimatedMaxRevenue = ticketTiers.reduce((acc, tier) => acc + ((tier.price || 0) * (tier.quantity_limit || 0)), 0);
                const estimatedFee = estimatedMaxRevenue * 0.02; // 2% commission fee

                return (
                    <div className="space-y-12 animate-in fade-in slide-in-from-right-8 duration-700 w-full max-w-4xl mx-auto flex flex-col items-center justify-center min-h-[50vh]">
                        <div className="w-48 h-48 rounded-full bg-zinc-50 dark:bg-zinc-900/50 flex items-center justify-center shadow-xl animate-bounce border border-transparent hover:border-black/5 dark:hover:border-white/5 transition-all">
                            <Rocket className="w-16 h-16 text-black dark:text-white" />
                        </div>
                        <div className="space-y-6 max-w-2xl text-center">
                            <h3 className="text-6xl md:text-7xl font-black uppercase tracking-tighter text-black dark:text-white leading-none">All Systems Go</h3>
                            <p className="text-2xl text-zinc-400 font-medium leading-relaxed">Your event is prepped for the Yilama network. Review the details and hit publish.</p>
                        </div>

                        {/* Financial Transparency Block */}
                        <div className="w-full max-w-md p-8 bg-zinc-50 dark:bg-zinc-900/50 rounded-[3rem] text-left space-y-4 shadow-sm border border-zinc-200/50 dark:border-zinc-800/50">
                            <h4 className="font-black uppercase tracking-widest text-xs text-black dark:text-white flex items-center gap-2">
                                <BarChart3 className="w-6 h-6" /> Financial Overview
                            </h4>
                            <p className="text-[10px] uppercase font-bold tracking-widest opacity-40">Projections based on a 100% sell-out.</p>

                            <div className="space-y-2 pt-4">
                                <div className="flex justify-between text-sm font-bold text-black dark:text-white">
                                    <span>Max Projected Revenue</span>
                                    <span>R {estimatedMaxRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between text-sm font-bold text-red-500">
                                    <span>Platform Fee (2%)</span>
                                    <span>- R {estimatedFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                            </div>

                            <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4 mt-4 flex justify-between text-lg font-black text-black dark:text-white">
                                <span>Estimated Payout</span>
                                <span>R {(estimatedMaxRevenue - estimatedFee).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                        </div>
                    </div>
                );

            default: return null;
        }
    };

    // Safe Mock Event for Preview
    if (plan && activeEventsCount >= plan.events_limit) {
        return (
            <div className="fixed inset-0 bg-black/60 apple-blur z-[100] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-300">
                <div className="relative w-full max-w-2xl bg-white dark:bg-black rounded-[3rem] shadow-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 flex flex-col items-center text-center p-12 md:p-16 space-y-12">
                    <div className="w-32 h-32 bg-zinc-50 dark:bg-zinc-900/50 rounded-full flex items-center justify-center animate-bounce shadow-xl">
                        <Rocket className="w-16 h-16" />
                    </div>
                    <div className="space-y-6 w-full">
                        <h2 className="text-5xl font-black tracking-tighter uppercase text-black dark:text-white">Time for an Upgrade?</h2>
                        <div className="p-8 bg-zinc-50 dark:bg-zinc-900/50 rounded-[2rem] border border-transparent w-full">
                            <p className="text-zinc-500 font-medium text-lg">
                                Your <span className="text-black dark:text-white font-black uppercase tracking-widest">{plan.name}</span> plan is capped at <span className="text-black dark:text-white font-black">{plan.events_limit} active events</span>.
                            </p>
                        </div>
                        <p className="text-sm font-bold text-zinc-400 px-4 leading-relaxed">
                            You've hit your capacity! Upgrade now to host unlimited events and unlock lower ticket fees.
                        </p>
                    </div>
                    <div className="flex flex-col gap-4 w-full max-w-md">
                        <button
                            className="w-full py-6 bg-black dark:bg-white text-white dark:text-black rounded-full font-black text-xs uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all shadow-2xl"
                            onClick={() => window.location.href = '/settings?tab=subscription'}
                        >
                            View Business Plans
                        </button>
                        <button
                            className="w-full py-6 text-black dark:text-white rounded-full font-black text-xs uppercase tracking-widest bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-all"
                            onClick={onClose}
                        >
                            Maybe Later
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const previewEvent: Event = {
        ...formData,
        id: 'preview',
        organizer_id: user.id,
        title: formData.title || 'UNTITLED',
        description: formData.description || 'Event description...',
        starts_at: formData.starts_at || new Date().toISOString(),
        ends_at: formData.ends_at,
        image_url: formData.image_url || 'https://images.unsplash.com/photo-1514525253440-b393452e8d26?q=80&w=2670&auto=format&fit=crop',
        venue: formData.venue || 'TBA',
        category: formData.category || 'Music',
        status: 'draft',
        headliners: formData.headliners || [],
        prohibitions: formData.prohibitions || [],
        is_cooler_box_allowed: formData.is_cooler_box_allowed || false,
        parking_info: formData.parking_info,
        total_ticket_limit: formData.total_ticket_limit || 100,
        tiers: ticketTiers as TicketType[],
        price: ticketTiers.length > 0 ? Math.min(...ticketTiers.map(t => t.price || 0)) : 0,
        gross_revenue: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    } as Event;

    return (
        <div className="fixed inset-0 z-[100] flex sm:items-center sm:justify-center p-0 sm:p-6 bg-black/30 dark:bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            {/* Split Screen Container */}
            <div className="w-full h-full max-w-[1400px] flex gap-6 md:gap-8 items-stretch pt-0">

                {/* Mobile Close Button (Absolute Top Right) */}
                <button onClick={onClose} className="md:hidden absolute top-4 right-4 z-50 w-10 h-10 flex items-center justify-center bg-white/20 hover:bg-white/40 backdrop-blur-md rounded-full text-white transition-all shadow-xl border border-white/20">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>

                {/* Left Side: The Main Wizard Form */}
                <div className="flex-1 relative bg-white dark:bg-black sm:rounded-[3rem] shadow-2xl overflow-hidden border-x border-b sm:border border-zinc-100 dark:border-zinc-800 flex flex-col h-full sm:max-h-[90vh] my-auto">

                    {/* Header & Progress */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-6 sm:p-8 md:p-10 pb-4 sm:pb-6 border-b border-zinc-100 dark:border-zinc-900 gap-4">
                        <div className="flex gap-2 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0 custom-scrollbar hide-scrollbar">
                            {STEPS.map((step, idx) => (
                                <div
                                    key={step.id}
                                    className={`h-1.5 shrink-0 rounded-full transition-all duration-500 ${idx === currentStep ? 'w-12 bg-black dark:bg-white shadow-md' : idx < currentStep ? 'w-4 bg-black/20 dark:bg-white/20' : 'w-4 bg-zinc-100 dark:bg-zinc-800'}`}
                                />
                            ))}
                        </div>
                        <button onClick={onClose} className="hidden md:flex w-10 h-10 items-center justify-center bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full text-zinc-500 hover:text-black dark:hover:text-white transition-all">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto px-6 md:px-12 py-8 custom-scrollbar">
                        <div className="max-w-2xl mx-auto space-y-4">
                            <div className="flex items-center gap-4 opacity-40 mb-8 text-black dark:text-white">
                                <span className="text-sm font-black uppercase tracking-widest">0{currentStep + 1}</span>
                                <span className="text-sm font-black uppercase tracking-widest">/</span>
                                <span className="text-sm font-black uppercase tracking-widest">{STEPS[currentStep]?.title || ''}</span>
                            </div>
                            {renderStep()}
                        </div>
                    </div>

                    {/* Footer Controls */}
                    <div className="p-4 sm:p-6 md:p-10 pt-4 sm:pt-6 border-t border-zinc-100 dark:border-zinc-900 flex justify-between items-center bg-white dark:bg-black sm:rounded-b-[3rem] safe-area-bottom">
                        <button
                            onClick={handleBack}
                            disabled={currentStep === 0}
                            className={`px-6 md:px-8 py-3 md:py-4 text-[10px] md:text-xs font-black uppercase tracking-widest transition-opacity text-black dark:text-white rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-900 ${currentStep === 0 ? 'opacity-0 pointer-events-none' : 'opacity-40 hover:opacity-100'}`}
                        >
                            Back
                        </button>

                        {currentStep === STEPS.length - 1 ? (
                            <div className="flex flex-col sm:flex-row gap-3 md:gap-4 items-center">
                                <button
                                    onClick={() => handleSubmit('coming_soon')}
                                    disabled={isSubmitting}
                                    className="px-6 md:px-8 py-4 md:py-5 bg-zinc-100 dark:bg-zinc-900 border border-transparent hover:border-black/10 dark:hover:border-white/10 text-black dark:text-white rounded-full font-black text-[10px] md:text-xs uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:scale-100 whitespace-nowrap"
                                >
                                    {isSubmitting ? 'Igniting...' : 'Publish as Coming Soon'}
                                </button>
                                <button
                                    onClick={() => handleSubmit('published')}
                                    disabled={isSubmitting}
                                    className="px-8 md:px-12 py-4 md:py-5 bg-black dark:bg-white text-white dark:text-black rounded-full font-black text-[10px] md:text-xs uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-2xl flex items-center gap-3 disabled:opacity-50 disabled:hover:scale-100 whitespace-nowrap"
                                >
                                    {isSubmitting ? 'Igniting...' : 'Launch Event Now'}
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={handleNext}
                                className="px-8 md:px-12 py-4 md:py-5 bg-black dark:bg-white text-white dark:text-black rounded-full font-black text-[10px] md:text-xs uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl disabled:opacity-50 disabled:hover:scale-100"
                                disabled={
                                    (currentStep === 0 && !formData.title) ||
                                    (currentStep === 0 && !formData.category) ||
                                    (currentStep === 1 && !formData.description)
                                }
                            >
                                Continue
                            </button>
                        )}
                    </div>
                </div>

                {/* Right Side: Live Card Preview (Hidden on small screens) */}
                <div className="hidden lg:flex flex-col w-[380px] shrink-0 my-auto animate-in fade-in slide-in-from-right-8 duration-[800ms] delay-200">
                    <div className="sticky top-12 space-y-6">
                        <div className="flex items-center gap-3 opacity-60 ml-4">
                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-white drop-shadow-md">Live Preview</span>
                        </div>
                        <div className="pointer-events-none scale-100 origin-top shadow-2xl rounded-[3rem] ring-4 ring-white/10">
                            {/* We wrap EventCard in a pointer-events-none container so it acts purely as a preview UI */}
                            <EventCard event={previewEvent} isPreviewMode={true} />
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};