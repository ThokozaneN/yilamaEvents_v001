import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Event, EventCategory } from '../types';

interface EditEventModalProps {
    event: Event;
    categories: EventCategory[];
    onClose: () => void;
    onSaved: () => void;
}

export function EditEventModal({ event, categories, onClose, onSaved }: EditEventModalProps) {
    const [form, setForm] = useState({
        title: event.title || '',
        description: event.description || '',
        venue: event.venue || '',
        image_url: event.image_url || '',
        starts_at: event.starts_at ? event.starts_at.slice(0, 16) : '',
        ends_at: event.ends_at ? event.ends_at.slice(0, 16) : '',
        category: event.category || '',
        status: event.status || 'draft',
        headliners: (event.headliners || []).join(', '),
        prohibitions: (event.prohibitions || []).join(', '),
    });
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    const set = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));

    const handleSave = async () => {
        if (!form.title.trim()) { setError('Event title is required.'); return; }
        setError(null);
        setIsSaving(true);
        try {
            const { error: updateError } = await supabase
                .from('events')
                .update({
                    title: form.title.trim(),
                    description: form.description.trim(),
                    venue: form.venue.trim(),
                    image_url: form.image_url.trim() || null,
                    starts_at: form.starts_at || null,
                    ends_at: form.ends_at || null,
                    category: form.category || null,
                    status: form.status,
                    headliners: form.headliners ? form.headliners.split(',').map(s => s.trim()).filter(Boolean) : [],
                    prohibitions: form.prohibitions ? form.prohibitions.split(',').map(s => s.trim()).filter(Boolean) : [],
                    updated_at: new Date().toISOString(),
                })
                .eq('id', event.id);

            if (updateError) throw updateError;
            onSaved();
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to save changes.');
        } finally {
            setIsSaving(false);
        }
    };

    const inputClass = "w-full px-5 py-3.5 rounded-2xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm font-medium text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-500";
    const labelClass = "text-[10px] font-black uppercase tracking-widest opacity-50 themed-text";

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-2 sm:p-4 sm:p-6 bg-black/30 dark:bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-[3rem] shadow-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-5 sm:px-8 pt-6 sm:pt-8 pb-5 sm:pb-6 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
                    <div>
                        <h2 className="text-2xl font-black uppercase tracking-tight themed-text">Edit Event</h2>
                        <p className="text-xs font-bold opacity-40 themed-text mt-1">Ticket prices cannot be changed after launch.</p>
                    </div>
                    <button onClick={onClose} className="p-3 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-500">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* Scrollable Body */}
                <div className="overflow-y-auto flex-1 px-5 sm:px-8 py-5 sm:py-6 space-y-5">

                    {/* Title */}
                    <div className="space-y-2">
                        <label className={labelClass}>Event Title *</label>
                        <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="Event name" className={inputClass} />
                    </div>

                    {/* Status */}
                    <div className="space-y-2">
                        <label className={labelClass}>Visibility</label>
                        <div className="flex gap-3">
                            {(['draft', 'published', 'cancelled'] as const).map(s => (
                                <button
                                    key={s}
                                    onClick={() => set('status', s)}
                                    className={`flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${form.status === s
                                        ? s === 'published' ? 'bg-green-500 text-white border-green-500'
                                            : s === 'cancelled' ? 'bg-red-500 text-white border-red-500'
                                                : 'bg-black dark:bg-white text-white dark:text-black border-transparent'
                                        : 'bg-transparent border-zinc-200 dark:border-zinc-700 themed-text opacity-50 hover:opacity-100'
                                        }`}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Description */}
                    <div className="space-y-2">
                        <label className={labelClass}>Description</label>
                        <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={4} placeholder="Describe the event..." className={inputClass + ' resize-none'} />
                    </div>

                    {/* Venue */}
                    <div className="space-y-2">
                        <label className={labelClass}>Venue</label>
                        <input value={form.venue} onChange={e => set('venue', e.target.value)} placeholder="Location / Address" className={inputClass} />
                    </div>

                    {/* Image URL */}
                    <div className="space-y-2">
                        <label className={labelClass}>Cover Image URL</label>
                        <input value={form.image_url} onChange={e => set('image_url', e.target.value)} placeholder="https://..." className={inputClass} />
                        {form.image_url && (
                            <img src={form.image_url} alt="preview" className="w-full h-32 object-cover rounded-2xl border border-zinc-200 dark:border-zinc-800" onError={e => (e.currentTarget.style.display = 'none')} />
                        )}
                    </div>

                    {/* Dates */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className={labelClass}>Start Date & Time</label>
                            <input type="datetime-local" value={form.starts_at} onChange={e => set('starts_at', e.target.value)} className={inputClass} />
                        </div>
                        <div className="space-y-2">
                            <label className={labelClass}>End Date & Time</label>
                            <input type="datetime-local" value={form.ends_at} onChange={e => set('ends_at', e.target.value)} className={inputClass} />
                        </div>
                    </div>

                    {/* Category */}
                    <div className="space-y-2">
                        <label className={labelClass}>Category</label>
                        <select value={form.category} onChange={e => set('category', e.target.value)} className={inputClass}>
                            <option value="">— Select category —</option>
                            {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                        </select>
                    </div>

                    {/* Headliners */}
                    <div className="space-y-2">
                        <label className={labelClass}>Headliners (comma-separated)</label>
                        <input value={form.headliners} onChange={e => set('headliners', e.target.value)} placeholder="Artist A, DJ B, Band C" className={inputClass} />
                    </div>

                    {/* Prohibitions */}
                    <div className="space-y-2">
                        <label className={labelClass}>Prohibitions (comma-separated)</label>
                        <input value={form.prohibitions} onChange={e => set('prohibitions', e.target.value)} placeholder="No cameras, No outside food" className={inputClass} />
                    </div>

                    {error && (
                        <div className="px-5 py-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-sm text-red-500 font-medium">
                            {error}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 sm:px-8 py-5 sm:py-6 border-t border-zinc-100 dark:border-zinc-800 flex gap-3 shrink-0">
                    <button onClick={onClose} className="flex-1 py-4 rounded-2xl border border-zinc-200 dark:border-zinc-700 text-sm font-black uppercase tracking-widest themed-text hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-all">
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex-1 py-4 rounded-2xl bg-black dark:bg-white text-white dark:text-black text-sm font-black uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    );
}
