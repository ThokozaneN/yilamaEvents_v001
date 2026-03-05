import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Event } from '../types';
import { parseSVGLayout, GeneratedLayout } from '../lib/seatingLogic';
import { InteractiveSeatingUI } from '../components/seating/InteractiveSeatingUI';

interface VenueBuilderProps {
    eventId: string;
    onClose: () => void;
    onComplete: () => void;
}

export function VenueBuilder({ eventId, onClose, onComplete }: VenueBuilderProps) {
    const [event, setEvent] = useState<Event | null>(null);
    const [layout, setLayout] = useState<GeneratedLayout | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<'custom' | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [activeZoneId, setActiveZoneId] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const fetchEvent = async () => {
            const { data, error } = await supabase.from('events').select('*').eq('id', eventId).single();
            if (error) setErrorMsg(error.message);
            else setEvent(data);
            setIsLoading(false);
        };
        fetchEvent();
    }, [eventId]);

    // Templates removed per user request (Phase 3)
    const handleSVGUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (readEvent) => {
            const content = readEvent.target?.result as string;
            if (content) {
                setSelectedTemplate('custom');
                const capacity = event?.total_ticket_limit || 500;
                setLayout(parseSVGLayout(content, capacity));
                setActiveZoneId(null);
            }
        };
        reader.onerror = () => setErrorMsg("Failed to read SVG file.");
        reader.readAsText(file);
    };

    const handleSeatToggle = (seatId: string) => {
        if (!layout || !activeZoneId) return;
        const newSeats = layout.seats.map(s => {
            if (s.id === seatId) {
                return { ...s, zone_id: activeZoneId };
            }
            return s;
        });
        setLayout({ ...layout, seats: newSeats });
    };

    const handleSaveLayout = async () => {
        if (!layout || !event) return;
        setIsSaving(true);
        setErrorMsg(null);

        try {
            // 1. Create Layout record
            const { data: layoutData, error: layoutError } = await supabase
                .from('venue_layouts')
                .insert([{
                    event_id: event.id,
                    name: `${event.title} - ${selectedTemplate} Layout`,
                    total_capacity: event.total_ticket_limit || layout.seats.length,
                    status: 'published'
                }])
                .select()
                .single();

            if (layoutError) throw layoutError;

            // 2. Create Zones and map their IDs
            const currentZones = [...layout.zones];
            for (let i = 0; i < currentZones.length; i++) {
                const zone = currentZones[i];
                if (!zone || !zone.name) continue;
                const { data: zData, error: zError } = await supabase
                    .from('venue_zones')
                    .insert([{
                        layout_id: layoutData.id,
                        name: zone.name,
                        color_code: zone.color_code,
                        price_multiplier: zone.price_multiplier,
                        capacity: zone.capacity
                    }])
                    .select()
                    .single();

                if (zError) throw zError;

                // Update seats with new real database zone ID
                layout.seats.forEach(s => {
                    if (s.zone_id === zone.id) s.zone_id = zData.id;
                });
                
                // Update sections with real database zone ID
                if (layout.sections) {
                    layout.sections.forEach(sec => {
                        if (sec.zone_id === zone.id) sec.zone_id = zData.id;
                    });
                }
            }

            // 2.5 Create Sections (if any) and map their IDs
            if (layout.sections && layout.sections.length > 0) {
                for (let i = 0; i < layout.sections.length; i++) {
                    const sec = layout.sections[i];
                    const { data: secData, error: secError } = await supabase
                        .from('venue_sections')
                        .insert([{
                            layout_id: layoutData.id,
                            name: sec.name,
                            svg_path_data: sec.svg_path_data,
                            color_code: sec.color_code,
                            zone_id: sec.zone_id,
                            capacity: sec.capacity
                        }])
                        .select()
                        .single();
                        
                    if (secError) throw secError;
                    
                    // Update seats with new real database section ID
                    layout.seats.forEach(s => {
                        if (s.section_id === sec.id) s.section_id = secData.id;
                    });
                }
            }

            // 3. Create Seats (chunked if large, but 1000ish is fine for a single insert typically)
            const chunkSize = 1000;
            for (let i = 0; i < layout.seats.length; i += chunkSize) {
                const chunk = layout.seats.slice(i, i + chunkSize);
                const seatsToInsert = chunk.map(s => ({
                    zone_id: s.zone_id,
                    section_id: s.section_id,
                    row_identifier: s.row_identifier,
                    seat_identifier: s.seat_identifier,
                    svg_cx: s.svg_cx,
                    svg_cy: s.svg_cy,
                    positional_modifier: s.positional_modifier,
                    status: 'available'
                }));

                const { error: sError } = await supabase.from('venue_seats').insert(seatsToInsert);
                if (sError) throw sError;
            }

            // 4. Update Event with layout_id and updated capacity
            await supabase.from('events').update({ 
                layout_id: layoutData.id,
                total_ticket_limit: event.total_ticket_limit 
            }).eq('id', event.id);

            onComplete();
        } catch (err: any) {
            setErrorMsg(err.message || 'Failed to save layout');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 backdrop-blur-md">
            <div className="animate-spin w-12 h-12 border-4 border-white/20 border-t-white rounded-full" />
        </div>
    );

    return (
        <div className="fixed inset-0 z-[150] flex flex-col items-center justify-center bg-black/80 backdrop-blur-md p-4 sm:p-6 lg:p-12 animate-in fade-in duration-300">
            <div className="w-full max-w-7xl h-full max-h-[90vh] bg-white dark:bg-black rounded-[3rem] shadow-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 flex flex-col">

                <div className="flex justify-between items-center p-6 lg:p-8 border-b border-zinc-100 dark:border-zinc-900">
                    <div>
                        <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tighter text-black dark:text-white leading-none">Venue Builder</h2>
                        <p className="text-zinc-500 font-bold uppercase tracking-widest text-[10px] mt-1">{event?.title}</p>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 bg-zinc-100 dark:bg-zinc-900 rounded-full flex items-center justify-center hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
                    {/* Left Panel: Controls */}
                    <div className="w-full lg:w-80 p-6 lg:p-8 border-r border-zinc-100 dark:border-zinc-900 overflow-y-auto space-y-8">
                        {errorMsg && (
                            <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-bold rounded-2xl">
                                {errorMsg}
                            </div>
                        )}

                        <div className="space-y-4">
                            <h3 className="text-xs font-black uppercase tracking-widest opacity-40 text-black dark:text-white">Venue Configuration</h3>
                            <div className="grid grid-cols-1 gap-4">
                                <input
                                    type="file"
                                    accept=".svg"
                                    className="hidden"
                                    ref={fileInputRef}
                                    onChange={handleSVGUpload}
                                />
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className={`p-6 rounded-3xl border text-left transition-all ${selectedTemplate === 'custom' ? 'border-black dark:border-white shadow-xl bg-black dark:bg-white text-white dark:text-black' : 'border-zinc-200 dark:border-zinc-800 hover:border-black/50 dark:hover:border-white/50 bg-white dark:bg-zinc-950 text-black dark:text-white'}`}
                                >
                                    <div className="text-2xl mb-2 flex items-center gap-2">🗺️ {selectedTemplate === 'custom' && <span className="text-sm">✓ Uploaded</span>}</div>
                                    <h4 className="font-black text-xs uppercase tracking-widest">Custom SVG Upload</h4>
                                    <p className="text-[10px] opacity-60 mt-1">Map seats from vector paths</p>
                                </button>
                                
                                {layout && (
                                    <div className="p-4 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl space-y-2 relative overflow-hidden">
                                        <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-purple-500/10 to-transparent rounded-bl-full" />
                                        <label className="text-[10px] font-black uppercase tracking-widest opacity-50 block">Venue Capacity</label>
                                        <div className="flex items-center gap-2">
                                            <input 
                                                type="number"
                                                value={event?.total_ticket_limit || ''}
                                                onChange={e => setEvent(prev => prev ? { ...prev, total_ticket_limit: parseInt(e.target.value) || 0 } : null)}
                                                className="w-full bg-transparent text-xl font-black outline-none border-b border-black/10 dark:border-white/10 focus:border-purple-500 transition-colors py-1"
                                                placeholder="0"
                                            />
                                            <span className="text-xs font-bold opacity-30 uppercase tracking-widest">Seats</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {layout && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-left-4">
                                <h3 className="text-xs font-black uppercase tracking-widest opacity-40 text-black dark:text-white">Zone Brush</h3>
                                <p className="text-[10px] opacity-60">Select a zone and click seats to reassign them.</p>
                                <div className="space-y-3">
                                    {layout.zones.map(z => {
                                        if (!z) return null;
                                        const count = layout.seats.filter(s => s.zone_id === z.id).length;
                                        return (
                                            <button
                                                key={z.id}
                                                onClick={() => setActiveZoneId(z.id || null)}
                                                className={`w-full text-left p-4 rounded-2xl border transition-all ${activeZoneId === z.id ? 'border-purple-500 bg-purple-500/10 shadow-md ring-2 ring-purple-500/50' : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-100 dark:border-zinc-800 hover:border-black/20 dark:hover:border-white/20'}`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="w-4 h-4 rounded-full shadow-sm" style={{ backgroundColor: z.color_code }} />
                                                    <div className="flex-1">
                                                        <p className="text-xs font-black uppercase tracking-widest truncate">{z.name}</p>
                                                        <p className="text-[10px] opacity-50 font-bold">{count} Seats • {z.price_multiplier}x multiplier</p>
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                                <div className="pt-4 border-t border-zinc-100 dark:border-zinc-900">
                                    <p className="text-[10px] opacity-50 font-bold">Total Seats: {layout.seats.length}</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right Panel: Preview */}
                    <div className="flex-1 p-6 lg:p-8 bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center overflow-hidden relative">
                        {layout ? (
                            <InteractiveSeatingUI
                                layout={layout}
                                mode="organizer_setup"
                                activeZoneId={activeZoneId || undefined}
                                onSeatToggle={handleSeatToggle}
                            />
                        ) : (
                            <div className="text-center space-y-4 opacity-40">
                                <div className="text-6xl animate-bounce">🗺️</div>
                                <p className="text-sm font-black uppercase tracking-widest">Select a template to generate layout</p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-6 lg:p-8 border-t border-zinc-100 dark:border-zinc-900 flex justify-between items-center bg-white dark:bg-black">
                    <button onClick={onClose} className="px-8 py-4 rounded-full font-black text-xs uppercase tracking-widest bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors">
                        Skip
                    </button>
                    <button
                        onClick={handleSaveLayout}
                        disabled={!layout || isSaving}
                        className="px-8 py-4 rounded-full font-black text-xs uppercase tracking-widest bg-black dark:bg-white text-white dark:text-black shadow-xl hover:scale-105 transition-all disabled:opacity-50 disabled:hover:scale-100 flex items-center gap-2"
                    >
                        {isSaving ? 'Deploying...' : 'Save & Publish Layout'}
                    </button>
                </div>
            </div>
        </div>
    );
}
