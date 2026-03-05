import React, { useState, useRef, useEffect } from 'react';
import { VenueZone, VenueSeat } from '../../types';
import { GeneratedLayout } from '../../lib/seatingLogic';

interface InteractiveSeatingUIProps {
    layout: GeneratedLayout;
    mode: 'organizer_setup' | 'buyer_selection';
    selectedSeatIds?: string[];
    onSeatToggle?: (seatId: string) => void;
    activeZoneId?: string; // for organizer "paint mode"
}

export function InteractiveSeatingUI({ layout, mode, selectedSeatIds = [], onSeatToggle, activeZoneId }: InteractiveSeatingUIProps) {
    const svgRef = useRef<SVGSVGElement>(null);
    const [viewBox, setViewBox] = useState(`0 0 ${layout.svgWidth} ${layout.svgHeight}`);

    // Simple pan & zoom state
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    
    // Hierarchy State
    const [currentLevel, setCurrentLevel] = useState<'venue' | 'section'>('venue');
    const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
    
    // Auto-switch to seats mode if layout has no sections (e.g. Arena/Theater)
    useEffect(() => {
        if (!layout.sections || layout.sections.length === 0) {
            setCurrentLevel('section');
        }
    }, [layout]);

    // Update viewBox when pan/zoom changes
    useEffect(() => {
        const vW = layout.svgWidth / zoom;
        const vH = layout.svgHeight / zoom;
        const vX = -pan.x / zoom;
        const vY = -pan.y / zoom;
        setViewBox(`${vX} ${vY} ${vW} ${vH}`);
    }, [pan, zoom, layout]);

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const zoomChange = e.deltaY > 0 ? 0.9 : 1.1;
        setZoom(z => Math.max(0.2, Math.min(z * zoomChange, 5)));
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        setDragStart({ x: e.clientX, y: e.clientY });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return;
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        setPan(p => ({ x: p.x + dx, y: p.y + dy }));
        setDragStart({ x: e.clientX, y: e.clientY });
    };

    const handleMouseUp = () => setIsDragging(false);

    const getZoneColor = (zoneId?: string) => {
        if (!zoneId) return '#3f3f46'; // zinc-700 fallback
        const zone = layout.zones.find(z => z.id === zoneId);
        return zone?.color_code || '#3f3f46';
    };

    const isSeatSelected = (seatId: string) => selectedSeatIds.includes(seatId);

    return (
        <div className="relative w-full h-[600px] bg-zinc-100 dark:bg-zinc-900 rounded-[2rem] overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-inner group">
            <div className="absolute top-4 left-4 z-10 flex gap-2">
                <button onClick={() => setZoom(z => Math.min(z * 1.2, 5))} className="w-10 h-10 bg-white dark:bg-black rounded-xl shadow-md border border-zinc-200 dark:border-zinc-800 flex items-center justify-center hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors text-black dark:text-white">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                </button>
                <button onClick={() => setZoom(z => Math.max(z * 0.8, 0.2))} className="w-10 h-10 bg-white dark:bg-black rounded-xl shadow-md border border-zinc-200 dark:border-zinc-800 flex items-center justify-center hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors text-black dark:text-white">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4" /></svg>
                </button>
                <button onClick={() => { 
                    setZoom(1); 
                    setPan({ x: 0, y: 0 }); 
                    if (layout.sections && layout.sections.length > 0) {
                        setCurrentLevel('venue');
                        setActiveSectionId(null);
                    }
                }} className="px-4 h-10 bg-white dark:bg-black rounded-xl shadow-md border border-zinc-200 dark:border-zinc-800 flex items-center justify-center hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors text-xs font-black uppercase tracking-widest text-black dark:text-white">
                    {currentLevel === 'section' && layout.sections && layout.sections.length > 0 ? 'Back to Overview' : 'Reset View'}
                </button>
            </div>

            <svg
                ref={svgRef}
                className="w-full h-full cursor-grab active:cursor-grabbing touch-none"
                viewBox={viewBox}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                <g>
                    {/* Stage Placeholder */}
                    <rect x={(layout.svgWidth - 300) / 2} y={20} width={300} height={60} rx={30} fill="currentColor" className="text-zinc-300 dark:text-zinc-800 flex items-center justify-center" />
                    <text x={layout.svgWidth / 2} y={55} textAnchor="middle" className="text-xl font-black uppercase tracking-[0.3em] fill-zinc-500 dark:fill-zinc-600 pointer-events-none">STAGE</text>

                    {/* Hierarchical Rendering */}
                    {currentLevel === 'venue' && layout.sections && layout.sections.length > 0 && (
                        <g className="sections-layer">
                            {layout.sections.map(section => (
                                <g 
                                    key={section.id} 
                                    className="cursor-pointer group/section transition-all hover:opacity-80"
                                    onClick={() => {
                                        setActiveSectionId(section.id);
                                        setCurrentLevel('section');
                                        
                                        // Auto-zoom to this section (rough bounding box calc could go here)
                                        setZoom(2.5); // Fixed zoom for Phase 2 demo purposes
                                        // Basic pan towards center. A true generic bounding box parser would be better, but this suffices for the template
                                        setPan({ x: -layout.svgWidth/4, y: -layout.svgHeight/4 }); 
                                    }}
                                >
                                    <path 
                                        d={section.svg_path_data} 
                                        fill={getZoneColor(section.zone_id)} 
                                        stroke="#18181b" 
                                        strokeWidth={4} 
                                        className="transition-all"
                                    />
                                    {/* Tooltip anchor could go here based on path bounds */}
                                </g>
                            ))}
                        </g>
                    )}

                    {/* Seats (Only show if in 'section' level OR no sections exist) */}
                    {(currentLevel === 'section' || !layout.sections || layout.sections.length === 0) && layout.seats
                        .filter(s => activeSectionId ? s.section_id === activeSectionId : true)
                        .map((seat, idx) => {
                            const isSelected = isSeatSelected(seat.id!);
                            const isAvailable = mode === 'organizer_setup' || seat.status === 'available';
                            const fillColor = isAvailable ? getZoneColor(seat.zone_id) : '#52525b';
                            const opacity = isAvailable ? 1 : 0.3;

                            return (
                                <g
                                    key={seat.id}
                                    transform={`translate(${seat.svg_cx}, ${seat.svg_cy})`}
                                    className={isAvailable ? "cursor-pointer transition-all hover:opacity-80" : "cursor-not-allowed"}
                                    onClick={() => {
                                        if (!isAvailable) return;
                                        // In organizer mode, clicking might re-assign the zone if a zone brush is active
                                        if (mode === 'organizer_setup' && activeZoneId) {
                                            // A parent component will handle the state update by toggling or reassigning
                                            onSeatToggle?.(seat.id!);
                                        } else {
                                            onSeatToggle?.(seat.id!);
                                        }
                                    }}
                                >
                                    <circle
                                        r={activeSectionId ? 8 : 10} // slightly smaller if deeply packed in sections
                                        fill={fillColor}
                                        stroke={isSelected ? '#fff' : 'none'}
                                        strokeWidth={isSelected ? 3 : 0}
                                        opacity={opacity}
                                        className="transition-all duration-200 drop-shadow-sm"
                                    />
                                    {isSelected && (
                                        <circle r={activeSectionId ? 12 : 14} fill="none" stroke="#fff" strokeWidth={2} className="animate-ping opacity-50 pointer-events-none" />
                                    )}
                                </g>
                            );
                        })}
                </g>
            </svg>

            {/* Legend Overlay */}
            <div className="absolute bottom-4 left-4 right-4 bg-white/80 dark:bg-black/80 backdrop-blur-md rounded-2xl p-4 border border-zinc-200 dark:border-zinc-800 shadow-xl flex flex-wrap gap-4 items-center justify-center">
                {layout.zones.map(zone => (
                    <div key={zone.id} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: zone.color_code }} />
                        <span className="text-[10px] font-black uppercase tracking-widest text-black dark:text-white opacity-80">{zone.name}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
