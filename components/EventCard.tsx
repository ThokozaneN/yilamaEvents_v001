
import React from 'react';
import { Event } from '../types';

interface EventCardProps {
  event: Event;
  onClick?: (id: string) => void;
  isPreviewMode?: boolean;
}

export const EventCard: React.FC<EventCardProps> = ({ event, onClick, isPreviewMode }) => {
  const getDisplayPrice = (): number => {
    if (event?.tiers && event.tiers.length > 0) {
      const prices = event.tiers.map(t => Number(t.price)).filter(p => !isNaN(p));
      if (prices.length > 0) return Math.min(...prices);
    }
    // Fix: Property 'price' does not exist on type 'Event'. Added to Event interface in types.ts
    return Number(event?.price) || 0;
  };

  const price = getDisplayPrice();
  const imageUrl = event?.image_url || 'https://picsum.photos/seed/yilama/800/1000';

  return (
    <div
      className={`group relative aspect-[4/5] overflow-hidden rounded-[3rem] themed-secondary-bg transition-all duration-700 hover:scale-[1.01] border themed-border ${onClick ? 'cursor-pointer' : ''} ${isPreviewMode ? 'pointer-events-none select-none' : ''}`}
      onClick={() => onClick && onClick(event.id)}
    >
      <img src={imageUrl} alt={event.title} className="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-80" />

      <div className="absolute top-8 left-8 z-10 flex flex-wrap gap-2 max-w-[70%]">
        <div className="themed-card apple-blur px-5 py-2.5 rounded-full shadow-2xl border themed-border flex items-center gap-4">
          <span className="text-[9px] font-black uppercase tracking-[0.2em] themed-text">
            {(() => {
              try {
                const date = new Date(event.starts_at);
                return !isNaN(date.getTime()) ? date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }) : 'TBA';
              } catch (e) {
                return 'TBA';
              }
            })()}
          </span>
          <div className="w-[1px] h-3 themed-border border-l" />
          <span className="text-xs font-bold themed-text">R{price}</span>
        </div>
      </div>

      <div className="absolute bottom-8 left-8 right-8 z-10 flex flex-col gap-3">
        {event.headliners && event.headliners.length > 0 && (
          <p className="text-white/60 text-[9px] font-black uppercase tracking-[0.3em]">
            Featuring: {event.headliners.join(' • ')}
          </p>
        )}
        <h3 className="text-white font-black text-3xl tracking-tighter leading-none uppercase">
          {event.title}
        </h3>
        <p className="text-white/80 text-[10px] font-medium leading-relaxed line-clamp-2 uppercase tracking-widest">
          {event.venue}
        </p>
      </div>
    </div>
  );
};
