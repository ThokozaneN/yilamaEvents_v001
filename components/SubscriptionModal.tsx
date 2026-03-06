import React, { useState } from 'react';
import { Profile } from '../types';
import { supabase } from '../lib/supabase';
import { Sprout, Crown } from 'lucide-react';

interface SubscriptionModalProps {
    user: Profile | null;
    isOpen: boolean;
    onClose: () => void;
}

export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({ user, isOpen, onClose }) => {
    const [updatingTier, setUpdatingTier] = useState<'pro' | 'premium' | null>(null);

    if (!isOpen || !user) return null;

    const handleUpgradeTier = async (newTier: 'pro' | 'premium') => {
        setUpdatingTier(newTier);

        try {
            const { data: responseBody, error: funcErr } = await supabase.functions.invoke('create-billing-checkout', {
                body: { tier: newTier, userId: user.id }
            });

            if (funcErr || !responseBody) {
                throw new Error(funcErr?.message || 'Failed to initiate checkout');
            }

            const { url, params: pfParams } = responseBody;

            if (!url || !pfParams) {
                throw new Error("Invalid response from checkout service.");
            }

            // 2. Build and submit a hidden form to correctly POST to PayFast
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = url;

            Object.keys(pfParams).forEach(key => {
                const input = document.createElement('input');
                input.type = 'hidden';
                input.name = key;
                input.value = pfParams[key];
                form.appendChild(input);
            });

            document.body.appendChild(form);
            form.submit();

            // Note: We don't remove the form or setIsUpdating(false) immediately
            // because the browser is navigating away to the payment gateway.

        } catch (err: any) {
            alert(err.message || 'Failed to process payment request');
            setUpdatingTier(null);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 bg-black/30 dark:bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="relative w-full max-w-5xl bg-white dark:bg-black rounded-[3rem] shadow-2xl overflow-hidden border border-zinc-100 dark:border-zinc-800 flex flex-col max-h-[90vh]">

                {/* Header & Close Button */}
                <div className="flex justify-between items-start p-8 md:p-12 pb-4">
                    <div className="space-y-1">
                        <h3 className="text-3xl font-black uppercase tracking-tight themed-text">Subscription Plans</h3>
                        <p className="text-[12px] font-bold opacity-30 uppercase tracking-[0.2em] themed-text">Upgrade your organizer limits</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-10 h-10 flex items-center justify-center bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full text-zinc-500 hover:text-black dark:hover:text-white transition-all">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* Content Body */}
                <div className="p-8 md:p-12 pt-4 overflow-y-auto">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                        {/* Starter / Free */}
                        <div className={`p-8 rounded-[2rem] border-2 flex flex-col justify-between gap-6 transition-all ${user?.organizer_tier === 'free' || !user?.organizer_tier ? 'border-black dark:border-white shadow-xl scale-[1.02]' : 'themed-border themed-secondary-bg hover:border-black/50 dark:hover:border-white/50'}`}>
                            <div className="space-y-4">
                                <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                                    <Sprout className="w-6 h-6" />
                                </div>
                                <div>
                                    <h4 className="text-lg font-black uppercase tracking-tight themed-text">Starter</h4>
                                    <p className="text-3xl font-black themed-text mt-2">Free</p>
                                </div>
                                <ul className="space-y-3 pt-4 border-t border-zinc-200 dark:border-zinc-800 text-xs font-bold themed-text opacity-70">
                                    <li className="flex gap-2"><span>•</span> Unlimited Events</li>
                                    <li className="flex gap-2"><span>•</span> 1 Ticket Type per Event</li>
                                    <li className="flex gap-2"><span>•</span> 1 Scanner Device</li>
                                    <li className="flex gap-2"><span>•</span> 2% Platform Fee</li>
                                    <li className="flex gap-2"><span>•</span> Basic Sales Insights</li>
                                </ul>
                            </div>
                            {(user?.organizer_tier === 'free' || !user?.organizer_tier) ? (
                                <div className="w-full py-4 bg-zinc-200 dark:bg-zinc-800 text-black dark:text-white rounded-full font-black text-[10px] uppercase tracking-widest text-center">Current Plan</div>
                            ) : (
                                <button disabled className="w-full py-4 border-2 border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-400 rounded-full font-black text-[10px] uppercase tracking-widest text-center cursor-not-allowed">Downgrade Unavailable</button>
                            )}
                        </div>

                        {/* PRO */}
                        <div className={`p-8 rounded-[2rem] border-2 relative flex flex-col justify-between gap-6 transition-all ${user?.organizer_tier === 'pro' ? 'border-purple-500 shadow-xl scale-[1.02] shadow-purple-500/20' : 'border-purple-500/30 themed-secondary-bg hover:border-purple-500'}`}>
                            <div className="absolute top-0 right-8 -mt-3">
                                <span className="px-3 py-1 bg-purple-500 text-white text-[8px] font-black uppercase tracking-widest rounded-full shadow-lg">Most Popular</span>
                            </div>
                            <div className="space-y-4">
                                <div className="w-12 h-12 rounded-full bg-purple-500/20 text-purple-500 flex items-center justify-center">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                </div>
                                <div>
                                    <h4 className="text-lg font-black uppercase tracking-tight themed-text">Pro</h4>
                                    <p className="text-3xl font-black themed-text mt-2">R 79<span className="text-xs opacity-50 font-medium">/mo</span></p>
                                </div>
                                <ul className="space-y-3 pt-4 border-t border-zinc-200 dark:border-zinc-800 text-xs font-bold themed-text opacity-70">
                                    <li className="flex gap-2"><span className="text-purple-500">•</span> Unlimited Events</li>
                                    <li className="flex gap-2"><span className="text-purple-500">•</span> Up to 10 Ticket Types per Event</li>
                                    <li className="flex gap-2"><span className="text-purple-500">•</span> Up to 5 Scanner Devices</li>
                                    <li className="flex gap-2"><span className="text-purple-500">•</span> 2% Platform Fee</li>
                                    <li className="flex gap-2"><span className="text-purple-500">•</span> AI Revenue Insights</li>
                                    <li className="flex gap-2"><span className="text-purple-500">•</span> Reserved Seating Maps</li>
                                </ul>
                            </div>
                            {user?.organizer_tier === 'pro' ? (
                                <div className="w-full py-4 bg-purple-500 text-white rounded-full font-black text-[10px] uppercase tracking-widest text-center shadow-lg shadow-purple-500/30">Current Plan</div>
                            ) : (
                                <button
                                    onClick={() => handleUpgradeTier('pro')}
                                    disabled={updatingTier !== null || user?.organizer_tier === 'premium'}
                                    className="w-full py-4 bg-black dark:bg-white text-white dark:text-black rounded-full font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all shadow-xl disabled:opacity-50"
                                >
                                    {updatingTier === 'pro' ? 'Redirecting...' : user?.organizer_tier === 'premium' ? 'Current Plan Higher' : 'Upgrade to Pro'}
                                </button>
                            )}
                        </div>

                        {/* PREMIUM */}
                        <div className={`p-8 rounded-[2rem] border-2 flex flex-col justify-between gap-6 transition-all ${user?.organizer_tier === 'premium' ? 'border-amber-500 shadow-xl scale-[1.02] shadow-amber-500/20' : 'border-amber-500/30 themed-secondary-bg hover:border-amber-500'}`}>
                            <div className="space-y-4">
                                <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center">
                                    <Crown className="w-5 h-5" />
                                </div>
                                <div>
                                    <h4 className="text-lg font-black uppercase tracking-tight themed-text">Premium</h4>
                                    <p className="text-3xl font-black themed-text mt-2">R 119<span className="text-xs opacity-50 font-medium">/mo</span></p>
                                </div>
                                <ul className="space-y-3 pt-4 border-t border-zinc-200 dark:border-zinc-800 text-xs font-bold themed-text opacity-70">
                                    <li className="flex gap-2"><span className="text-amber-500">•</span> Unlimited Events</li>
                                    <li className="flex gap-2"><span className="text-amber-500">•</span> Unlimited Ticket Types</li>
                                    <li className="flex gap-2"><span className="text-amber-500">•</span> Unlimited Scanner Devices</li>
                                    <li className="flex gap-2"><span className="text-amber-500">•</span> 1.5% Platform Fee (Lowest)</li>
                                    <li className="flex gap-2"><span className="text-amber-500">•</span> AI Revenue Insights</li>
                                    <li className="flex gap-2"><span className="text-amber-500">•</span> Reserved Seating Maps</li>
                                </ul>
                            </div>
                            {user?.organizer_tier === 'premium' ? (
                                <div className="w-full py-4 bg-amber-500 text-white rounded-full font-black text-[10px] uppercase tracking-widest text-center shadow-lg shadow-amber-500/30">Current Plan</div>
                            ) : (
                                <button
                                    onClick={() => handleUpgradeTier('premium')}
                                    disabled={updatingTier !== null}
                                    className="w-full py-4 bg-black dark:bg-white text-white dark:text-black rounded-full font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all shadow-xl disabled:opacity-50"
                                >
                                    {updatingTier === 'premium' ? 'Redirecting...' : 'Upgrade to Premium'}
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="mt-8 flex flex-col items-center gap-4 opacity-40">
                        <div className="flex flex-wrap justify-center gap-2">
                            {['Visa', 'Mastercard', 'Amex', 'Apple Pay', 'Samsung Pay'].map(m => (
                                <span key={m} className="px-2 py-1 border themed-border rounded text-[8px] font-black uppercase tracking-widest whitespace-nowrap">{m}</span>
                            ))}
                        </div>
                        <p className="text-center text-[10px] font-bold themed-text uppercase tracking-widest">
                            Securely processed via PayFast · 256-bit SSL
                        </p>
                    </div>
                </div>

            </div>
        </div>
    );
};
