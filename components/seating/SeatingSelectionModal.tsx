import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { InteractiveSeatingUI } from './InteractiveSeatingUI';
import { GeneratedLayout, calculateDynamicSeatPrice } from '../../lib/seatingLogic';
import { TicketType } from '../../types';

interface SeatingSelectionModalProps {
    eventId: string;
    baseTier: TicketType; // We use the selected tier as base price
    onClose: () => void;
    onConfirmSelection: (seatIds: string[], totalPrice: number) => void;
}

export function SeatingSelectionModal({ eventId, baseTier, onClose, onConfirmSelection }: SeatingSelectionModalProps) {
    const [layout, setLayout] = useState<GeneratedLayout | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedSeatIds, setSelectedSeatIds] = useState<string[]>([]);

    useEffect(() => {
        const fetchLayout = async () => {
            try {
                // Fetch layout and all nested zones/sections/seats
                const { data: layoutData, error: layoutError } = await supabase
                    .from('venue_layouts')
                    .select('*, zones:venue_zones(*, seats:venue_seats(*)), sections:venue_sections(*)')
                    .eq('event_id', eventId)
                    .single();

                if (layoutError) throw layoutError;

                if (layoutData) {
                    const zones = layoutData.zones;
                    const sections = layoutData.sections;
                    const allSeats = zones.flatMap((z: any) => z.seats);

                    setLayout({
                        zones: zones,
                        sections: sections,
                        seats: allSeats,
                        // If custom svgWidth/Height were stored, we'd use them. Otherwise default 800x600.
                        svgWidth: 800,
                        svgHeight: 600
                    });
                }
            } catch (err) {
                console.error("Failed to fetch layout:", err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchLayout();
    }, [eventId]);

    const handleSeatToggle = (seatId: string) => {
        const seat = layout?.seats.find(s => s.id === seatId);
        if (!seat || seat.status !== 'available') return;

        setSelectedSeatIds(prev =>
            prev.includes(seatId)
                ? prev.filter(id => id !== seatId)
                : [...prev, seatId]
        );
    };

    const calculateTotal = () => {
        if (!layout) return 0;
        let total = 0;
        selectedSeatIds.forEach(id => {
            const seat = layout.seats.find(s => s.id === id);
            if (seat) {
                const zone = layout.zones.find(z => z.id === seat.zone_id);
                if (zone) {
                    total += calculateDynamicSeatPrice(
                        baseTier.price,
                        zone as any,
                        seat as any
                    );
                }
            }
        });
        return total;
    };

    const totalPrice = calculateTotal();

    if (isLoading) {
        return (
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-md">
                <div className="animate-spin w-10 h-10 border-4 border-white border-t-transparent rounded-full" />
            </div>
        );
    }

    if (!layout) {
        return (
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-md">
                <div className="bg-white p-6 rounded-3xl">
                    <p className="text-black font-bold">No interactive seating found for this event.</p>
                    <button onClick={onClose} className="mt-4 px-4 py-2 bg-black text-white rounded-full">Close</button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-xl p-4 sm:p-6 lg:p-12 animate-in fade-in duration-300">
            <div className="w-full max-w-6xl h-full max-h-[90vh] bg-zinc-50 dark:bg-black rounded-[3rem] shadow-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 flex flex-col relative">

                {/* Header */}
                <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-white dark:bg-zinc-950 z-10">
                    <div>
                        <h2 className="text-2xl font-black uppercase tracking-tighter text-black dark:text-white">Select Your Seats</h2>
                        <p className="text-xs font-bold uppercase tracking-widest opacity-50 text-black dark:text-white">Base Tier: {baseTier.name} (R{baseTier.price})</p>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 bg-zinc-100 dark:bg-zinc-900 rounded-full flex items-center justify-center hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors text-black dark:text-white">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* Map */}
                <div className="flex-1 bg-zinc-100 dark:bg-zinc-900 overflow-hidden relative p-4">
                    <InteractiveSeatingUI
                        layout={layout}
                        mode="buyer_selection"
                        selectedSeatIds={selectedSeatIds}
                        onSeatToggle={handleSeatToggle}
                    />
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col sm:flex-row justify-between items-center gap-4 z-10">
                    <div className="flex items-center gap-4 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0">
                        {selectedSeatIds.map(id => {
                            const seat = layout.seats.find(s => s.id === id);
                            const zone = layout.zones.find(z => z.id === seat?.zone_id);
                            const price = seat && zone ? calculateDynamicSeatPrice(
                                baseTier.price,
                                zone as any,
                                seat as any
                            ) : 0;
                            return (
                                <div key={id} className="flex flex-col flex-shrink-0 px-4 py-2 bg-black text-white dark:bg-white dark:text-black rounded-xl">
                                    <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Row {seat?.row_identifier}</span>
                                    <span className="text-sm font-black">Seat {seat?.seat_identifier}</span>
                                    <span className="text-[10px] font-bold mt-1">R{price.toFixed(2)}</span>
                                </div>
                            );
                        })}
                        {selectedSeatIds.length === 0 && (
                            <p className="text-xs font-black uppercase tracking-widest opacity-30 px-4 text-black dark:text-white">Click seats on the map to select</p>
                        )}
                    </div>

                    <button
                        onClick={() => onConfirmSelection(selectedSeatIds, totalPrice)}
                        disabled={selectedSeatIds.length === 0}
                        className="w-full sm:w-auto px-10 py-5 bg-purple-600 text-white rounded-full font-black text-xs uppercase tracking-[0.2em] shadow-xl hover:bg-purple-500 active:scale-95 transition-all disabled:opacity-50 disabled:hover:bg-purple-600 disabled:active:scale-100 flex-shrink-0"
                    >
                        Confirm {selectedSeatIds.length} Seat{selectedSeatIds.length !== 1 ? 's' : ''} (R{totalPrice.toFixed(2)})
                    </button>
                </div>

            </div>
        </div>
    );
}
