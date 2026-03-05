import React, { useState } from 'react';
import { EventCard } from '../components/EventCard';
import { CategoryIcon } from '../components/CategoryIcon';
import { EventCardSkeleton } from '../components/Skeleton';
import { MainModuleNav } from '../components/MainModuleNav';
import { EventCategory, Event } from '../types';
import gsap from 'gsap';
import usePlacesAutocomplete, { getGeocode, getLatLng } from 'use-places-autocomplete';
import { useLoadScript } from '@react-google-maps/api';

const libraries: any = ['places'];

interface HomeProps {
  events: Event[];
  trendingEvents: Event[];
  categories: EventCategory[];
  onEventSelect: (id: string) => void;
  onNavigate: (view: string) => void;
  isLoading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  isFetchingMore?: boolean;
}

export const HomeView: React.FC<HomeProps> = ({
  events,
  trendingEvents,
  categories,
  onEventSelect,
  onNavigate,
  isLoading = false,
  hasMore = false,
  onLoadMore,
  isFetchingMore = false
}) => {
  const [activeCategoryName, setActiveCategoryName] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<string>('anytime');
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number, lng: number } | null>(null);
  const textRef = React.useRef<HTMLSpanElement>(null);

  const { isLoaded: isMapsLoaded } = useLoadScript({
    googleMapsApiKey: (import.meta as any).env.VITE_GOOGLE_MAPS_API_KEY || '',
    libraries,
  });

  const {
    ready: placesReady,
    value: locationSearch,
    suggestions: { status: placesStatus, data: placesData },
    setValue: setLocationSearch,
    clearSuggestions: clearPlacesSuggestions,
  } = usePlacesAutocomplete({
    requestOptions: {},
    debounce: 300,
  });

  const handleLocationSelect = async (address: string) => {
    setLocationSearch(address, false);
    clearPlacesSuggestions();
    setLocationFilter(address);

    try {
      const results = await getGeocode({ address });
      const { lat, lng } = await getLatLng(results[0] as any);
      setUserLocation({ lat, lng });
      setLocationFilter("near_me");
    } catch (error) {
      console.error("Geocoding error", error);
    }
  };

  const handleNearMe = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
        setLocationSearch("Near Me", false);
        setLocationFilter("near_me");
      },
      () => {
        alert('Unable to retrieve your location. Check browser permissions.');
      }
    );
  };

  const filteredEvents = events
    .filter(e => (!activeCategoryName || e.category === activeCategoryName))
    .filter(e => {
      // Location & Proximity Filter
      if (locationFilter !== 'all') {
        if (locationFilter === 'near_me' && userLocation && e.latitude && e.longitude) {
          const R = 6371; // km
          const dLat = (e.latitude - userLocation.lat) * Math.PI / 180;
          const dLon = (e.longitude - userLocation.lng) * Math.PI / 180;
          const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(userLocation.lat * Math.PI / 180) * Math.cos(e.latitude * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          const distance = R * c;
          if (distance > 50) return false; // Within 50km
        } else if (locationFilter !== 'near_me') {
          // Fallback to exact venue string match if geocoding failed
          if (!e.venue.toLowerCase().includes(locationFilter.toLowerCase())) return false;
        }
      }

      // Date Filter
      if (dateFilter !== 'anytime') {
        const eventDate = new Date(e.starts_at);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (dateFilter === 'today') {
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);
          if (eventDate < today || eventDate >= tomorrow) return false;
        } else if (dateFilter === 'weekend') {
          // 5 = Friday, 6 = Saturday, 0 = Sunday
          const day = eventDate.getDay();
          if (day !== 5 && day !== 6 && day !== 0) return false;
          // Must be upcoming weekend (within next 7 days roughly)
          const diffTime = eventDate.getTime() - today.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          if (diffDays < 0 || diffDays > 7) return false;
        } else if (dateFilter === 'month') {
          if (eventDate.getMonth() !== today.getMonth() || eventDate.getFullYear() !== today.getFullYear()) return false;
        }
      }

      // Smart Search (Title, Venue, Headliners)
      const q = searchQuery.toLowerCase();
      if (!q) return true;

      const inTitle = e.title.toLowerCase().includes(q);
      const inVenue = e.venue.toLowerCase().includes(q);
      const inHeadliners = e.headliners?.some(h => h.toLowerCase().includes(q));

      return inTitle || inVenue || inHeadliners;
    });

  // GSAP Text Rotation
  React.useEffect(() => {
    const words = ["Local", "Live", "Premium", "Unforgettable"];
    let currentIndex = 0;

    if (!textRef.current) return;

    const interval = setInterval(() => {
      currentIndex = (currentIndex + 1) % words.length;

      const tl = gsap.timeline();

      // Exit current
      tl.to(textRef.current, {
        y: -20,
        opacity: 0,
        duration: 0.3,
        ease: "power2.in",
        onComplete: () => {
          if (textRef.current) {
            textRef.current.textContent = words[currentIndex] || "";
            // Reset position for entry
            gsap.set(textRef.current, { y: 20, opacity: 0 });
          }
        }
      })
        // Enter new
        .to(textRef.current, {
          y: 0,
          opacity: 1,
          duration: 0.4,
          ease: "back.out(1.7)"
        });

    }, 2500);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="px-6 md:px-12 py-12 max-w-[1440px] mx-auto space-y-12">
      <header className="space-y-4">
        {/* Dynamic Header Navbar replacing standalone "Events" text */}
        <MainModuleNav activeModule="events" onNavigate={onNavigate} />
        <div className="text-zinc-500 font-medium text-lg uppercase tracking-widest flex items-center gap-2 h-8 overflow-hidden pt-2">
          <span ref={textRef} className="location-text animated-gradient-text inline-block font-bold">Local</span>
        </div>
      </header>

      <section className="space-y-8">
        <div className="relative max-w-3xl">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text" placeholder="Search artists, venues, or events..." value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full themed-secondary-bg themed-text border themed-border rounded-[2rem] px-12 py-5 font-bold outline-none focus:bg-white dark:focus:bg-zinc-900 transition-all shadow-sm"
              />
              <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 opacity-30 themed-text" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>

            <button
              onClick={() => setIsFiltersOpen(!isFiltersOpen)}
              className={`px-4 sm:px-6 rounded-[2rem] border transition-all flex items-center justify-center gap-2 h-[62px] ${isFiltersOpen || dateFilter !== 'anytime' || locationFilter !== 'all' ? 'bg-black dark:bg-white text-white dark:text-black border-transparent shadow-lg' : 'themed-secondary-bg themed-text themed-border hover:border-zinc-400 dark:hover:border-zinc-600'}`}
              aria-label="Toggle Filters"
            >
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              <span className="font-black text-[10px] uppercase tracking-[0.2em]">Filters</span>
            </button>
          </div>

          {/* Expanded Filters */}
          <div className={`overflow-hidden transition-all duration-300 ${isFiltersOpen ? 'max-h-[500px] opacity-100 mt-4' : 'max-h-0 opacity-0 mt-0'}`}>
            <div className="flex flex-col sm:flex-row flex-wrap gap-4 p-4 rounded-3xl themed-secondary-bg border themed-border">
              <div className="space-y-1.5 flex-1 w-full sm:w-auto min-w-[200px]">
                <label className="text-[10px] font-black uppercase tracking-widest opacity-40 themed-text px-2">Date</label>
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="w-full bg-transparent p-3 rounded-2xl border themed-border font-bold text-sm outline-none themed-text focus:bg-white dark:focus:bg-zinc-900 appearance-none cursor-pointer"
                >
                  <option value="anytime">Anytime</option>
                  <option value="today">Today</option>
                  <option value="weekend">This Weekend</option>
                  <option value="month">This Month</option>
                </select>
              </div>

              <div className="space-y-1.5 flex-1 w-full sm:w-auto min-w-[250px]">
                <div className="flex justify-between items-end px-2">
                  <label className="text-[10px] font-black uppercase tracking-widest opacity-40 themed-text">Location</label>
                  <button onClick={handleNearMe} className="text-[10px] font-black uppercase tracking-widest text-indigo-500 hover:text-indigo-600 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    Near Me
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={locationSearch}
                    onChange={e => {
                      setLocationSearch(e.target.value);
                      if (e.target.value === '') {
                        setLocationFilter('all');
                        setUserLocation(null);
                      }
                    }}
                    disabled={!placesReady || !isMapsLoaded}
                    className="w-full bg-transparent p-3 rounded-2xl border themed-border font-bold text-sm outline-none themed-text focus:bg-white dark:focus:bg-zinc-900 transition-all placeholder:opacity-40"
                    placeholder="City, neighborhood, or venue..."
                  />
                  {placesStatus === "OK" && (
                    <ul className="absolute z-10 w-full mt-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl overflow-hidden max-h-48 overflow-y-auto">
                      {placesData.map(({ place_id, description }) => (
                        <li
                          key={place_id}
                          onClick={() => handleLocationSelect(description)}
                          className="px-4 py-3 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer themed-text text-sm font-medium transition-colors border-b last:border-0 themed-border"
                        >
                          {description}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trending Now Section */}
      {trendingEvents.length > 0 && !activeCategoryName && searchQuery === "" && (
        <section className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-4">
              <div className="space-y-0.5">
                <h2 className="text-2xl font-black uppercase tracking-tight themed-text leading-none">Trending Now</h2>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-30 italic">Fastest Selling // High Velocity</p>
              </div>
            </div>
          </div>

          <div className="relative -mx-6 md:-mx-12 px-6 md:px-12 overflow-x-auto no-scrollbar scroll-smooth">
            <div className="flex gap-6 pb-6" style={{ width: 'max-content' }}>
              {trendingEvents.map((e, i) => (
                <div
                  key={`trending-${e.id}`}
                  onClick={() => onEventSelect(e.id)}
                  className="group relative w-[320px] sm:w-[400px] aspect-[16/10] rounded-[2.5rem] overflow-hidden cursor-pointer shadow-xl hover:shadow-2xl hover:scale-[1.02] transition-all duration-500 border themed-border"
                >
                  <img src={e.image_url} alt={e.title} className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent opacity-90 group-hover:opacity-100 transition-opacity" />

                  {/* Performance Metrics */}
                  <div className="absolute top-6 left-6 flex items-center gap-2">
                    <div className="px-4 py-1.5 bg-white/10 apple-blur border border-white/20 rounded-full flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                      <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white">Top Seller #{i + 1}</span>
                    </div>
                  </div>

                  <div className="absolute bottom-6 left-6 right-6 space-y-3">
                    <div className="space-y-1">
                      <p className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.4em]">{e.category}</p>
                      <h3 className="text-2xl font-black text-white uppercase leading-none truncate">{e.title}</h3>
                    </div>
                    <div className="flex items-center gap-4 text-[10px] font-bold text-white/60">
                      <span className="flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        {e.venue}
                      </span>
                    </div>
                  </div>

                  {/* Glassmorphic Pricing Tag */}
                  <div className="absolute bottom-6 right-6">
                    <div className="w-14 h-14 rounded-2xl bg-white/10 apple-blur border border-white/20 flex flex-col items-center justify-center group-hover:scale-110 transition-transform">
                      <span className="text-[10px] font-black text-white/40 leading-none">FROM</span>
                      <span className="text-sm font-black text-white">R{e.price || (e.tiers && e.tiers[0]?.price) || 0}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
      <section className="space-y-6">
        <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
          <button
            onClick={() => setActiveCategoryName(null)}
            className={`px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-widest border-2 transition-all ${!activeCategoryName ? 'bg-black dark:bg-white text-white dark:text-black border-black dark:border-white' : 'themed-border themed-text opacity-40'}`}
          >All</button>
          {categories.map(cat => (
            <button
              key={cat.id} onClick={() => setActiveCategoryName(cat.name)}
              className={`px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-widest border-2 transition-all whitespace-nowrap flex items-center ${activeCategoryName === cat.name ? 'bg-black dark:bg-white text-white dark:text-black border-black dark:border-white' : 'themed-border themed-text opacity-40'}`}
            >
              <CategoryIcon name={cat.icon} className="mr-2" /> {cat.name}
            </button>
          ))}
        </div>
      </section >

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-10">
        {isLoading ? Array(4).fill(0).map((_, i) => <EventCardSkeleton key={i} />) :
          filteredEvents.map(event => <EventCard key={event.id} event={event} onClick={onEventSelect} />)
        }
      </div>

      {!isLoading && filteredEvents.length > 0 && hasMore && (
        <div className="flex justify-center pt-8 pb-12">
          <button
            onClick={onLoadMore}
            disabled={isFetchingMore}
            className={`px-8 py-4 rounded-full font-black text-xs uppercase tracking-widest transition-all shadow-lg ${isFetchingMore
                ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500 cursor-not-allowed'
                : 'bg-black dark:bg-white text-white dark:text-black hover:scale-[1.02] active:scale-[0.98]'
              }`}
          >
            {isFetchingMore ? 'Loading...' : 'Load More Events'}
          </button>
        </div>
      )}
    </div >
  );
};
