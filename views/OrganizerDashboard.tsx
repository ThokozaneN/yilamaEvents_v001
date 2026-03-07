import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Event, Ticket, UserRole, Profile, EventCategory, FinancialSummary } from '../types';
import { CheckCircle2, XCircle, Sparkles, Rocket, DollarSign, LineChart, Landmark, RefreshCw, Lock, AlertCircle, Calendar, ShoppingBag, BarChart3, Users, User, ArrowRight } from 'lucide-react';
import { EventCreationWizard } from './EventCreationWizard';
import { SubscriptionModal } from '../components/SubscriptionModal';
import { EditEventModal } from '../components/EditEventModal';
import { VenueBuilder } from './VenueBuilder';

interface OrganizerDashboardProps {
  user: Profile;
  events?: Event[];
  tickets?: Ticket[];
  categories?: EventCategory[];
  onEventCreated?: () => void;
  onEventUpdated?: () => void;
  onEventDeleted?: () => void;
  onUpdateProfile?: (profile: Profile) => void;
  onNavigate: (view: string) => void;
  onToggleWizard?: (isOpen: boolean) => void;
}

export const OrganizerDashboard: React.FC<OrganizerDashboardProps> = (props) => {
  const { user, events: initialEvents, tickets: initialTickets, categories, onEventCreated, onEventUpdated: _onEventUpdated, onEventDeleted: _onEventDeleted, onUpdateProfile: _onUpdateProfile, onNavigate, onToggleWizard } = props;
  if (!user) return null;
  const profile = user;
  const [events, setEvents] = useState<Event[]>(initialEvents || []);
  const [eventViewTab, setEventViewTab] = useState<'active' | 'past'>('active');
  const [tickets, setTickets] = useState<Ticket[]>(initialTickets || []);
  const [activeTab, setActiveTab] = useState<'events' | 'orders' | 'analytics' | 'finance' | 'team' | 'identity'>('events');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);
  const [venueBuilderEventId, setVenueBuilderEventId] = useState<string | null>(null);
  const [aiMessage, setAiMessage] = useState<{ text: string, type: 'success' | 'error' | 'info' } | null>(null);
  const [readiness, setReadiness] = useState<{ ready: boolean; missing: string[] } | null>(null);
  const [aiInsights, setAiInsights] = useState<string | null>(null);
  const [isAnalyzingSales, setIsAnalyzingSales] = useState(false);
  const [usage, setUsage] = useState<{
    plan_id: string;
    plan_name: string;
    events_limit: number;
    events_current: number;
    tickets_limit: number;
    ticket_types_limit: number;
    scanner_limit: number;
    commission_rate: number;
    ai_features: boolean;
    seating_map: boolean;
  } | null>(null);
  const [isLoadingRevenue, setIsLoadingRevenue] = useState(false);
  const [analyticsData, setAnalyticsData] = useState<{
    revenue: any[];
    performance: any[];
    funnel: any[];
  } | null>(null);

  const [selectedEventForTeam, setSelectedEventForTeam] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Teams Tab State
  const [scanners, setScanners] = useState<any[]>([]);
  const [isLoadingScanners, setIsLoadingScanners] = useState(false);
  const [isCreatingScanner, setIsCreatingScanner] = useState(false);
  const [newScannerForm, setNewScannerForm] = useState({ name: '', gate_name: '', password: '' });
  const [generatedCredentials, setGeneratedCredentials] = useState<{ email: string, password: string } | null>(null);

  // Finance State
  const [financialSummary, setFinancialSummary] = useState<FinancialSummary | null>(null);
  const [isStatementGenerating, setIsStatementGenerating] = useState(false);
  const [isRequestingPayout, setIsRequestingPayout] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState<string>('');
  const [isLoadingFinance, setIsLoadingFinance] = useState(false);
  const [statementConfig, setStatementConfig] = useState<{ type: 'mixed' | 'event', eventId: string | null }>({ type: 'mixed', eventId: null });

  // Orders Tab State
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [selectedEventForOrders, setSelectedEventForOrders] = useState<string | null>(null);
  const [refundingOrder, setRefundingOrder] = useState<any | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [isRefunding, setIsRefunding] = useState(false);

  const dashboardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onToggleWizard?.(isFormOpen);
  }, [isFormOpen, onToggleWizard]);

  useEffect(() => {
    if (user) {
      if (user.role !== UserRole.ORGANIZER && user.role !== UserRole.ADMIN) {
        onNavigate('home');
        return;
      }
      loadDashboardData();
      checkReadiness();
    }
  }, [user]);

  useEffect(() => {
    if (activeTab === 'finance' && !financialSummary && !isLoadingFinance) {
      loadFinanceData();
    }
    if (activeTab === 'team' && selectedEventForTeam) {
      loadTeamScanners();
    }
    if (activeTab === 'orders') {
      loadOrders();
    }
  }, [activeTab, selectedEventForTeam, selectedEventForOrders]);

  useEffect(() => {
    // If we finished loading readiness and they are not verified, lock them out of other tabs
    if (readiness !== null && !readiness.ready && activeTab !== 'identity') {
      setActiveTab('identity');
    }
  }, [readiness, activeTab]);


  // Helper function to calculate revenue from tiers (fallback)
  const calculateRevenueFromTiers = (event: Event): number => {
    if (!event.tiers) return 0;
    return event.tiers.reduce((sum, tier) => {
      return sum + (((tier as any).quantity_sold || 0) * (tier.price || 0));
    }, 0);
  };

  // Get safe revenue value from event
  const getEventRevenue = (event: any): number => {
    // Try multiple sources in order of preference
    if (event.gross_revenue !== undefined && event.gross_revenue !== null) {
      return event.gross_revenue;
    }
    if (event.mv_event_revenue?.gross_revenue) {
      return event.mv_event_revenue.gross_revenue;
    }
    return calculateRevenueFromTiers(event);
  };

  async function loadDashboardData() {
    if (!user) return;

    try {
      // Fetch events with their ticket tiers directly — no missing RPCs or views
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select(`
  *,
  tiers: ticket_types(
    id, name, price, quantity_limit, quantity_sold
  )
        `)
        .eq('organizer_id', user.id)
        .order('created_at', { ascending: false });

      if (eventsError) throw eventsError;

      if (eventsData) {
        setEvents(eventsData as any);
        if (eventsData.length > 0 && !selectedEventForTeam) {
          setSelectedEventForTeam(eventsData[0].id);
        }

        // Derive tickets sold count from tiers
        const totalSold = eventsData.reduce((acc: number, e: any) =>
          acc + (e.tiers?.reduce((s: number, t: any) => s + (t.quantity_sold || 0), 0) || 0), 0
        );
        // Build a synthetic ticket list for the "Assets Distributed" counter
        setTickets(Array.from({ length: totalSold }, (_, i) => ({ id: String(i), status: 'valid' })) as any);
      }

      // Load plan/usage limits
      const { data: usageData } = await supabase
        .rpc('check_organizer_limits_v2', { org_id: user.id });
      if (usageData) setUsage(usageData);

      // Load analytics views using the new secure RPCs
      const [resRev, resPerf, resFunnel, _resBalance, _resPayouts] = await Promise.allSettled([
        supabase.rpc('get_organizer_event_ledger'), // Changed from get_organizer_revenue_breakdown
        supabase.rpc('get_ticket_performance'),
        supabase.rpc('get_event_attendance_funnel'),
        supabase.rpc('get_organizer_balance'),
        supabase.from('payouts').select('*').eq('organizer_id', user.id).order('created_at', { ascending: false }),
      ]);

      setAnalyticsData({
        revenue: resRev.status === 'fulfilled' ? (resRev.value.data || []) : [],
        performance: resPerf.status === 'fulfilled' ? (resPerf.value.data || []) : [],
        funnel: resFunnel.status === 'fulfilled' ? (resFunnel.value.data || []) : [],
      });

      // (balance data available in resBalance if needed for quick stats)

      if (activeTab === 'finance') {
        loadFinanceData();
      }

    } catch (err) {
      console.error('Error loading dashboard data:', err);
    }
  }

  async function loadFinanceData() {
    if (!user) return;
    setIsLoadingFinance(true);
    try {
      const { data, error } = await supabase.rpc('get_organizer_financial_summary');
      if (error) throw error;
      setFinancialSummary(data);
    } catch (err) {
      console.error('Error loading finance data:', err);
      setAiMessage({ text: 'Failed to load financial data. Ensure the database functions are updated.', type: 'error' });
    } finally {
      setIsLoadingFinance(false);
    }
  }

  // Function to refresh revenue data for a specific event
  const refreshEventRevenue = async (eventId: string) => {
    setIsLoadingRevenue(true);
    try {
      const { data } = await supabase
        .rpc('get_event_revenue_real_time', { p_event_id: eventId });

      // Update the event in state with new revenue data
      setEvents(prevEvents =>
        prevEvents.map(event =>
          event.id === eventId
            ? {
              ...event,
              gross_revenue: data?.gross_revenue || 0,
              mv_event_revenue: {
                gross_revenue: data?.gross_revenue || 0,
                net_revenue: data?.net_revenue || 0
              }
            }
            : event
        )
      );
      setAiMessage({ text: `Revenue updated for event`, type: 'success' });
    } catch (err) {
      console.error("Error refreshing revenue:", err);
    } finally {
      setIsLoadingRevenue(false);
    }
  };

  const handleFetchAiInsights = async () => {
    if (!user || events.length === 0) return;

    // M-9.4: Gate AI analysis behind Pro/Premium — drives upgrade conversions
    if (!usage?.ai_features) {
      setAiMessage({ text: 'AI Revenue Engine is available on Pro and Premium plans. Upgrade to unlock Gemini-powered sales insights.', type: 'info' });
      setIsSubscriptionModalOpen(true);
      return;
    }

    setIsAnalyzingSales(true);
    try {
      const context = {
        category: events[0]?.category || 'General',
        tier: (usage?.plan_id || 'free') as 'free' | 'pro' | 'premium',
        organizerName: user.business_name
      };

      // Calculate total revenue safely
      const totalRevenue = events.reduce((acc, e) => acc + getEventRevenue(e), 0);

      const salesData = {
        eventCount: events.length,
        totalCapacity: events.reduce((acc, e) => acc + (e.total_ticket_limit || 0), 0),
        ticketsSold: tickets.length,
        revenue: totalRevenue
      };

      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: { type: 'sales', input: salesData, context }
      });
      if (error) throw error;
      setAiInsights(data?.text || 'Analysis failed');
    } catch (err) {
      console.error("AI Insights failed:", err);
    } finally {
      setIsAnalyzingSales(false);
    }
  };

  async function handleDeleteEvent(eventId: string) {
    setIsDeleting(true);
    try {
      const { error } = await supabase.from('events').delete().eq('id', eventId);
      if (error) throw error;
      setDeletingEventId(null);
      loadDashboardData();
    } catch (err: any) {
      setAiMessage({ text: `Failed to delete: ${err.message} `, type: 'error' });
    } finally {
      setIsDeleting(false);
    }
  }



  const handleDownloadStatement = async () => {
    if (!user) return;
    setIsStatementGenerating(true);
    try {
      // Pass export config (daily grouping is handled inside EF via get_daily_tier_sales)
      const { data, error } = await supabase.functions.invoke('generate-finance-statement', {
        body: {
          organizer_id: user.id,
          export_type: statementConfig.type,
          event_id: statementConfig.eventId
        }
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, '_blank');
        setAiMessage({ text: 'Statement generated successfully.', type: 'success' });
      } else {
        setAiMessage({ text: 'Statement is being processed. It will be sent to your email.', type: 'success' });
      }
    } catch (err: any) {
      setAiMessage({ text: `Statement failed: ${err.message} `, type: 'error' });
    } finally {
      setIsStatementGenerating(false);
    }
  };

  const handleRequestPayoutMain = async () => {
    const amount = parseFloat(payoutAmount);
    if (isNaN(amount) || amount <= 0) {
      setAiMessage({ text: 'Please enter a valid amount.', type: 'error' });
      return;
    }

    setIsRequestingPayout(true);
    try {
      const { data, error } = await supabase.rpc('request_payout', { p_amount: amount });
      if (error) throw error;
      if (data.success) {
        setAiMessage({ text: 'Payout requested! Funds locked in ledger.', type: 'success' });
        setPayoutAmount('');
        loadFinanceData();
        loadDashboardData();
      } else {
        setAiMessage({ text: `${data.message} `, type: 'error' });
      }
    } catch (err: any) {
      setAiMessage({ text: `Payout failed: ${err.message} `, type: 'error' });
    } finally {
      setIsRequestingPayout(false);
    }
  };

  async function checkReadiness() {
    if (!user) return;
    const { data } = await supabase.rpc('is_organizer_ready', { org_id: user.id });
    setReadiness(data);
  }

  async function loadTeamScanners() {
    if (!selectedEventForTeam) return;
    setIsLoadingScanners(true);
    setGeneratedCredentials(null);
    try {
      const { data, error } = await supabase
        .from('event_scanners')
        .select(`
          id, is_active, gate_name,
          profiles:user_id ( id, name, email )
        `)
        .eq('event_id', selectedEventForTeam)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setScanners(data || []);
    } catch (err) {
      console.error('Failed to load scanners', err);
    } finally {
      setIsLoadingScanners(false);
    }
  }

  async function handleCreateScanner(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEventForTeam || !newScannerForm.name || !newScannerForm.gate_name || !newScannerForm.password) return;

    // Enforce creation window: only allow within 48 hours of event start
    const selectedEvent = events.find(ev => ev.id === selectedEventForTeam);
    if (selectedEvent) {
      const now = new Date();
      const eventStart = new Date(selectedEvent.starts_at);
      const hoursUntilEvent = (eventStart.getTime() - now.getTime()) / (1000 * 60 * 60);

      if (hoursUntilEvent > 48) {
        const dateStr = eventStart.toLocaleDateString('en-ZA', { weekday: 'long', month: 'long', day: 'numeric' });
        alert(`Scanner credentials can only be created within 48 hours of the event.\n\nYour event "${selectedEvent.title}" starts on ${dateStr}.\n\nCome back closer to the event date.`);
        return;
      }
    }

    setIsCreatingScanner(true);

    try {
      const { data: result, error: funcErr } = await supabase.functions.invoke('create-scanner', {
        body: {
          event_id: selectedEventForTeam,
          name: newScannerForm.name,
          gate_name: newScannerForm.gate_name,
          temporary_password: newScannerForm.password
        }
      });

      if (funcErr || !result) {
        throw new Error(funcErr?.message || 'Failed to create scanner');
      }

      setGeneratedCredentials({
        email: result.email,
        password: newScannerForm.password
      });
      setNewScannerForm({ name: '', gate_name: '', password: '' });
      loadTeamScanners();

    } catch (err: any) {
      alert(err.message || 'Error configuring scanner account');
    } finally {
      setIsCreatingScanner(false);
    }
  }

  async function handleRevokeScanner(scannerId: string) {
    if (!profile) return;
    if (!confirm('Are you sure you want to revoke access? They will no longer be able to scan tickets.')) return;
    try {
      const { error } = await supabase
        .from('event_scanners')
        .delete()
        .eq('id', scannerId);

      if (error) throw error;
      setScanners(scanners.filter(s => s.id !== scannerId));
    } catch (err: any) {
      alert('Failed to revoke access: ' + err.message);
    }
  }

  async function loadOrders() {
    setIsLoadingOrders(true);
    try {
      const { data, error } = await supabase.rpc('get_organizer_orders', {
        p_event_id: selectedEventForOrders
      });
      if (error) throw error;
      setOrders(data || []);
    } catch (err: any) {
      console.error('Error loading orders:', err);
      setAiMessage({ text: 'Failed to load orders: ' + err.message, type: 'error' });
    } finally {
      setIsLoadingOrders(false);
    }
  }

  async function handleRefundOrder() {
    if (!refundingOrder) return;
    setIsRefunding(true);
    try {
      console.log('[REFUND] Initiating refund for order:', refundingOrder.order_id);

      const { data, error } = await supabase.functions.invoke('process-refund', {
        body: {
          order_id: refundingOrder.order_id,
          reason: refundReason
        }
      });

      if (error) {
        console.error('[REFUND] Function invocation error:', error);
        throw error;
      }

      if (data?.error) {
        console.error('[REFUND] Function returned logical error:', data.error);
        throw new Error(data.error);
      }

      setAiMessage({ text: 'Refund processed successfully!', type: 'success' });
      setRefundingOrder(null);
      setRefundReason('');
      loadOrders(); // Refresh list
    } catch (err: any) {
      console.error('[REFUND] Final error:', err);
      setAiMessage({ text: err.message || 'Refund failed', type: 'error' });
    } finally {
      setIsRefunding(false);
    }
  }

  // Calculate total revenue safely
  const totalRevenue = events.reduce((acc, e) => acc + getEventRevenue(e), 0);

  return (
    <div ref={dashboardRef} className="px-4 sm:px-6 md:px-12 py-8 sm:py-12 max-w-7xl mx-auto space-y-12 sm:space-y-16">
      {aiMessage && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-md animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="themed-card border themed-border rounded-2xl p-4 shadow-2xl flex items-center justify-between gap-4 bg-white/80 dark:bg-black/80 backdrop-blur-xl">
            <div className="flex items-center gap-2">
              {aiMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
              {aiMessage.type === 'error' && <XCircle className="w-4 h-4 text-red-500" />}
              {aiMessage.type === 'info' && <Sparkles className="w-4 h-4 text-purple-500" />}
              <p className="text-xs font-black uppercase tracking-widest themed-text">{aiMessage.text}</p>
            </div>
            <button onClick={() => setAiMessage(null)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
              <svg className="w-4 h-4 themed-text" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      )}

      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-8 dash-stagger">
        <div className="space-y-3">
          <h1 className="text-4xl sm:text-5xl md:text-7xl font-black themed-text tracking-tighter uppercase leading-none">Studio</h1>
          <div className="flex flex-wrap items-center gap-3">
            <div className={`px-4 py-2 rounded-full border flex items-center gap-2 ${readiness?.ready ? 'border-green-500/20 bg-green-500/5 text-green-600 dark:text-green-400' : readiness === null ? 'border-zinc-500/20 bg-zinc-500/5 text-zinc-600' : 'border-orange-500/20 bg-orange-500/5 text-orange-600 dark:text-orange-400'} `}>
              <div className={`w-1.5 h-1.5 rounded-full ${readiness?.ready ? 'bg-green-500' : readiness === null ? 'bg-zinc-500 animate-pulse' : 'bg-orange-500 animate-pulse'} `} />
              <span className="text-[10px] font-black uppercase tracking-widest">{readiness?.ready ? 'System Online' : readiness === null ? 'Checking Status...' : 'Verification Pending'}</span>
            </div>

            {/* Refresh Button */}
            <button
              onClick={loadDashboardData}
              className="p-2 rounded-full border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-500 hover:text-black dark:hover:text-white"
              title="Refresh Dashboard"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>

            <div
              onClick={() => setIsSubscriptionModalOpen(true)}
              className={`px-4 py-2 rounded-full border cursor-pointer hover: scale-105 transition-all flex items-center gap-2 ${usage?.plan_id === 'free' || !usage?.plan_id ? 'border-zinc-500/20 bg-zinc-500/5 text-zinc-600' : 'border-purple-500/20 bg-purple-500/5 text-purple-600 dark:text-purple-400'} `}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="text-[10px] font-black uppercase tracking-widest">{usage?.plan_name || 'Starter'} Tier</span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="w-full relative z-10">
          <div className="flex overflow-x-auto no-scrollbar pb-2 sm:pb-0 justify-start items-center gap-1.5 sm:gap-2 p-1.5 themed-secondary-bg rounded-2xl sm:rounded-full border themed-border">
            {['events', 'orders', 'analytics', 'finance', 'team', 'identity'].map((tab) => {
              const isLocked = tab !== 'identity' && readiness !== null && !readiness.ready;

              const getIcon = () => {
                const iconClass = "w-3.5 h-3.5 sm:w-3 h-3";
                switch (tab) {
                  case 'events': return <Calendar className={iconClass} />;
                  case 'orders': return <ShoppingBag className={iconClass} />;
                  case 'analytics': return <BarChart3 className={iconClass} />;
                  case 'finance': return <Landmark className={iconClass} />;
                  case 'team': return <Users className={iconClass} />;
                  case 'identity': return <User className={iconClass} />;
                  default: return null;
                }
              };

              return (
                <button
                  key={tab}
                  disabled={isLocked}
                  title={isLocked ? 'Verify your identity to unlock' : ''}
                  onClick={() => {
                    if (isLocked) return;
                    setActiveTab(tab as any);
                    if (tab === 'team' && events.length > 0 && !selectedEventForTeam) setSelectedEventForTeam(events[0]?.id || null);
                  }}
                  className={`flex-none px-5 sm:px-6 py-2.5 sm:py-2 rounded-xl sm:rounded-full text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2.5 whitespace-nowrap ${isLocked ? 'opacity-30 cursor-not-allowed' :
                    activeTab === tab
                      ? 'bg-black dark:bg-white text-white dark:text-black shadow-lg shadow-black/10 dark:shadow-white/5'
                      : 'text-zinc-500 hover:text-black dark:hover:text-white'
                    } `}
                >
                  {getIcon()}
                  <span>{tab}</span>
                  {isLocked && <Lock className="w-3 h-3" />}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {activeTab === 'events' && (
        <div className="space-y-16 dash-stagger">
          {readiness === null ? (
            <div className="themed-card border themed-border rounded-[3rem] p-16 text-center space-y-8 shadow-sm relative overflow-hidden flex flex-col items-center justify-center min-h-[300px]">
              <div className="w-8 h-8 border-4 border-zinc-300 dark:border-zinc-700 border-t-black dark:border-t-white rounded-full animate-spin"></div>
              <p className="text-zinc-500 text-sm font-bold uppercase tracking-widest animate-pulse">Checking account status...</p>
            </div>
          ) : !readiness?.ready ? (
            <div className="themed-card border themed-border rounded-[3rem] p-16 text-center space-y-8 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/5 rounded-full blur-[80px] -mr-32 -mt-32 pointer-events-none" />
              <div className="w-24 h-24 bg-orange-500/10 rounded-3xl flex items-center justify-center mx-auto text-orange-500 relative z-10">
                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="space-y-4 relative z-10">
                <h3 className="text-3xl font-black uppercase tracking-tight themed-text">Verification Pending</h3>
                <p className="text-base text-zinc-500 max-w-lg mx-auto leading-relaxed">Identity verification is required to launch public events. Complete the registry process.</p>
              </div>
              <button onClick={() => setActiveTab('identity')} className="px-10 py-4 bg-black dark:bg-white text-white dark:text-black rounded-full font-black text-xs uppercase tracking-widest shadow-xl hover:scale-105 transition-all relative z-10">Open Registry</button>
            </div>
          ) : (
            <>
              {/* AI Insights Bar */}
              <div className="themed-card border themed-border rounded-[2rem] p-6 bg-gradient-to-r from-purple-500/5 to-indigo-500/5 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/5 rounded-full blur-[80px] -mr-32 -mt-32 pointer-events-none group-hover:bg-purple-500/10 transition-all" />
                <div className="flex flex-col md:flex-row justify-between items-center gap-6 relative z-10">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white shadow-lg">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-purple-600 dark:text-purple-400 mb-1">Gemini Revenue Engine</h4>
                      <p className="text-sm font-bold themed-text">
                        {aiInsights ? 'Intelligent sales & growth recommendations active.' : 'Understand your sales patterns and unlock growth tips.'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleFetchAiInsights}
                    disabled={isAnalyzingSales || events.length === 0}
                    className={`px-8 py-3 rounded-full font-black text-[10px] uppercase tracking-widest transition-all ${isAnalyzingSales ? 'bg-zinc-100 text-zinc-400 animate-pulse' : 'bg-black dark:bg-white text-white dark:text-black hover:scale-105 shadow-xl'} `}
                  >
                    {isAnalyzingSales ? 'Crunching Data...' : aiInsights ? 'Refresh Analysis' : 'Analyze Sales'}
                  </button>
                </div>

                {aiInsights && (
                  <div className="mt-6 pt-6 border-t themed-border animate-in fade-in slide-in-from-top-4">
                    <div className="text-xs font-medium themed-text opacity-70 prose prose-invert max-w-none prose-p:leading-relaxed">
                      {aiInsights}
                    </div>
                  </div>
                )}
              </div>

              {/* Stats Overview */}
              <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Total Revenue */}
                <div className="themed-card border themed-border rounded-[2.5rem] p-8 space-y-4 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/5 rounded-full blur-[40px] -mr-16 -mt-16 group-hover:bg-green-500/10 transition-all pointer-events-none" />
                  <div className="flex justify-between items-start relative z-10">
                    <div className="p-3 themed-secondary-bg rounded-2xl border themed-border">
                      <svg className="w-6 h-6 themed-text opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <button
                      onClick={() => events.length > 0 && refreshEventRevenue(events[0]?.id ?? '')}
                      disabled={isLoadingRevenue}
                      title="Refresh revenue"
                      className="text-green-500 bg-green-500/10 p-1.5 rounded-full hover:bg-green-500/20 transition-colors"
                    >
                      <svg className={`w-3.5 h-3.5 ${isLoadingRevenue ? 'animate-spin' : ''} `} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    </button>
                  </div>
                  <div className="space-y-1 relative z-10">
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-40 themed-text">Gross Revenue</p>
                    <h4 className="text-3xl font-black themed-text tracking-tight">R {totalRevenue.toLocaleString()}</h4>
                  </div>
                </div>

                {/* Tickets Sold */}
                <div className="themed-card border themed-border rounded-[2.5rem] p-8 space-y-4 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-[40px] -mr-16 -mt-16 group-hover:bg-blue-500/10 transition-all pointer-events-none" />
                  <div className="flex justify-between items-start relative z-10">
                    <div className="p-3 themed-secondary-bg rounded-2xl border themed-border">
                      <svg className="w-6 h-6 themed-text opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                      </svg>
                    </div>
                  </div>
                  <div className="space-y-1 relative z-10">
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-40 themed-text">Assets Distributed</p>
                    <h4 className="text-3xl font-black themed-text tracking-tight">
                      {tickets.filter(t => t.status === 'valid' || t.status === 'used').length}
                      <span className="text-lg opacity-30 font-bold"> / {events.reduce((acc, e) => acc + (e.total_ticket_limit || 0), 0)}</span>
                    </h4>
                  </div>
                </div>

                {/* Active Events */}
                <div className="themed-card border themed-border rounded-[2.5rem] p-8 space-y-4 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-[40px] -mr-16 -mt-16 group-hover:bg-purple-500/10 transition-all pointer-events-none" />
                  <div className="flex justify-between items-start relative z-10">
                    <div className="p-3 themed-secondary-bg rounded-2xl border themed-border">
                      <svg className="w-6 h-6 themed-text opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                      </svg>
                    </div>
                    {usage && (usage.events_limit > 0) && (
                      <span className="text-[9px] font-black uppercase tracking-widest opacity-40 themed-text">
                        {Math.round(((usage.events_current || 0) / usage.events_limit) * 100)}% Cap
                      </span>
                    )}
                  </div>
                  <div className="space-y-1 relative z-10">
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-40 themed-text">Live Productions</p>
                    <h4 className="text-3xl font-black themed-text tracking-tight">
                      {events.filter(e => {
                        const now = new Date();
                        const end = e.ends_at ? new Date(e.ends_at) : new Date(new Date(e.starts_at).getTime() + 6 * 60 * 60 * 1000);
                        return e.status === 'published' && end >= now;
                      }).length}
                    </h4>
                  </div>
                </div>

                {/* Create New Action */}
                <button
                  // M-9.7: Null-safe — treat null usage as limited (still loading) to prevent race condition
                  disabled={!usage}
                  onClick={() => setIsFormOpen(true)}
                  className="themed-card border-2 border-dashed themed-border rounded-[2.5rem] p-8 flex flex-col justify-center items-center gap-4 group hover:bg-black hover:border-black dark:hover:bg-white dark:hover:border-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <div className="w-12 h-12 rounded-full border-2 border-themed-border flex items-center justify-center group-hover:bg-white group-hover:text-black dark:group-hover:bg-black dark:group-hover:text-white transition-colors">
                    <svg className="w-6 h-6 themed-text group-hover:text-black dark:group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <span className="text-xs font-black uppercase tracking-widest themed-text group-hover:text-white dark:group-hover:text-black">Launch Event</span>
                </button>
              </section>

              {/* Events Grid */}
              <div className="space-y-8">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-4">
                  <div className="space-y-2">
                    <h2 className="text-4xl font-black themed-text uppercase tracking-tighter">Your Assets</h2>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] themed-text opacity-30 italic">Collection Management // Real-time Performance</p>
                  </div>

                  <div className="flex bg-zinc-100 dark:bg-zinc-900/50 p-1.5 rounded-2xl border themed-border">
                    <button
                      onClick={() => setEventViewTab('active')}
                      className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${eventViewTab === 'active' ? 'bg-black dark:bg-white text-white dark:text-black shadow-lg' : 'themed-text opacity-40 hover:opacity-100'} `}
                    >
                      Active
                    </button>
                    <button
                      onClick={() => setEventViewTab('past')}
                      className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${eventViewTab === 'past' ? 'bg-black dark:bg-white text-white dark:text-black shadow-lg' : 'themed-text opacity-40 hover:opacity-100'} `}
                    >
                      Past
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                  {events
                    .filter(e => {
                      const now = new Date();
                      const end = e.ends_at ? new Date(e.ends_at) : new Date(new Date(e.starts_at).getTime() + 6 * 60 * 60 * 1000);
                      return eventViewTab === 'active' ? end >= now : end < now;
                    })
                    .map(e => (
                      <div key={e.id} className="themed-card border themed-border rounded-[2.5rem] overflow-hidden group hover:-translate-y-2 transition-transform duration-500 shadow-lg cursor-pointer">
                        <div className="aspect-[4/3] relative overflow-hidden">
                          <img src={e.image_url || 'https://picsum.photos/seed/yilama/800'} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt={e.title} />
                          <div className="absolute top-4 right-4">
                            <span className={`px-3 py-1 text-[8px] font-black uppercase tracking-widest rounded-full backdrop-blur-md ${e.status === 'published' ? 'bg-green-500/20 text-white border border-green-500/30' :
                              e.status === 'draft' ? 'bg-zinc-500/20 text-white border border-zinc-500/30' :
                                e.status === 'cancelled' ? 'bg-red-500/20 text-white border border-red-500/30' :
                                  'bg-indigo-500/20 text-white border border-indigo-500/30'
                              } `}>
                              {e.status.replace('_', ' ')}
                            </span>
                          </div>
                          <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-black/80 to-transparent">
                            <h4 className="text-lg font-black text-white leading-tight">{e.title}</h4>
                            <p className="text-[10px] font-bold text-white/60 uppercase tracking-wider mt-1">
                              {(() => {
                                try {
                                  const d = new Date(e.starts_at);
                                  return !isNaN(d.getTime()) ? d.toLocaleDateString() : 'TBA';
                                } catch { return 'TBA'; }
                              })()}
                            </p>
                          </div>
                        </div>
                        <div className="p-6 flex justify-between items-center">
                          <div className="space-y-1">
                            <p className="text-[9px] font-black uppercase tracking-widest opacity-40 themed-text">Revenue</p>
                            <p className="text-sm font-bold themed-text">R {getEventRevenue(e).toLocaleString()}</p>
                          </div>
                          <div className="text-right space-y-1">
                            <p className="text-[9px] font-black uppercase tracking-widest opacity-40 themed-text">Sales</p>
                            <p className="text-sm font-bold themed-text">
                              {e.total_ticket_limit ?
                                `${Math.round((((e.tiers?.reduce((acc, t) => acc + ((t as any).quantity_sold || 0), 0) || 0) / e.total_ticket_limit) * 100))}% `
                                : '0%'}
                            </p>
                          </div>
                        </div>

                        {/* Action Buttons or Performance Recap */}
                        <div className="px-6 pb-6 flex flex-col gap-2">
                          {eventViewTab === 'active' ? (
                            <>
                              {e.status === 'published' && (
                                <button
                                  onClick={(e_inner) => {
                                    e_inner.stopPropagation();
                                    setVenueBuilderEventId(e.id);
                                  }}
                                  className="w-full py-2.5 rounded-2xl bg-purple-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-purple-500 transition-all shadow-lg flex items-center justify-center gap-2"
                                >
                                  <span className="flex items-center gap-2"><Rocket className="w-4 h-4" /> Venue Builder</span>
                                </button>
                              )}
                              <div className="flex gap-2">
                                <button
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    setEditingEvent(e);
                                  }}
                                  className="flex-1 py-2.5 rounded-2xl border border-zinc-200 dark:border-zinc-700 text-[10px] font-black uppercase tracking-widest themed-text hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black hover:border-transparent transition-all"
                                >
                                  Edit
                                </button>
                                {deletingEventId === e.id ? (
                                  <button
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      handleDeleteEvent(e.id);
                                    }}
                                    disabled={isDeleting}
                                    className="flex-1 py-2.5 rounded-2xl bg-red-500 text-white text-[10px] font-black uppercase tracking-widest transition-all hover:bg-red-600 disabled:opacity-50"
                                  >
                                    {isDeleting ? 'Deleting...' : 'Confirm'}
                                  </button>
                                ) : (
                                  <button
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      setDeletingEventId(e.id);
                                    }}
                                    className="flex-1 py-2.5 rounded-2xl border border-red-500/30 text-red-500 text-[10px] font-black uppercase tracking-widest hover:bg-red-500/10 transition-all"
                                  >
                                    Delete
                                  </button>
                                )}
                              </div>
                            </>
                          ) : (
                            <div className="mt-2 p-4 rounded-2xl bg-zinc-50 dark:bg-white/5 border border-dashed themed-border space-y-3">
                              <div className="flex justify-between items-center">
                                <span className="text-[9px] font-black uppercase tracking-widest opacity-40 themed-text">Performance Recap</span>
                                <CheckCircle2 className="w-3 h-3 text-green-500" />
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <p className="text-[8px] font-black uppercase tracking-tighter opacity-30 themed-text">Net Payout</p>
                                  <p className="text-xs font-black themed-text">
                                    R {analyticsData?.revenue?.find(r => r.event_id === e.id)?.net_revenue?.toLocaleString() || '0'}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[8px] font-black uppercase tracking-tighter opacity-30 themed-text">Check-in</p>
                                  <p className="text-xs font-black themed-text">
                                    {analyticsData?.funnel?.find(f => f.event_id === e.id)?.check_in_rate || 0}%
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                    ))}
                </div>
              </div>
            </>
          )}

          {/* Toast/Feedback Message */}
          {aiMessage && (
            <div className={`fixed bottom-4 sm: bottom-8 left-4 right-4 sm: left-auto sm: right-8 sm: w-auto max-w-sm sm: max-w-none p-4 sm: p-6 rounded-[2rem] border-2 flex items-start gap-4 animate -in fade -in slide -in -from-bottom-4 z-[100] ${aiMessage.type === 'success' ? 'bg-green-500/10 border-green-500/30' :
              aiMessage.type === 'error' ? 'bg-red-500/10 border-red-500/30' :
                'bg-blue-500/10 border-blue-500/30'
              } `}>
              <div className={`w-2 h-2 rounded-full mt-2 ${aiMessage.type === 'success' ? 'bg-green-500' :
                aiMessage.type === 'error' ? 'bg-red-500' :
                  'bg-blue-500'
                } `} />
              <p className={`text-sm font-medium flex-1 ${aiMessage.type === 'success' ? 'text-green-400' :
                aiMessage.type === 'error' ? 'text-red-400' :
                  'text-blue-400'
                } `}>{aiMessage.text}</p>
              <button
                onClick={() => setAiMessage(null)}
                className="text-white/40 hover:text-white/80 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'orders' && readiness?.ready && (
        <div className="space-y-12 dash-stagger animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6">
            <div className="space-y-2">
              <h2 className="text-3xl font-black uppercase tracking-tight themed-text">Order Management</h2>
              <p className="text-sm font-bold opacity-40 uppercase tracking-widest themed-text">Manage ticket sales and process refunds</p>
            </div>

            <div className="flex items-center gap-4 w-full sm:w-auto">
              <select
                value={selectedEventForOrders || ''}
                onChange={(e) => setSelectedEventForOrders(e.target.value || null)}
                className="flex-1 sm:flex-none bg-zinc-100 dark:bg-white/5 border themed-border px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest outline-none transition-all focus:border-black dark:focus:border-white"
              >
                <option value="">All Events</option>
                {events.map(e => (
                  <option key={e.id} value={e.id}>{e.title}</option>
                ))}
              </select>

              <button
                onClick={loadOrders}
                disabled={isLoadingOrders}
                className="p-2 rounded-xl border themed-border hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 themed-text ${isLoadingOrders ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="themed-card border themed-border rounded-[2.5rem] overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b themed-border bg-zinc-50/50 dark:bg-white/5">
                    <th className="py-4 px-6 text-[10px] font-black uppercase tracking-widest opacity-40 themed-text">Date</th>
                    <th className="py-4 px-6 text-[10px] font-black uppercase tracking-widest opacity-40 themed-text">Event</th>
                    <th className="py-4 px-6 text-[10px] font-black uppercase tracking-widest opacity-40 themed-text">Buyer</th>
                    <th className="py-4 px-6 text-[10px] font-black uppercase tracking-widest opacity-40 themed-text">Tickets</th>
                    <th className="py-4 px-6 text-[10px] font-black uppercase tracking-widest opacity-40 themed-text text-right">Amount</th>
                    <th className="py-4 px-6 text-[10px] font-black uppercase tracking-widest opacity-40 themed-text text-center">Status</th>
                    <th className="py-4 px-6 text-[10px] font-black uppercase tracking-widest opacity-40 themed-text text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y themed-border">
                  {isLoadingOrders ? (
                    <tr>
                      <td colSpan={7} className="py-20 text-center">
                        <div className="inline-block w-6 h-6 border-2 border-zinc-300 dark:border-zinc-700 border-t-black dark:border-t-white rounded-full animate-spin"></div>
                      </td>
                    </tr>
                  ) : orders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-20 text-center text-sm font-bold opacity-30 themed-text uppercase tracking-widest">No orders found.</td>
                    </tr>
                  ) : (
                    orders.map((order) => (
                      <tr key={order.order_id} className="hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors">
                        <td className="py-4 px-6 text-[10px] font-bold themed-text opacity-60 whitespace-nowrap">
                          {new Date(order.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-4 px-6">
                          <span className="text-xs font-black themed-text truncate block max-w-[150px]">{order.event_title}</span>
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold themed-text">{order.buyer_name || 'Anonymous'}</span>
                            <span className="text-[9px] opacity-40 themed-text">{order.buyer_email}</span>
                          </div>
                        </td>
                        <td className="py-4 px-6 text-xs font-bold themed-text">
                          {order.ticket_count}x
                        </td>
                        <td className="py-4 px-6 text-right font-black text-xs themed-text">
                          R {Number(order.total_amount).toLocaleString()}
                        </td>
                        <td className="py-4 px-6 text-center">
                          <span className={`px-2 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${order.status === 'paid' ? 'bg-green-500/10 text-green-600' :
                            order.status === 'refunded' ? 'bg-orange-500/10 text-orange-600' :
                              'bg-zinc-100 text-zinc-500'
                            }`}>
                            {order.status}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-right">
                          {order.status === 'paid' && (
                            <button
                              onClick={() => setRefundingOrder(order)}
                              className="text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border border-red-500/30 text-red-500 hover:bg-red-500 hover:text-white transition-all active:scale-95"
                            >
                              Refund
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'analytics' && readiness?.ready && (
        <div className="space-y-12 dash-stagger animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="space-y-2">
            <h2 className="text-3xl font-black uppercase tracking-tight themed-text">Deep Analytics</h2>
            <p className="text-sm font-bold opacity-40 uppercase tracking-widest themed-text">Real-time performance and financial breakdown</p>
          </div>

          {!analyticsData ? (
            <div className="h-64 flex items-center justify-center">
              <div className="animate-spin w-8 h-8 rounded-full border-4 border-black/20 dark:border-white/20 border-t-black dark:border-t-white" />
            </div>
          ) : (
            <div className="space-y-12">
              {/* Financial Ledger Section */}
              <section className="space-y-6">
                <h3 className="text-xl font-black uppercase tracking-tight themed-text">Financial Ledger</h3>
                <div className="overflow-x-auto -mx-2 px-2">
                  <table className="w-full min-w-[520px] text-left border-collapse">
                    <thead>
                      <tr className="border-b themed-border">
                        <th className="pb-4 pt-2 px-4 text-[10px] font-black uppercase tracking-widest opacity-40 themed-text">Event</th>
                        <th className="pb-4 pt-2 px-4 text-[10px] font-black text-right uppercase tracking-widest opacity-40 themed-text">Gross</th>
                        <th className="pb-4 pt-2 px-4 text-[10px] font-black text-right uppercase tracking-widest opacity-40 themed-text">Fees</th>
                        <th className="pb-4 pt-2 px-4 text-[10px] font-black text-right uppercase tracking-widest opacity-40 themed-text">Refunds</th>
                        <th className="pb-4 pt-2 px-4 text-[10px] font-black text-right uppercase tracking-widest opacity-40 themed-text">Net Payout</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analyticsData.revenue.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-sm font-bold opacity-40 themed-text">No financial data available yet.</td>
                        </tr>
                      ) : (
                        analyticsData.revenue.map((rev, _i) => (
                          <tr key={_i} className="border-b themed-border hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
                            <td className="py-4 px-4 font-bold themed-text">{rev.event_title}</td>
                            <td className="py-4 px-4 text-right font-bold text-green-600 dark:text-green-400">R {Number(rev.gross_revenue).toLocaleString()}</td>
                            <td className="py-4 px-4 text-right font-bold text-red-500">- R {Number(rev.total_fees).toLocaleString()}</td>
                            <td className="py-4 px-4 text-right font-bold text-orange-500">- R {Number(rev.total_refunds).toLocaleString()}</td>
                            <td className="py-4 px-4 text-right font-black themed-text">R {Number(rev.net_revenue).toLocaleString()}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Attendance Funnel */}
              <section className="space-y-6">
                <h3 className="text-xl font-black uppercase tracking-tight themed-text">Attendance Funnel</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {analyticsData.funnel.map((funnelItem, i) => {
                    // Match event title
                    const eventTitle = events.find(e => e.id === funnelItem.event_id)?.title || 'Unknown Event';
                    const checkInRate = Math.round(Number(funnelItem.check_in_rate || 0));

                    return (
                      <div key={i} className="themed-card border themed-border rounded-[2rem] p-6 space-y-6">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest opacity-40 themed-text mb-1 truncate">{eventTitle}</p>
                          <h4 className="text-3xl font-black themed-text">{checkInRate}% <span className="text-sm font-bold opacity-30">Check-in</span></h4>
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between text-xs font-bold themed-text">
                            <span>Sold (Unscanned)</span>
                            <span>{Number(funnelItem.tickets_sold || 0) - Number(funnelItem.tickets_scanned_in || 0)}</span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${((Number(funnelItem.tickets_sold || 0) - Number(funnelItem.tickets_scanned_in || 0)) / Number(funnelItem.tickets_sold || 1)) * 100}% ` }} />
                          </div>

                          <div className="flex justify-between text-xs font-bold themed-text pt-2">
                            <span>Scanned In</span>
                            <span className="text-green-500">{funnelItem.tickets_scanned_in || 0}</span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                            <div className="h-full bg-green-500 rounded-full" style={{ width: `${checkInRate}% ` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {analyticsData.funnel.length === 0 && (
                    <div className="col-span-3 text-center py-12 border-2 border-dashed themed-border rounded-[2rem]">
                      <p className="text-sm font-bold opacity-40 themed-text">No active events to track attendance.</p>
                    </div>
                  )}
                </div>
              </section>

              {/* Ticket Velocity */}
              <section className="space-y-6">
                <div className="flex justify-between items-end">
                  <h3 className="text-xl font-black uppercase tracking-tight themed-text">Sales Velocity</h3>
                  <p className="text-[10px] font-bold opacity-40 uppercase tracking-widest themed-text">Last 24 Hours</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {analyticsData.performance.map((perf, i) => (
                    <div key={i} className="themed-card border themed-border rounded-3xl p-5 space-y-4">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-40 themed-text truncate">{perf.tier_name}</p>
                        <h4 className="text-2xl font-black themed-text">R {perf.current_price}</h4>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                        </div>
                        <div>
                          <p className="text-xl font-black themed-text leading-none">+{perf.velocity_24h || 0}</p>
                          <p className="text-[9px] font-black uppercase tracking-widest opacity-30 themed-text">Tickets / 24h</p>
                        </div>
                      </div>
                      <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                        <div className="bg-orange-500 h-full rounded-full" style={{ width: `${perf.sell_through_rate || 0}% ` }} />
                      </div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-right opacity-40 themed-text">{Math.round(perf.sell_through_rate || 0)}% Sold</p>
                    </div>
                  ))}
                  {analyticsData.performance.length === 0 && (
                    <div className="col-span-full text-center py-12 border-2 border-dashed themed-border rounded-[2rem]">
                      <p className="text-sm font-bold opacity-40 themed-text">Create ticket tiers to track velocity.</p>
                    </div>
                  )}
                </div>
              </section>

            </div>
          )}
        </div>
      )}

      {activeTab === 'finance' && (
        <div className="space-y-12 dash-stagger animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6">
            <div className="space-y-2">
              <h2 className="text-3xl font-black uppercase tracking-tight themed-text">Finance Central</h2>
              <p className="text-sm font-bold opacity-40 uppercase tracking-widest themed-text">Balances, settlements and statements</p>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="flex bg-zinc-100 dark:bg-zinc-800/50 p-1 rounded-2xl border themed-border">
                <button
                  onClick={() => setStatementConfig({ type: 'mixed', eventId: null })}
                  className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${statementConfig.type === 'mixed' ? 'bg-black dark:bg-white text-white dark:text-black shadow-md' : 'themed-text opacity-40 hover:opacity-100'}`}
                >
                  Mixed Statement
                </button>
                <div className="relative group">
                  <select
                    value={statementConfig.eventId || ''}
                    onChange={(e) => setStatementConfig({ type: 'event', eventId: e.target.value })}
                    className={`appearance-none bg-transparent px-4 py-2 pr-8 rounded-xl text-[9px] font-black uppercase tracking-widest outline-none cursor-pointer ${statementConfig.type === 'event' ? 'bg-black dark:bg-white text-white dark:text-black shadow-md' : 'themed-text opacity-40 hover:opacity-100'}`}
                  >
                    <option value="" disabled>By Event</option>
                    {events.map((e) => {
                      const now = new Date();
                      const end = e.ends_at ? new Date(e.ends_at) : new Date(new Date(e.starts_at).getTime() + 6 * 60 * 60 * 1000);
                      const isPast = end < now;
                      return (
                        <option
                          key={e.id}
                          value={e.id}
                          disabled={!isPast}
                          className="bg-white dark:bg-zinc-900 text-black dark:text-white"
                        >
                          {e.title} {!isPast ? ' (Active)' : ''}
                        </option>
                      );
                    })}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-40">
                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </div>
              </div>

              <button
                onClick={handleDownloadStatement}
                disabled={isStatementGenerating || !financialSummary || (statementConfig.type === 'event' && !statementConfig.eventId)}
                className="px-8 py-4 bg-black dark:bg-white text-white dark:text-black rounded-2xl font-black text-[10px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl flex items-center gap-3 disabled:opacity-50"
              >
                {isStatementGenerating ? (
                  <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                )}
                Download {statementConfig.type === 'event' ? 'Event' : 'Mixed'} Statement
              </button>
            </div>
          </div>

          {!financialSummary && isLoadingFinance ? (
            <div className="h-64 flex items-center justify-center">
              <div className="animate-spin w-8 h-8 rounded-full border-4 border-black/20 dark:border-white/20 border-t-black dark:border-t-white" />
            </div>
          ) : !financialSummary ? (
            <div className="h-64 flex flex-col items-center justify-center space-y-4">
              <p className="text-sm font-bold opacity-40 themed-text uppercase tracking-widest text-center">Failed to load financial records.</p>
              <button
                onClick={loadFinanceData}
                className="px-6 py-2 bg-black dark:bg-white text-white dark:text-black rounded-full font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all"
              >
                Retry Loading
              </button>
            </div>
          ) : (
            <div className="space-y-12">
              {/* Core Financial Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  { label: 'Available Balance', value: financialSummary.metrics.closing_balance, trend: 'Settled Funds', color: 'text-green-600 dark:text-green-400', icon: <DollarSign className="w-5 h-5" /> },
                  { label: 'Gross Sales', value: financialSummary.metrics.gross_sales, trend: 'Last 30 Days', color: 'themed-text', icon: <LineChart className="w-5 h-5" /> },
                  { label: 'Platform Fees', value: financialSummary.metrics.platform_fees, trend: 'Deducted', color: 'text-red-500', icon: <Landmark className="w-5 h-5" /> },
                  { label: 'Net Change', value: financialSummary.metrics.net_change, trend: 'This Period', color: financialSummary.metrics.net_change >= 0 ? 'text-blue-500' : 'text-red-500', icon: <RefreshCw className="w-5 h-5" /> }
                ].map((stat, i) => (
                  <div key={i} className="themed-card border themed-border rounded-[2rem] p-6 space-y-4 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start">
                      <span className="text-2xl">{stat.icon}</span>
                      <span className="text-[9px] font-black uppercase tracking-widest opacity-30 themed-text">{stat.trend}</span>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest opacity-40 themed-text mb-1">{stat.label}</p>
                      <h4 className={`text-2xl font-black ${stat.color} `}>R {stat.value.toLocaleString('en-ZA', { minimumFractionDigits: 0 })}</h4>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                {/* Transaction Ledger */}
                <div className="lg:col-span-2 space-y-6">
                  <h3 className="text-xl font-black uppercase tracking-tight themed-text">Transaction Ledger</h3>
                  <div className="themed-card border themed-border rounded-[2.5rem] overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b themed-border bg-zinc-50/50 dark:bg-white/5">
                            <th className="py-4 px-6 text-[10px] font-black uppercase tracking-widest opacity-40 themed-text">Date</th>
                            <th className="py-4 px-6 text-[10px] font-black uppercase tracking-widest opacity-40 themed-text">Description</th>
                            <th className="py-4 px-6 text-[10px] font-black uppercase tracking-widest opacity-40 themed-text text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y themed-border">
                          {financialSummary.transactions.length === 0 ? (
                            <tr>
                              <td colSpan={3} className="py-20 text-center text-sm font-bold opacity-30 themed-text uppercase tracking-widest">No transactions found for this period.</td>
                            </tr>
                          ) : (
                            financialSummary.transactions.map((tx) => (
                              <tr key={tx.id} className="hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors">
                                <td className="py-4 px-6 text-[10px] font-bold themed-text opacity-60">
                                  {new Date(tx.created_at).toLocaleString('en-ZA', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', '')}
                                </td>
                                <td className="py-4 px-6">
                                  <div className="flex flex-col">
                                    <span className="text-xs font-black themed-text uppercase tracking-tight">{tx.description}</span>
                                    <span className="text-[9px] font-bold opacity-30 themed-text uppercase tracking-widest">{tx.category.replace('_', ' ')}</span>
                                  </div>
                                </td>
                                <td className={`py-4 px-6 text-right font-black text-xs ${tx.type === 'credit' ? 'text-green-600 dark:text-green-400' : 'themed-text'} `}>
                                  {tx.type === 'credit' ? '+' : '-'} R {tx.amount.toLocaleString()}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Settlement Terminal */}
                <div className="space-y-6">
                  <h3 className="text-xl font-black uppercase tracking-tight themed-text">Settlement</h3>
                  <div className="themed-card border themed-border rounded-[2.5rem] p-8 space-y-8 shadow-2xl relative overflow-hidden bg-zinc-950 text-white">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 rounded-full blur-[40px] -mr-16 -mt-16" />
                    <div className="space-y-4 relative z-10">
                      <div className="space-y-1">
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Available for Payout</p>
                        <h4 className="text-5xl font-black tracking-tighter">R {financialSummary.metrics.closing_balance.toLocaleString()}</h4>
                      </div>
                      <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                        <p className="text-[9px] font-bold text-white/60 uppercase tracking-widest leading-relaxed">
                          Payouts are processed within <span className="text-white">72 hours</span> to your verified banking account.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4 relative z-10">
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-widest text-white/40 ml-4">Withdrawal Amount</label>
                        <div className="relative">
                          <span className="absolute left-6 top-1/2 -translate-y-1/2 font-black text-white/30">R</span>
                          <input
                            type="number"
                            value={payoutAmount}
                            onChange={(e) => setPayoutAmount(e.target.value)}
                            placeholder="0.00"
                            className="w-full bg-white/10 border border-white/20 p-5 pl-12 rounded-3xl font-black text-xl outline-none focus:border-green-500/50 transition-all placeholder:text-white/10"
                          />
                        </div>
                      </div>
                      <button
                        onClick={handleRequestPayoutMain}
                        disabled={isRequestingPayout || !payoutAmount || Number(payoutAmount) <= 0 || Number(payoutAmount) > financialSummary.metrics.closing_balance}
                        className="w-full py-5 bg-green-500 text-black rounded-3xl font-black text-xs uppercase tracking-[0.2em] shadow-xl hover:bg-green-400 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-30 disabled:grayscale disabled:hover:scale-100"
                      >
                        {isRequestingPayout ? (
                          <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <>
                            <span>Request Payout</span>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Trust Score / Tier Indicator */}
                  <div className="p-6 rounded-3xl themed-secondary-bg border themed-border border-dashed space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-black uppercase tracking-widest themed-text opacity-40">Tier Status</span>
                      <span className="text-[9px] font-black uppercase tracking-widest text-amber-500 border border-amber-500/30 px-2 py-0.5 rounded-full">{user.organizer_tier}</span>
                    </div>
                    <div className="w-full h-1.5 bg-zinc-200 dark:bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500" style={{ width: user.organizer_tier === 'premium' ? '100%' : user.organizer_tier === 'pro' ? '60%' : '30%' }} />
                    </div>
                    <p className="text-[9px] font-bold opacity-30 themed-text leading-tight">
                      Platform fee: <span className="themed-text opacity-100 italic">{(usage?.commission_rate || 0.1) * 100}%</span> · Payout speed: <span className="themed-text opacity-100 italic">{user.organizer_tier === 'premium' ? 'Instant' : 'Fast'}</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'team' && (
        <div className="space-y-10 dash-stagger animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
            <div className="space-y-1">
              <h2 className="text-4xl font-black uppercase tracking-tighter themed-text">Team Hub</h2>
              <p className="text-[10px] font-black opacity-30 uppercase tracking-widest themed-text">Manage gate operations and access agents</p>
            </div>
            {usage && (
              <div className="flex items-center gap-3">
                <div className="px-5 py-2.5 rounded-2xl border themed-border bg-zinc-50 dark:bg-zinc-900/50 flex flex-col items-center">
                  <span className="text-[9px] font-black uppercase tracking-widest opacity-40 themed-text">Capacity</span>
                  <span className="text-sm font-black themed-text">{scanners.length} / {user.organizer_tier === 'premium' ? '∞' : (user.organizer_tier === 'pro' ? 5 : 2)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-8">
            <div className="flex flex-col sm:flex-row items-center gap-4 bg-zinc-50 dark:bg-zinc-900/50 p-6 rounded-[2rem] border themed-border">
              <label className="text-[10px] font-black uppercase tracking-widest opacity-40 themed-text shrink-0 sm:ml-4">Select Event</label>
              <select
                value={selectedEventForTeam || ''}
                onChange={(e) => setSelectedEventForTeam(e.target.value)}
                className="w-full sm:flex-1 bg-white dark:bg-black border themed-border p-4 rounded-2xl text-sm font-bold themed-text focus:outline-none focus:ring-2 ring-black/5 dark:ring-white/5 transition-all appearance-none"
              >
                <option value="" disabled>Active Events</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>{ev.title}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
              {/* Scanners List */}
              <div className="lg:col-span-8 space-y-6">
                <div className="flex items-center justify-between px-4">
                  <h3 className="text-xs font-black uppercase tracking-widest opacity-30 themed-text">Active Agents</h3>
                  <span className="text-[10px] font-bold opacity-30 themed-text">{scanners.length} Total</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-4">
                  {isLoadingScanners ? (
                    <div className="themed-card border themed-border rounded-3xl p-12 text-center animate-pulse">
                      <span className="text-sm font-bold opacity-20 themed-text uppercase tracking-widest">Loading agents...</span>
                    </div>
                  ) : scanners.length === 0 ? (
                    <div className="themed-card border themed-border rounded-[2.5rem] p-16 text-center flex flex-col items-center gap-4 opacity-40">
                      <svg className="w-12 h-12 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                      <span className="text-sm font-bold uppercase tracking-widest">No agents found</span>
                    </div>
                  ) : (
                    scanners.map((s) => (
                      <div key={s.id} className="themed-card border themed-border rounded-[2rem] p-6 hover:shadow-xl hover:shadow-black/5 dark:hover:shadow-white/5 transition-all group overflow-hidden relative">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-zinc-500/5 rounded-full blur-2xl -mr-12 -mt-12 pointer-events-none" />

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center text-xl font-bold themed-text border themed-border group-hover:scale-110 transition-transform">
                              {(s.profiles?.name || 'A')[0].toUpperCase()}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-base font-black themed-text">{s.profiles?.name || 'Unnamed Agent'}</span>
                                <span className={`w-1.5 h-1.5 rounded-full ${s.is_active ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500'} `} />
                              </div>
                              <span className="text-[10px] font-bold opacity-30 themed-text uppercase tracking-widest">{s.profiles?.email}</span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-3">
                            <div className="px-4 py-2 bg-zinc-50 dark:bg-white/5 rounded-xl border themed-border">
                              <span className="text-[9px] font-black uppercase tracking-widest opacity-40 themed-text block leading-none mb-1">Gate</span>
                              <span className="text-[10px] font-black uppercase tracking-wider themed-text leading-none">{s.gate_name}</span>
                            </div>

                            <button
                              onClick={() => handleRevokeScanner(s.id)}
                              className="px-6 py-3 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-sm active:scale-95"
                            >
                              Revoke
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Creation Terminal */}
              <div className="lg:col-span-4 space-y-6">
                <h3 className="text-xs font-black uppercase tracking-widest opacity-30 themed-text px-4">Provision Access</h3>

                {generatedCredentials ? (
                  <div className="themed-card border border-green-500/30 rounded-[2.5rem] p-8 space-y-8 shadow-2xl relative overflow-hidden bg-green-500/10 animate-in zoom-in-95 duration-500">
                    <div className="relative z-10 space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-green-500 flex items-center justify-center text-black shadow-lg shadow-green-500/20">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                      </div>
                      <h4 className="text-2xl font-black text-green-600 dark:text-green-400 leading-none">Access Ready</h4>
                      <p className="text-[11px] font-bold opacity-60 themed-text leading-relaxed uppercase tracking-wide">
                        The agent can now use these credentials. <strong>Password will not be shown again.</strong>
                      </p>
                    </div>

                    <div className="space-y-4 font-mono text-xs bg-black p-6 rounded-2xl text-green-400 border border-green-500/20 shadow-inner">
                      <div className="space-y-1">
                        <span className="opacity-40 block text-[9px] uppercase font-sans tracking-widest">Agent ID</span>
                        <div className="flex items-center justify-between">
                          <span>{generatedCredentials.email}</span>
                          <button onClick={() => { navigator.clipboard.writeText(generatedCredentials.email); }} className="hover:text-white transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                          </button>
                        </div>
                      </div>
                      <div className="h-px bg-green-500/10" />
                      <div className="space-y-1">
                        <span className="opacity-40 block text-[9px] uppercase font-sans tracking-widest">Temp Password</span>
                        <div className="flex items-center justify-between font-black text-lg">
                          <span>{generatedCredentials.password}</span>
                          <button onClick={() => { navigator.clipboard.writeText(generatedCredentials.password); }} className="hover:text-white transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                          </button>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => setGeneratedCredentials(null)}
                      className="w-full py-5 bg-green-500 text-black rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-green-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                    >
                      I Saved These
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleCreateScanner} className="themed-card border themed-border rounded-[2.5rem] p-8 space-y-6 shadow-sm relative overflow-hidden flex flex-col items-stretch">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-zinc-500/5 rounded-full blur-[40px] -mr-16 -mt-16 pointer-events-none" />

                    {/* Creation Window Warning Banner */}
                    {(() => {
                      const selEv = events.find(ev => ev.id === selectedEventForTeam);
                      if (!selEv) return null;
                      const now = new Date();
                      const eventStart = new Date(selEv.starts_at);
                      const hoursUntilEvent = (eventStart.getTime() - now.getTime()) / (1000 * 60 * 60);
                      if (hoursUntilEvent > 48) {
                        const dateStr = eventStart.toLocaleDateString('en-ZA', { weekday: 'long', month: 'long', day: 'numeric' });
                        return (
                          <div className="relative z-10 bg-amber-500/5 border border-amber-500/20 rounded-2xl px-6 py-5 space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                              <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">Restricted Window</p>
                            </div>
                            <p className="text-[11px] font-bold text-amber-600/60 dark:text-amber-400/60 leading-relaxed uppercase tracking-wide">
                              Scanning agents can only be provisioned within 48 hours of launch. <br /> Available on <strong>{dateStr}</strong>.
                            </p>
                          </div>
                        );
                      }
                      return null;
                    })()}

                    <div className="space-y-4 relative z-10">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-widest opacity-40 themed-text ml-4">Agent Identifier</label>
                        <input
                          type="text"
                          required
                          value={newScannerForm.name}
                          onChange={(e) => setNewScannerForm({ ...newScannerForm, name: e.target.value })}
                          placeholder="e.g. VIP Entrance Agent"
                          className="w-full themed-secondary-bg border border-transparent p-4 rounded-2xl text-sm font-bold themed-text focus:outline-none focus:ring-2 ring-black/5 dark:ring-white/5 transition-all placeholder:opacity-30"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-widest opacity-40 themed-text ml-4">Gate Assignment</label>
                        <input
                          type="text"
                          required
                          value={newScannerForm.gate_name}
                          onChange={(e) => setNewScannerForm({ ...newScannerForm, gate_name: e.target.value })}
                          placeholder="e.g. South Wing"
                          className="w-full themed-secondary-bg border border-transparent p-4 rounded-2xl text-sm font-bold themed-text focus:outline-none focus:ring-2 ring-black/5 dark:ring-white/5 transition-all placeholder:opacity-30"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-widest opacity-40 themed-text ml-4">Access Code</label>
                        <input
                          type="text"
                          required
                          minLength={6}
                          value={newScannerForm.password}
                          onChange={(e) => setNewScannerForm({ ...newScannerForm, password: e.target.value })}
                          placeholder="Min 6 characters"
                          className="w-full themed-secondary-bg border border-transparent p-4 rounded-2xl text-sm font-bold themed-text focus:outline-none focus:ring-2 ring-black/5 dark:ring-white/5 transition-all placeholder:opacity-30"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isCreatingScanner || !selectedEventForTeam || events.length === 0 || (() => {
                        const selEv = events.find(ev => ev.id === selectedEventForTeam);
                        if (!selEv) return false;
                        const hoursUntilEvent = (new Date(selEv.starts_at).getTime() - Date.now()) / (1000 * 60 * 60);
                        return hoursUntilEvent > 48;
                      })()}
                      className="w-full py-5 bg-black dark:bg-white text-white dark:text-black rounded-3xl font-black text-xs uppercase tracking-widest shadow-2xl shadow-black/10 dark:shadow-white/5 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-30 disabled:hover:scale-100"
                    >
                      {isCreatingScanner ? (
                        <span className="flex items-center gap-2"><div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> Provisioning...</span>
                      ) : (
                        'Generate Credentials'
                      )}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'identity' && (

        <div className="dash-stagger animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="themed-card border themed-border rounded-[3rem] p-8 md:p-12 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-zinc-500/5 rounded-full blur-[100px] -mr-32 -mt-32 pointer-events-none" />
            <div className="max-w-2xl space-y-12 relative z-10">
              <div className="space-y-4">
                <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tighter themed-text leading-none">Organizer Registry</h2>
                <p className="text-zinc-500 text-lg leading-relaxed max-w-lg">Complete your professional profile to unlock full platform capabilities and verified status.</p>
              </div>

              {readiness?.ready ? (
                <div className="p-8 bg-green-500/5 border border-green-500/20 rounded-[2rem] flex items-start gap-6">
                  <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center text-white shrink-0">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-xl font-black uppercase tracking-tight text-green-600 dark:text-green-400">Verified Status Active</h4>
                    <p className="text-sm font-medium text-green-600/60 dark:text-green-400/60">Your organization is fully verified and authorized to host public events.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-8">
                  <div className="space-y-6">
                    <div className="flex items-center gap-4">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black border ${profile?.organizer_tier !== 'free' ? 'bg-black dark:bg-white text-white dark:text-black border-transparent' : 'border-zinc-300 text-zinc-300'} `}>1</div>
                      <span className={`text-xs font-black uppercase tracking-widest ${profile?.organizer_tier !== 'free' ? 'themed-text' : 'text-zinc-300'} `}>Subscription Plan</span>
                    </div>
                    <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-800 ml-4" />
                    <div className="flex items-center gap-4">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black border ${profile?.business_name ? 'bg-black dark:bg-white text-white dark:text-black border-transparent' : 'border-zinc-300 text-zinc-300'} `}>2</div>
                      <span className={`text-xs font-black uppercase tracking-widest ${profile?.business_name ? 'themed-text' : 'text-zinc-300'} `}>Business Details</span>
                    </div>
                    <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-800 ml-4" />
                    <div className="flex items-center gap-4">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black border ${profile?.id_proof_url ? 'bg-black dark:bg-white text-white dark:text-black border-transparent' : 'border-zinc-300 text-zinc-300'} `}>3</div>
                      <span className={`text-xs font-black uppercase tracking-widest ${profile?.id_proof_url ? 'themed-text' : 'text-zinc-300'} `}>Verification Documents</span>
                    </div>
                  </div>

                  <button onClick={() => onNavigate('settings')} className="w-full py-5 bg-black dark:bg-white text-white dark:text-black rounded-[2rem] font-black text-sm uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl">
                    Continue Registration
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Manual Creation Modal */}
      {isFormOpen && (
        <EventCreationWizard
          user={user}
          categories={categories || []}
          onClose={() => setIsFormOpen(false)}
          onEventCreated={(eventId, isSeated) => {
            loadDashboardData();
            if (onEventCreated) onEventCreated();
            if (isSeated && eventId) {
              setVenueBuilderEventId(eventId);
            }
          }}
        />
      )}

      {/* Venue Builder Modal */}
      {venueBuilderEventId && (
        <VenueBuilder
          eventId={venueBuilderEventId}
          onClose={() => setVenueBuilderEventId(null)}
          onComplete={() => {
            setVenueBuilderEventId(null);
            loadDashboardData();
            if (onEventCreated) onEventCreated();
          }}
        />
      )}

      {/* Edit Event Modal */}
      {editingEvent && (
        <EditEventModal
          event={editingEvent}
          categories={categories || []}
          onClose={() => setEditingEvent(null)}
          onSaved={() => {
            loadDashboardData();
            if (onEventCreated) onEventCreated();
          }}
        />
      )}

      {/* Subscription Upgrade Modal */}
      <SubscriptionModal
        user={user}
        isOpen={isSubscriptionModalOpen}
        onClose={() => setIsSubscriptionModalOpen(false)}
      />
      {/* Refund Confirmation Modal */}
      {refundingOrder && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="themed-card border themed-border rounded-[2.5rem] w-full max-w-lg p-8 space-y-8 shadow-2xl relative overflow-hidden text-left">
            <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full blur-[40px] -mr-16 -mt-16 pointer-events-none" />

            <div className="space-y-4 text-center">
              <div className="w-20 h-20 bg-red-500/10 rounded-3xl flex items-center justify-center mx-auto text-red-500">
                <AlertCircle className="w-10 h-10" />
              </div>
              <h3 className="text-3xl font-black uppercase tracking-tight themed-text">Process Refund?</h3>
              <p className="text-sm font-bold text-zinc-500 max-w-sm mx-auto leading-relaxed">
                You are about to refund <span className="text-black dark:text-white">R {Number(refundingOrder.total_amount).toLocaleString()}</span> to <span className="text-black dark:text-white">{refundingOrder.buyer_name || 'the buyer'}</span>. This action cannot be undone.
              </p>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-black uppercase tracking-widest opacity-40 themed-text ml-4 text-left block">Reason for Refund (Optional)</label>
              <textarea
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="e.g. Event cancellation, customer request..."
                className="w-full bg-zinc-100 dark:bg-white/5 border themed-border p-5 rounded-3xl text-sm font-bold outline-none focus:border-red-500/50 transition-all resize-none h-24 themed-text"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <button
                onClick={() => { setRefundingOrder(null); setRefundReason(''); }}
                disabled={isRefunding}
                className="flex-1 py-5 rounded-3xl border themed-border text-[10px] font-black uppercase tracking-widest themed-text hover:bg-zinc-100 dark:hover:bg-white/5 transition-all active:scale-95 disabled:opacity-30"
              >
                Cancel
              </button>
              <button
                onClick={handleRefundOrder}
                disabled={isRefunding}
                className="flex-1 py-5 bg-red-500 text-white rounded-3xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:bg-red-600 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
              >
                {isRefunding ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Confirm Refund'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};