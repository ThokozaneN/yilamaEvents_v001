import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { supabase, SUPABASE_URL } from './lib/supabase';
import { Event as AppEvent, Ticket, Profile, UserRole, EventCategory } from './types';
import { Navbar } from './components/Navbar';
import { FloatingNav } from './components/FloatingNav';
import { Preloader } from './components/Preloader';
import { Toast, ToastType } from './components/Toast';
import { TransitionOverlay } from './components/TransitionOverlay';
import { logError } from './lib/monitoring';

const lazyWithRetry = (componentImport: () => Promise<any>) =>
  lazy(async () => {
    const pageHasAlreadyBeenForceRefreshed = JSON.parse(
      window.sessionStorage.getItem('page-has-been-force-refreshed') || 'false'
    );

    try {
      const component = await componentImport();
      window.sessionStorage.setItem('page-has-been-force-refreshed', 'false');
      return component;
    } catch (error) {
      if (!pageHasAlreadyBeenForceRefreshed) {
        // A temporary error like a chunk load failure. 
        // Refresh the page to get the latest bundle and index.html.
        window.sessionStorage.setItem('page-has-been-force-refreshed', 'true');
        return window.location.reload();
      }

      // The error is persistent. Rethrow it so it's handled by ErrorBoundary.
      throw error;
    }
  });

const HomeView = lazyWithRetry(() => import('./views/Home.tsx').then(m => ({ default: m.HomeView })));
const EventDetailView = lazyWithRetry(() => import('./views/EventDetail.tsx').then(m => ({ default: m.EventDetailView })));
const WalletView = lazyWithRetry(() => import('./views/Wallet.tsx').then(m => ({ default: m.WalletView })));
const AuthView = lazyWithRetry(() => import('./views/Auth.tsx').then(m => ({ default: m.AuthView })));
const OrganizerDashboardView = lazyWithRetry(() => import('./views/OrganizerDashboard.tsx').then(m => ({ default: m.OrganizerDashboard })));
const ScannerView = lazyWithRetry(() => import('./views/Scanner.tsx').then(m => ({ default: m.ScannerView })));
const SettingsView = lazyWithRetry(() => import('./views/Settings.tsx').then(m => ({ default: m.SettingsView })));
const ResaleMarketplaceView = lazyWithRetry(() => import('./views/ResaleMarketplace.tsx').then(m => ({ default: m.ResaleMarketplaceView })));
const ExperiencesMarketplaceView = lazyWithRetry(() => import('./views/ExperiencesMarketplace.tsx').then(m => ({ default: m.ExperiencesMarketplaceView })));
const NotificationsView = lazyWithRetry(() => import('./views/Notifications.tsx').then(m => ({ default: m.NotificationsView })));

export type ThemeType = 'light' | 'dark' | 'matte-black';

const ViewLoader = () => (
  <div className="min-h-[60vh] flex items-center justify-center">
    <div className="w-10 h-10 border-2 border-black dark:border-white border-t-transparent rounded-full animate-spin opacity-20" />
  </div>
);

export default function App() {
  const [isPreloading, setIsPreloading] = useState(true);
  const [areEventsLoading, setAreEventsLoading] = useState(true);
  const [user, setUser] = useState<Profile | null>(null);
  const [authSessionChecked, setAuthSessionChecked] = useState(false);
  const [currentView, setCurrentView] = useState('home');
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [hasMoreEvents, setHasMoreEvents] = useState(true);
  const [lastEventDate, setLastEventDate] = useState<string | null>(null);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [trendingEvents, setTrendingEvents] = useState<AppEvent[]>([]);
  const [categories, setCategories] = useState<EventCategory[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState<AppEvent | null>(null);
  const [theme, setTheme] = useState<ThemeType>(() => {
    // 1. User's saved preference
    const saved = localStorage.getItem('yilama-theme') as ThemeType | null;
    if (saved && ['light', 'dark', 'matte-black'].includes(saved)) return saved;
    // 2. Browser / OS preference
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
    return 'light';
  });
  const [toast, setToast] = useState<{ message: string, type: ToastType } | null>(null);
  const [transitionState, setTransitionState] = useState<{ isActive: boolean, targetView: string | null, forceUser: Profile | null }>({ isActive: false, targetView: null, forceUser: null });
  const [accessibility, setAccessibility] = useState({ reducedMotion: false, highContrast: false, largeText: false });
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    document.documentElement.classList.toggle('reduced-motion', accessibility.reducedMotion);
    document.documentElement.classList.toggle('high-contrast', accessibility.highContrast);
    document.documentElement.classList.toggle('large-text', accessibility.largeText);
  }, [accessibility]);

  // Fail-safe for Preloader
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!authSessionChecked) {
        console.warn("[AUTH_AUDIT] Auth initialization taking too long (>8s). Forcing ready state.");
        setAuthSessionChecked(true);
      }
    }, 8000);
    return () => clearTimeout(timer);
  }, [authSessionChecked]);

  // Apply theme class to <html> and persist to localStorage
  useEffect(() => {
    const isDark = theme === 'dark' || theme === 'matte-black';
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('yilama-theme', theme);
  }, [theme]);

  // Also respond to OS-level dark/light changes in real time
  useEffect(() => {
    const saved = localStorage.getItem('yilama-theme');
    if (saved) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setTheme(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const toggleAccessibility = useCallback((key: keyof typeof accessibility) => {
    setAccessibility(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const isMounted = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fetchProfileRef = useRef<((id: string, isFresh?: boolean) => Promise<void>) | null>(null);
  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    if (!isMounted.current) return;
    setToast({ message, type });
  }, []);

  const handleNavigate = useCallback((view: string, forceUser: Profile | null = null) => {
    const activeUser = forceUser || user;

    // Check auth for protected routes first
    if (!activeUser && view !== 'home' && view !== 'eventDetail' && view !== 'auth' && view !== 'resale' && view !== 'experiences') {
      setCurrentView('auth');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (activeUser && activeUser.role === UserRole.USER) {
      if (view === 'scanner' || view === 'organizer') {
        showToast("Access Denied: Organizer permissions required.", "error");
        return;
      }
    }

    // Strict Role Enforcement for Scanners
    if (activeUser && activeUser.role === UserRole.SCANNER) {
      if (view !== 'scanner' && view !== 'auth') {
        setCurrentView('scanner');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
    }

    // Role guard for scanner: only scanners, organizers, and admins can access
    if (view === 'scanner' && activeUser) {
      const allowed = [UserRole.SCANNER, UserRole.ORGANIZER, UserRole.ADMIN];
      if (!allowed.includes(activeUser.role)) {
        showToast("Access Denied: Scanner permissions required.", "error");
        return;
      }
    }

    // Trigger Transition Animation if moving between major modules
    if ((currentView === 'home' && view === 'experiences') || (currentView === 'experiences' && view === 'home')) {
      setTransitionState({ isActive: true, targetView: view, forceUser });
      return;
    }

    // Direct navigation
    setCurrentView(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [user, showToast, currentView]);

  const handleTransitionComplete = useCallback(() => {
    if (transitionState.targetView) {
      setCurrentView(transitionState.targetView);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [transitionState.targetView]);

  // Enforce Scanner restriction on refresh or view changes
  useEffect(() => {
    if (user?.role === UserRole.SCANNER && currentView !== 'scanner' && currentView !== 'auth') {
      setCurrentView('scanner');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [user, currentView]);

  const fetchUnreadCount = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase.rpc('get_unread_count');
    if (!error && isMounted.current) setUnreadNotifications(data || 0);
  }, [user]);

  const fetchTickets = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('tickets')
        .select('*, event:events(*), ticket_type:ticket_types(*)')
        .eq('owner_user_id', userId)
        .order('created_at', { ascending: false });

      if (!isMounted.current) return;
      if (error) throw error;
      if (data) setTickets(data as Ticket[]);
    } catch (err: any) {
      logError(err, { userId, tag: 'fetch_tickets' });
    }
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('event_categories').select('*').eq('is_active', true).order('sort_order');
      if (error) throw error;
      if (isMounted.current) setCategories(data || []);
    } catch (err) {
      logError(err, { tag: 'fetch_categories' });
    }
  }, []);

  const fetchProfile = useCallback(async (userId: string, isFreshSignIn = false) => {
    if (!isMounted.current) return;
    try {
      console.log(`[AUTH_AUDIT] Fetching profile for ${userId}...`);

      // Use a timeout for the profile fetch to prevent indefinite hangs
      const profilePromise = (async () => {
        // 1. Try the composite view first
        const { data: profile } = await supabase
          .from('v_composite_profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        if (profile) return profile;

        // 2. Fallback to direct profiles table if view is empty or failed
        console.warn("[AUTH_AUDIT] v_composite_profiles fallback to profiles table...");
        const { data: baseProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        return baseProfile;
      })();

      // Strict 15s timeout on the DB operation to account for cold starts
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Profile fetch timed out")), 15000)
      );

      const data = await Promise.race([profilePromise, timeoutPromise]) as Profile | null;

      if (!isMounted.current) return;
      if (!data) {
        console.warn("[AUTH_AUDIT] Profile result is empty.");
        setAuthSessionChecked(true);
        return;
      }

      console.log(`[AUTH_AUDIT] Profile sync succeeded for ${data.email || userId}`);
      const { data: { session } } = await supabase.auth.getSession();
      const profile = { ...data, email_verified: !!session?.user?.email_confirmed_at } as Profile;
      setUser(profile);
      fetchTickets(userId);
      fetchUnreadCount();
      setAuthSessionChecked(true);
      if (isFreshSignIn) {
        if (profile.role === UserRole.SCANNER) {
          handleNavigate('scanner', profile);
        } else {
          handleNavigate(profile.role === UserRole.ORGANIZER ? 'organizer' : 'home', profile);
        }
        showToast(`Welcome, ${profile.name}`, "success");
      }
    } catch (err: any) {
      logError(err, { userId, tag: 'fetch_profile' });
      if (isMounted.current) setAuthSessionChecked(true);
    }
  }, [fetchTickets, fetchUnreadCount, showToast, handleNavigate]);

  useEffect(() => {
    fetchProfileRef.current = fetchProfile;
  }, [fetchProfile]);

  const fetchEvents = useCallback(async () => {
    // Cancel previous request if any
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    setAreEventsLoading(true);
    let timeoutId: NodeJS.Timeout | null = null;
    try {
      timeoutId = setTimeout(() => abortControllerRef.current?.abort("Request Timeout"), 12000);

      // Call the new unified RPC that returns both personalized and trending in one go
      const { data, error } = await supabase
        .rpc('get_discovery_events', user ? { p_user_id: user.id } : undefined)
        .abortSignal(abortControllerRef.current.signal);

      if (timeoutId) clearTimeout(timeoutId);
      if (!isMounted.current) return;

      if (!error && data) {
        setEvents(data.personalized || []);

        // Setup pagination cursor logic
        const pEvents = data.personalized || [];
        if (pEvents.length > 0) {
          setLastEventDate(pEvents[pEvents.length - 1].created_at);
        }

        // Determine if more events exist
        if (pEvents.length < 50) {
          setHasMoreEvents(false);
        } else {
          setHasMoreEvents(true);
        }

        setTrendingEvents(data.trending || []);
      } else {
        // Fallback: direct query for all published events
        const nowStr = new Date().toISOString();
        const sixHoursAgo = new Date(new Date().getTime() - 6 * 60 * 60 * 1000).toISOString();

        const { data: fallbackData } = await supabase
          .from('events')
          .select('*, tiers:ticket_types(id, name, price, quantity_limit, quantity_sold), organizer:profiles(business_name, organizer_status, organizer_tier, instagram_handle, twitter_handle, facebook_handle, website_url)')
          .eq('status', 'published')
          .or(`ends_at.gte.${nowStr},and(ends_at.is.null,starts_at.gte.${sixHoursAgo})`)
          .order('created_at', { ascending: false })
          .limit(50);

        if (isMounted.current) {
          const fbData = (fallbackData as AppEvent[]) || [];
          setEvents(fbData);
          if (fbData.length > 0) {
            const lastEvent = fbData[fbData.length - 1];
            if (lastEvent?.created_at) {
              setLastEventDate(lastEvent.created_at);
            }
          }
          if (fbData.length < 50) {
            setHasMoreEvents(false);
          } else {
            setHasMoreEvents(true);
          }
        }
      }
    } catch (err: any) {
      if (timeoutId) clearTimeout(timeoutId);

      const isAbortError =
        err.name === 'AbortError' ||
        err.code === 'ABORT_ERR' ||
        err.code === 20 ||
        (err.message && err.message.toLowerCase().includes('abort'));

      if (isAbortError) {
        console.debug("Events fetch aborted - intentional cancellation");
        return;
      }

      // Last-resort fallback on any other error
      try {
        const { data } = await supabase
          .from('events')
          .select('*, tiers:ticket_types(id, name, price, quantity_limit, quantity_sold), organizer:profiles(business_name, organizer_status, organizer_tier, instagram_handle, twitter_handle, facebook_handle, website_url)')
          .eq('status', 'published')
          .order('created_at', { ascending: false })
          .limit(50);
        if (isMounted.current) {
          const dataArr = (data as AppEvent[]) || [];
          if (dataArr.length > 0) {
            const lastEvt = dataArr[dataArr.length - 1];
            if (lastEvt?.created_at) {
              setLastEventDate(lastEvt.created_at);
            }
          }
          setEvents(dataArr);
        }
      } catch (innerErr: any) {
        console.error("FETCH EVENTS ERROR:", innerErr.message || innerErr);
      }
    } finally {
      if (isMounted.current) setAreEventsLoading(false);
    }
  }, [user]);

  const fetchMoreEvents = useCallback(async () => {
    if (isFetchingMore || !hasMoreEvents || !lastEventDate) return;
    setIsFetchingMore(true);

    try {
      const nowStr = new Date().toISOString();
      const sixHoursAgo = new Date(new Date().getTime() - 6 * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('events')
        .select('*, tiers:ticket_types(id, name, price, quantity_limit, quantity_sold), organizer:profiles(business_name, organizer_status, organizer_tier, instagram_handle, twitter_handle, facebook_handle, website_url)')
        .eq('status', 'published')
        .or(`ends_at.gte.${nowStr},and(ends_at.is.null,starts_at.gte.${sixHoursAgo})`)
        .lt('created_at', lastEventDate) // Cursor Filter
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const newEvents = (data as AppEvent[]) || [];
      if (isMounted.current) {
        if (newEvents.length > 0) {
          setEvents(prev => [...prev, ...newEvents]);
          const lastNewEvt = newEvents[newEvents.length - 1];
          if (lastNewEvt?.created_at) {
            setLastEventDate(lastNewEvt.created_at);
          }
        }
        if (newEvents.length < 50) {
          setHasMoreEvents(false);
        }
      }
    } catch (err) {
      console.error("Fetch More Error:", err);
    } finally {
      setIsFetchingMore(false);
    }
  }, [isFetchingMore, hasMoreEvents, lastEventDate]);


  // Initial Data Fetch (Independent of User initially, then reacts)
  useEffect(() => {
    if (!SUPABASE_URL || SUPABASE_URL === '') {
      logError("SUPABASE_URL is missing from environment", { tag: 'init' });
      setAuthSessionChecked(true);
      return;
    }
    fetchCategories();
    fetchEvents();
  }, [fetchCategories, fetchEvents]);

  // Centralized Auth State Listener
  useEffect(() => {
    isMounted.current = true;

    // 1. Initial Session Check
    const initSession = async () => {
      console.log("[AUTH_AUDIT] Initializing session check...");
      try {
        const { data: { session } } = await supabase.auth.getSession();
        console.log(`[AUTH_AUDIT] Initial session state: ${session ? 'Authenticated' : 'Anonymous'}`);
        if (session && isMounted.current) {
          await fetchProfile(session.user.id);
        } else if (isMounted.current) {
          setAuthSessionChecked(true);
        }
      } catch (err) {
        console.error("[AUTH_AUDIT] initSession CRASHED:", err);
        if (isMounted.current) setAuthSessionChecked(true);
      }
    };
    initSession();

    // 2. Continuous Listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log(`[AUTH_AUDIT] Event: ${event}`);

      if (!isMounted.current) return;

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        if (session?.user) {
          await fetchProfileRef.current?.(session.user.id);
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setTickets([]);
        setUnreadNotifications(0);
        setAuthSessionChecked(true);
      } else if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
      }
    });

    return () => {
      isMounted.current = false;
      abortControllerRef.current?.abort();
      subscription.unsubscribe();
    };
  }, []); // Break the dependency on fetchProfile

  // Realtime subscription for unread notifications (replaces 60s polling)
  useEffect(() => {
    if (!user) return;
    fetchUnreadCount();
    fetchTickets(user.id);

    const channel = supabase
      .channel(`user-notifications-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => { fetchUnreadCount(); }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => { fetchUnreadCount(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id, fetchUnreadCount, fetchTickets]);

  // ── PAYMENT STATUS: Handle return from PayFast (URL has ?payment=success or ?payment=cancelled)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get('payment');
    if (paymentStatus === 'success') {
      showToast('Payment successful! Your tickets are in your wallet.', 'success');
      handleNavigate('wallet');
      window.history.replaceState({}, '', window.location.pathname); // clean URL
      if (user) {
        // Fetch immediately, then retry after 3s to catch async ITN confirmation
        fetchTickets(user.id);
        fetchUnreadCount();
        setTimeout(() => {
          if (isMounted.current) fetchTickets(user.id);
        }, 3000);
      }
    } else if (paymentStatus === 'cancelled') {
      showToast('Payment cancelled. Your order has been voided.', 'error');
      window.history.replaceState({}, '', window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authSessionChecked]); // run once auth is ready

  const handlePurchase = useCallback(async (
    event: AppEvent,
    qty: number,
    tierId?: string,
    attendeeNames: string[] = [],
    promoCode?: string,
    seatIds?: string[]
  ) => {
    if (!user) { handleNavigate('auth'); return; }
    if (!user.email_verified) { showToast('Verify email in Settings to buy tickets.', 'error'); return; }
    if (!tierId) { showToast('Please select a ticket tier.', 'error'); return; }

    try {
      showToast('Preparing secure checkout...', 'info');

      // 1. Audit: Ensure session exists and refresh if expired
      console.log('[AUTH_AUDIT] Fetching fresh session for checkout...');
      const { data: { session }, error: sessionErr } = await supabase.auth.getSession();

      if (sessionErr || !session) {
        console.warn('[AUTH_AUDIT] Session invalid or missing:', sessionErr);
        throw new Error('Your session has expired. Please log in again to continue.');
      }

      const token = session.access_token;
      console.log(`[AUTH_AUDIT] Session verified: ${session.user.email}`);

      const headers = { Authorization: `Bearer ${token}` };

      const { data: responseBody, error: funcErr } = await supabase.functions.invoke('create-ticket-checkout', {
        headers,
        body: {
          eventId: event.id,
          ticketTypeId: tierId,
          quantity: seatIds && seatIds.length > 0 ? seatIds.length : qty,
          attendeeNames: attendeeNames.length ? attendeeNames : [],
          promoCode: promoCode || null,
          seatIds: seatIds && seatIds.length > 0 ? seatIds : null
        }
      });

      if (funcErr || !responseBody) {
        throw new Error(funcErr?.message || 'Checkout failed');
      }

      const { url, params: pfParams } = responseBody;

      if (!url || !pfParams) throw new Error('Invalid checkout response from server');

      // Build a hidden POST form and submit it to PayFast
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = url;
      Object.entries(pfParams as Record<string, string>).forEach(([key, value]) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = value;
        form.appendChild(input);
      });
      document.body.appendChild(form);
      form.submit();

    } catch (err: any) {
      console.error('[AUTH_AUDIT] Checkout Error:', err);
      showToast(err.message || 'Payment setup failed. Please try again.', 'error');
    }
  }, [user, handleNavigate, showToast, fetchTickets, fetchUnreadCount]);

  if (isPreloading) return <Preloader isReady={authSessionChecked} onComplete={() => setIsPreloading(false)} />;

  const handlePasswordReset = async () => {
    if (!newPassword || newPassword.length < 8) {
      showToast("Password must be at least 8 characters.", "error");
      return;
    }
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setIsPasswordRecovery(false);
      setNewPassword('');
      showToast("Password updated successfully!", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to update password.", "error");
    }
  };

  return (
    <div className={`min-h-screen themed-bg ${theme}`}>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      {/* Navbar — minimal for scanners, full for everyone else */}
      {user?.role === UserRole.SCANNER ? (
        <header className="fixed top-0 left-0 right-0 h-14 z-[60] bg-black/90 backdrop-blur-md border-b border-white/10 flex items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-white rounded-md flex items-center justify-center">
              <span className="text-black font-bold text-xs italic">Y</span>
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-white/60">Gate Control</span>
          </div>
          <button
            onClick={() => { supabase.auth.signOut(); setUser(null); handleNavigate('auth'); }}
            className="text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white transition-colors px-3 py-1.5 rounded-full hover:bg-white/10"
          >
            Sign Out
          </button>
        </header>
      ) : (
        <Navbar
          user={user}
          currentView={currentView}
          onNavigate={handleNavigate}
          onLogout={() => { supabase.auth.signOut(); setUser(null); handleNavigate('home'); }}
          unreadCount={unreadNotifications}
        />
      )}
      <main className={`pt-14 relative z-0 ${currentView === 'auth' ? 'pb-8' : 'pb-32'}`}>
        <Suspense fallback={<ViewLoader />}>
          {currentView === 'home' && <HomeView events={events} trendingEvents={trendingEvents} categories={categories} isLoading={areEventsLoading} onEventSelect={(id: string) => { setSelectedEvent(events.find(e => e.id === id) || null); handleNavigate('eventDetail'); }} onNavigate={handleNavigate} hasMore={hasMoreEvents} onLoadMore={fetchMoreEvents} isFetchingMore={isFetchingMore} />}
          {currentView === 'eventDetail' && selectedEvent && (
            <EventDetailView
              event={selectedEvent}
              user={user}
              onNavigateAuth={() => handleNavigate('auth')}
              onPurchase={(qty: number, tierId: string, attendeeNames?: string[], promoCode?: string) => handlePurchase(selectedEvent, qty, tierId, attendeeNames, promoCode)}
            />
          )}
          {currentView === 'wallet' && user && <WalletView user={user} tickets={tickets} onNavigate={handleNavigate} />}
          {currentView === 'notifications' && user && <NotificationsView onNavigate={handleNavigate} onRefreshUnreadCount={fetchUnreadCount} />}
          {currentView === 'auth' && <AuthView onLogin={(p: Profile) => { setUser(p); if (p.role === UserRole.SCANNER) handleNavigate('scanner', p); else handleNavigate(p.role === UserRole.ORGANIZER ? 'organizer' : 'home', p); }} />}
          {currentView === 'organizer' && user && (
            <OrganizerDashboardView
              user={user}
              events={events}
              tickets={tickets}
              categories={categories}
              onEventCreated={fetchEvents}
              onEventUpdated={fetchEvents}
              onEventDeleted={fetchEvents}
              onUpdateProfile={setUser}
              onNavigate={handleNavigate}
              onToggleWizard={(isOpen: boolean) => setIsWizardOpen(isOpen)}
            />
          )}
          {currentView === 'scanner' && user && [UserRole.SCANNER, UserRole.ORGANIZER, UserRole.ADMIN].includes(user.role) && <ScannerView />}
          {currentView === 'settings' && user && (
            <SettingsView
              user={user}
              theme={theme}
              onThemeChange={setTheme}
              onLogout={() => { supabase.auth.signOut(); setUser(null); handleNavigate('home'); }}
              onNavigate={handleNavigate}
              onUpdateProfile={(p: Partial<Profile>) => setUser(prev => prev ? { ...prev, ...p } : null)}
              accessibility={accessibility}
              onToggleAccessibility={toggleAccessibility}
            />
          )}
          {currentView === 'resale' && (
            <ResaleMarketplaceView
              user={user}
              events={events}
              onNavigate={handleNavigate}
            />
          )}
          {currentView === 'experiences' && (
            <ExperiencesMarketplaceView
              user={user}
              onNavigate={handleNavigate}
            />
          )}
        </Suspense>
      </main>
      {/* FloatingNav — hidden for scanners */}
      {currentView !== 'auth' && !isWizardOpen && user?.role !== UserRole.SCANNER && (
        <FloatingNav currentView={currentView} user={user} onNavigate={handleNavigate} />
      )}

      {transitionState.isActive && transitionState.targetView && (
        <TransitionOverlay
          isActive={transitionState.isActive}
          targetView={transitionState.targetView}
          onTransitionComplete={handleTransitionComplete}
        />
      )}

      {/* Password Recovery Modal */}
      {isPasswordRecovery && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-md p-6 animate-in fade-in duration-300">
          <div className="w-full max-w-md bg-white dark:bg-black rounded-[2.5rem] shadow-2xl border border-zinc-200 dark:border-zinc-800 p-10 space-y-8">
            <div className="space-y-2">
              <h2 className="text-3xl font-black tracking-tight text-black dark:text-white">Set New Password</h2>
              <p className="text-sm text-zinc-400 font-medium">You clicked a password reset link. Enter your new password below.</p>
            </div>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="New password (min 8 characters)"
              className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-6 py-4 text-sm font-bold text-black dark:text-white outline-none focus:ring-2 focus:ring-black dark:focus:ring-white transition-all"
            />
            <div className="flex gap-3">
              <button
                onClick={handlePasswordReset}
                className="flex-1 py-4 bg-black dark:bg-white text-white dark:text-black rounded-full font-black text-[10px] uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl"
              >
                Update Password
              </button>
              <button
                onClick={() => { setIsPasswordRecovery(false); setNewPassword(''); }}
                className="flex-1 py-4 bg-zinc-100 dark:bg-zinc-900 text-black dark:text-white rounded-full font-black text-[10px] uppercase tracking-widest hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}