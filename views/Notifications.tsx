import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { AppNotification } from '../types';
import { logError } from '../lib/monitoring';
import { PartyPopper, Ticket, AlertTriangle, Calendar, Bell, Inbox } from 'lucide-react';

interface NotificationsViewProps {
    onNavigate: (view: string) => void;
    onRefreshUnreadCount?: () => void;
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({ onNavigate, onRefreshUnreadCount }) => {
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);

    useEffect(() => {
        fetchNotifications();
    }, []);

    const fetchNotifications = async () => {
        try {
            setIsLoading(true);
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            const { data, error } = await supabase
                .from('app_notifications')
                .select('*')
                .eq('user_id', session.user.id)
                .order('created_at', { ascending: false })
                .limit(50); // Get last 50 for performance

            if (error) throw error;
            setNotifications(data || []);
        } catch (err) {
            logError(err, { tag: 'fetch_notifications' });
        } finally {
            setIsLoading(false);
        }
    };

    const markAllAsRead = async () => {
        try {
            setIsMarkingAllRead(true);
            // RPC call to securely mark all as read for the current user
            const { error } = await supabase.rpc('mark_all_notifications_read');
            if (error) throw error;

            // Update local state to reflect UI instantly
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
            // Tell parent App to refresh global counter
            if (onRefreshUnreadCount) onRefreshUnreadCount();

        } catch (err) {
            logError(err, { tag: 'mark_all_read' });
        } finally {
            setIsMarkingAllRead(false);
        }
    };

    const handleNotificationClick = async (notification: AppNotification) => {
        // 1. Mark this specific one as read if it isn't already
        if (!notification.is_read) {
            try {
                await supabase.from('app_notifications').update({ is_read: true }).eq('id', notification.id);
                setNotifications(prev => prev.map(n => n.id === notification.id ? { ...n, is_read: true } : n));
                if (onRefreshUnreadCount) onRefreshUnreadCount();
            } catch (err) {
                logError(err, { tag: 'mark_single_read' });
            }
        }

        // 2. Perform navigation if action_url is provided
        if (notification.action_url) {
            // Very basic internal router mapping from action_url to views
            if (notification.action_url === '/wallet') onNavigate('wallet');
            else if (notification.action_url.startsWith('/events/')) {
                // Technically this should open the event detail view, but for now we route home where they can click it.
                // A full robust implementation would pass the event ID up to App.tsx
                onNavigate('home');
            }
        }
    };

    const getIconForType = (type: string) => {
        switch (type) {
            case 'premium_launch': return <PartyPopper className="w-6 h-6" />;
            case 'ticket_purchase': return <Ticket className="w-6 h-6" />;
            case 'fraud_alert': return <AlertTriangle className="w-6 h-6" />;
            case 'event_update': return <Calendar className="w-6 h-6" />;
            default: return <Bell className="w-6 h-6" />;
        }
    };

    const getBgColorForType = (type: string, isRead: boolean) => {
        if (isRead) return 'bg-zinc-100 dark:bg-zinc-900 border-transparent';
        switch (type) {
            case 'fraud_alert': return 'bg-red-500/10 border-red-500/30';
            case 'premium_launch': return 'bg-purple-500/10 border-purple-500/30';
            case 'ticket_purchase': return 'bg-green-500/10 border-green-500/30';
            default: return 'bg-blue-500/5 border-blue-500/20';
        }
    };

    const unreadCount = notifications.filter(n => !n.is_read).length;

    return (
        <div className="min-h-screen pt-24 pb-32 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto">
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">

                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                    <div className="space-y-2">
                        <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tighter themed-text leading-none">
                            Notifications
                        </h1>
                        <p className="text-sm font-bold opacity-40 uppercase tracking-widest themed-text">
                            {unreadCount} Unread Message{unreadCount !== 1 ? 's' : ''}
                        </p>
                    </div>

                    {unreadCount > 0 && (
                        <button
                            onClick={markAllAsRead}
                            disabled={isMarkingAllRead}
                            className="px-6 py-3 rounded-full bg-black dark:bg-white text-white dark:text-black text-xs font-black uppercase tracking-widest hover:scale-105 transition-all shadow-xl disabled:opacity-50 flex items-center gap-2 w-max"
                        >
                            {isMarkingAllRead ? (
                                <>
                                    <div className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                                    Marking...
                                </>
                            ) : (
                                'Mark All Read'
                            )}
                        </button>
                    )}
                </div>

                {isLoading ? (
                    <div className="py-24 flex items-center justify-center">
                        <div className="w-12 h-12 rounded-full border-4 border-black/10 dark:border-white/10 border-t-black dark:border-t-white animate-spin" />
                    </div>
                ) : notifications.length === 0 ? (
                    <div className="py-32 flex flex-col items-center text-center space-y-6">
                        <div className="w-24 h-24 rounded-full bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center text-zinc-400">
                            <Inbox className="w-12 h-12" />
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-2xl font-black uppercase tracking-tight themed-text">All Caught Up</h3>
                            <p className="text-sm font-bold opacity-40 uppercase tracking-widest themed-text max-w-xs mx-auto">
                                When important things happen on Yilama, you'll see them here.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {notifications.map(notification => (
                            <div
                                key={notification.id}
                                onClick={() => handleNotificationClick(notification)}
                                className={`w-full p-5 sm:p-6 rounded-3xl border transition-all duration-300 ${notification.action_url ? 'cursor-pointer hover:scale-[1.01] hover:shadow-lg' : ''} ${getBgColorForType(notification.type, notification.is_read)} flex items-start gap-4 sm:gap-6 relative group`}
                            >
                                {/* Unread indicator dot */}
                                {!notification.is_read && (
                                    <div className="absolute top-1/2 -translate-y-1/2 left-2 sm:left-3 w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                                )}

                                <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-inner ${notification.is_read ? 'bg-white dark:bg-black/50 opacity-60' : 'bg-white dark:bg-black'}`}>
                                    {getIconForType(notification.type)}
                                </div>

                                <div className="flex-1 min-w-0 pt-1 space-y-1.5 pr-8">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-4">
                                        <h4 className={`text-base sm:text-lg font-black uppercase tracking-tight truncate ${notification.is_read ? 'opacity-60 themed-text' : 'themed-text'}`}>
                                            {notification.title}
                                        </h4>
                                        <span className="text-[10px] font-bold uppercase tracking-widest opacity-40 shrink-0">
                                            {new Date(notification.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    <p className={`text-sm leading-relaxed ${notification.is_read ? 'opacity-60 themed-text font-medium' : 'text-zinc-600 dark:text-zinc-300 font-bold'}`}>
                                        {notification.body}
                                    </p>
                                </div>

                                {notification.action_url && (
                                    <div className={`absolute right-6 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center transition-all ${notification.is_read ? 'opacity-20 group-hover:opacity-60' : 'bg-black/5 dark:bg-white/10 opacity-100 group-hover:bg-black/10 dark:group-hover:bg-white/20'}`}>
                                        <svg className="w-4 h-4 ml-0.5 themed-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7" />
                                        </svg>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
