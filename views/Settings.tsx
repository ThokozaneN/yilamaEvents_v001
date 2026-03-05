import React, { useState, useEffect, useRef } from 'react';
import { Profile, OrganizerTier, UserRole, Payout } from '../types';
import { ThemeType } from '../App';
import { supabase } from '../lib/supabase';
import { Sprout, Crown } from 'lucide-react';
import { gsap } from 'gsap';

interface SettingsProps {
  user: Profile | null;
  onLogout: () => void;
  onNavigate?: (view: string) => void;
  onUpdateProfile?: (profile: Partial<Profile>) => void;
  accessibility?: { reducedMotion: boolean; highContrast: boolean; largeText: boolean; };
  onToggleAccessibility?: (key: any) => void;
  theme: ThemeType;
  onThemeChange: (theme: ThemeType) => void;
}


export const SettingsView: React.FC<SettingsProps> = ({ user, onLogout, theme, onThemeChange, onUpdateProfile, accessibility, onToggleAccessibility }) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'appearance' | 'financials' | 'compliance'>('profile');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [bankingOpen, setBankingOpen] = useState(false); // Collapsible banking details

  // Financial Data State — loaded live from Supabase
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [graphData, setGraphData] = useState<{ label: string; value: number }[]>([]);
  const [isLoadingFinancials, setIsLoadingFinancials] = useState(false);

  // Load real financial data when tab is opened
  React.useEffect(() => {
    if (activeTab !== 'financials' || !user) return;
    setIsLoadingFinancials(true);

    const loadFinancials = async () => {
      // 1. Real payouts
      const { data: payoutRows } = await supabase
        .from('payouts')
        .select('*')
        .eq('organizer_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (payoutRows) setPayouts(payoutRows as Payout[]);

      // 2. Monthly revenue graph from orders (confirmed payments over past 12 months)
      const since = new Date();
      since.setMonth(since.getMonth() - 11);
      since.setDate(1);
      since.setHours(0, 0, 0, 0);

      const { data: orderRows } = await supabase
        .from('orders')
        .select('total_amount, created_at')
        .eq('status', 'confirmed')
        .gte('created_at', since.toISOString());

      // Build 12-month buckets relative to today
      const months: { label: string; value: number }[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        months.push({
          label: d.toLocaleString('default', { month: 'short' }),
          value: 0
        });
      }

      (orderRows || []).forEach((o: any) => {
        const d = new Date(o.created_at);
        const nowD = new Date();
        const monthsAgo = (nowD.getFullYear() - d.getFullYear()) * 12 + (nowD.getMonth() - d.getMonth());
        const idx = 11 - monthsAgo;
        if (idx >= 0 && idx < 12 && months[idx]) {
          months[idx].value += Number(o.total_amount || 0);
        }
      });

      setGraphData(months);
      setIsLoadingFinancials(false);
    };

    loadFinancials();
  }, [activeTab, user]);


  const registryRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize form state
  const [formData, setFormData] = useState({
    name: user?.name || '',
    phone: user?.phone || user?.organization_phone || '',
    business_name: user?.business_name || '',
    id_number: user?.id_number || '',
    bank_name: user?.bank_name || '',
    branch_code: user?.branch_code || '',
    account_number: user?.account_number || '',
    account_holder: user?.account_holder || '',
    account_type: user?.account_type || 'Savings',
    instagram_handle: user?.instagram_handle || '',
    twitter_handle: user?.twitter_handle || '',
    facebook_handle: user?.facebook_handle || '',
    website_url: user?.website_url || ''
  });

  // Stagger animation on tab change
  useEffect(() => {
    if (registryRef.current) {
      gsap.fromTo(".settings-stagger",
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, stagger: 0.05, duration: 0.5, ease: "power2.out" }
      );
    }
  }, [activeTab]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !user) return;
    setIsUploading(true);
    const file = e.target.files[0];
    if (!file) return;

    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id} -${Math.random()}.${fileExt} `;
    const filePath = `${fileName} `;

    try {
      const { error: uploadError } = await supabase.storage
        .from('profile-avatars')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('profile-avatars')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
        .eq('id', user.id);

      if (updateError) throw updateError;

      if (onUpdateProfile) onUpdateProfile({ avatar_url: publicUrl });
      alert("Avatar Updated Successfully.");
    } catch (error: any) {
      alert(error.message || "Failed to upload avatar.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>, fieldName: 'id_proof_url' | 'organization_proof_url' | 'address_proof_url') => {
    if (!e.target.files || e.target.files.length === 0 || !user) return;
    setIsUploading(true);
    const file = e.target.files[0];
    if (!file) { setIsUploading(false); return; }

    const fileExt = file.name.split('.').pop();
    const filePath = `${user.id}/${fieldName}-${Date.now()}.${fileExt}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from('organizer-documents')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('organizer-documents')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ [fieldName]: publicUrl, updated_at: new Date().toISOString() })
        .eq('id', user.id);

      if (updateError) throw updateError;

      if (onUpdateProfile) onUpdateProfile({ [fieldName]: publicUrl });
      alert("Document Uploaded Successfully.");
    } catch (error: any) {
      alert(error.message || "Failed to upload document.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleUpgradeTier = async (newTier: 'pro' | 'premium') => {
    if (!user) return;
    setIsUpdating(true);

    try {
      // PHASE 6 MOCK CHECKOUT START: Uses secure ledger endpoint
      const { data, error } = await supabase.rpc('upgrade_organizer_tier', { p_tier: newTier as any });
      if (error) throw error;

      if (data?.success) {
        if (onUpdateProfile) {
          onUpdateProfile({
            organizer_tier: newTier === 'pro' ? OrganizerTier.PRO : OrganizerTier.PREMIUM
          });
        }
        alert(data.message || `Checkout Success: Upgraded to ${newTier.toUpperCase()}`);
      } else {
        throw new Error(data?.message || 'Checkout failed');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to process sandbox payment');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsUpdating(true);

    try {
      const updates: any = {
        name: formData.name,
        phone: formData.phone,
        instagram_handle: formData.instagram_handle,
        twitter_handle: formData.twitter_handle,
        facebook_handle: formData.facebook_handle,
        website_url: formData.website_url,
        updated_at: new Date().toISOString()
      };

      if (user.role === UserRole.ORGANIZER) {
        updates.business_name = formData.business_name;
        updates.id_number = formData.id_number;
        updates.organization_phone = formData.phone; // Sync phone
        updates.bank_name = formData.bank_name;
        updates.branch_code = formData.branch_code;
        updates.account_number = formData.account_number;
        updates.account_holder = formData.account_holder;
        updates.account_type = formData.account_type;
      }

      const { error } = await supabase.from('profiles').update(updates).eq('id', user.id);
      if (error) throw error;

      // Also update separate organizer_profiles table if needed, though usually profiles is master
      if (user.role === UserRole.ORGANIZER) {
        const { error: orgError } = await supabase.from('organizer_profiles').upsert({
          id: user.id,
          business_name: formData.business_name,
          updated_at: new Date().toISOString()
        });
        if (orgError) console.warn("Org profile sync warning:", orgError);
      }

      if (onUpdateProfile) onUpdateProfile(updates);
      alert("Profile Updated Successfully.");
    } catch (err: any) {
      alert(err.message || "Failed to update profile.");
    } finally {
      setIsUpdating(false);
    }
  };

  const renderVerificationBadge = () => {
    if (!user) return null;

    if (user.role === UserRole.ORGANIZER) {
      switch (user.organizer_status) {
        case 'verified': return <span className="text-green-500 bg-green-500/10 px-3 py-1 rounded-full border border-green-500/20">Verified Organizer</span>;
        case 'pending': return <span className="text-orange-500 bg-orange-500/10 px-3 py-1 rounded-full border border-orange-500/20">Review Pending</span>;
        case 'rejected': return <span className="text-red-500 bg-red-500/10 px-3 py-1 rounded-full border border-red-500/20">Application Rejected</span>;
        case 'needs_update': return <span className="text-blue-500 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20">Action Required</span>;
        default: return <span className="text-zinc-500 bg-zinc-500/10 px-3 py-1 rounded-full border border-zinc-500/20">Unverified</span>;
      }
    }

    if (user.role === UserRole.ADMIN) {
      return <span className="text-purple-500 bg-purple-500/10 px-3 py-1 rounded-full border border-purple-500/20">System Admin</span>;
    }

    // Default: Attendee
    if (user.email_verified) {
      return <span className="text-green-500 bg-green-500/10 px-3 py-1 rounded-full border border-green-500/20">Verified Attendee</span>;
    }
    return <span className="text-zinc-500 bg-zinc-500/10 px-3 py-1 rounded-full border border-zinc-500/20">Auth Verified</span>;
  };

  return (
    <div ref={registryRef} className="px-4 sm:px-6 md:px-12 py-8 sm:py-12 max-w-5xl mx-auto space-y-10 sm:space-y-12 animate-in fade-in duration-700">

      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-8 settings-stagger">
        <div className="space-y-2">
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter themed-text leading-none uppercase">Settings</h1>
          <p className="text-[10px] font-black uppercase tracking-[0.6em] opacity-40 themed-text">Account Control Center</p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-1.5 bg-zinc-100 dark:bg-white/5 p-1.5 rounded-[2rem] border themed-border apple-blur shadow-sm w-full">
          {(['profile', 'appearance', 'financials', 'compliance'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 min-w-[5rem] px-4 sm:px-6 md:px-8 py-3 rounded-full text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === tab ? 'bg-black dark:bg-white text-white dark:text-black shadow-lg scale-105' : 'themed-text opacity-40 hover:opacity-80'}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </header>

      {/* Main Content Area */}
      <div className="min-h-[400px]">

        {/* PROFILE TAB */}
        {activeTab === 'profile' && (
          <div className="space-y-12 settings-stagger">
            <section className="themed-card border themed-border rounded-[2.5rem] sm:rounded-[3rem] p-6 sm:p-10 md:p-16 space-y-10 shadow-2xl relative overflow-hidden group">
              {/* Background Accent */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-zinc-500/5 rounded-full blur-[80px] -mr-32 -mt-32 pointer-events-none" />

              <div className="flex items-center justify-between relative z-10">
                <div className="space-y-1">
                  <h3 className="text-2xl font-black uppercase tracking-tight themed-text">Personal Identity</h3>
                  <p className="text-[10px] font-bold opacity-30 uppercase tracking-[0.2em] themed-text">Managed by Supabase Auth</p>
                  <div className="mt-4">
                    {renderVerificationBadge()}
                  </div>
                </div>

                {/* Avatar Upload */}
                <div className="flex justify-center relative z-10">
                  <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                    <div className={`w-32 h-32 rounded-full border-4 ${user?.avatar_url ? 'border-black dark:border-white' : 'border-dashed border-zinc-300 dark:border-zinc-700'} overflow-hidden flex items-center justify-center transition-all group-hover:scale-105 group-hover:border-black dark:group-hover:border-white bg-zinc-100 dark:bg-white/5`}>
                      {user?.avatar_url ? (
                        <img src={user.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                      ) : (
                        <svg className="w-10 h-10 opacity-20 themed-text" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                      )}
                      {isUploading && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                    </div>
                    <div className="absolute bottom-0 right-0 bg-black dark:bg-white text-white dark:text-black p-2 rounded-full shadow-lg transform scale-90 group-hover:scale-110 transition-transform">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </div>
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                  </div>
                </div>
              </div>

              <form onSubmit={handleUpdate} className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-4 themed-text">Full Name</label>
                  <input
                    className="w-full themed-secondary-bg p-5 rounded-[1.5rem] font-bold themed-text outline-none border themed-border focus:border-black dark:focus:border-white transition-all focus:ring-1 focus:ring-black/5"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-4 themed-text">Email Address</label>
                  <input
                    readOnly
                    className="w-full themed-secondary-bg p-5 rounded-[1.5rem] font-bold themed-text opacity-50 cursor-not-allowed border themed-border"
                    value={user?.email}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-4 themed-text">Phone Number</label>
                  <input
                    className="w-full themed-secondary-bg p-5 rounded-[1.5rem] font-bold themed-text outline-none border themed-border focus:border-black dark:focus:border-white transition-all focus:ring-1 focus:ring-black/5"
                    placeholder="+27..."
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>

                {user?.role === UserRole.ORGANIZER && (
                  <>
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-4 themed-text">Business Name</label>
                      <input
                        className="w-full themed-secondary-bg p-5 rounded-[1.5rem] font-bold themed-text outline-none border themed-border focus:border-black dark:focus:border-white transition-all focus:ring-1 focus:ring-black/5"
                        value={formData.business_name}
                        onChange={e => setFormData({ ...formData, business_name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-4 themed-text">SA ID Number</label>
                      <input
                        className="w-full themed-secondary-bg p-5 rounded-[1.5rem] font-bold themed-text outline-none border themed-border focus:border-black dark:focus:border-white transition-all focus:ring-1 focus:ring-black/5"
                        placeholder="13 Digits"
                        value={formData.id_number}
                        onChange={e => setFormData({ ...formData, id_number: e.target.value })}
                        maxLength={13}
                      />
                      <p className="text-[8px] opacity-30 mt-2 ml-4 uppercase tracking-wider font-bold themed-text">Required for KYC & Payouts</p>
                    </div>

                    {/* Verification Documents Upload Section */}
                    <div className="md:col-span-2 pt-8 border-t themed-border space-y-6">
                      <div className="space-y-1">
                        <h4 className="text-lg font-black uppercase tracking-tight themed-text">Verification Documents</h4>
                        <p className="text-[10px] font-bold opacity-30 uppercase tracking-[0.2em] themed-text">Upload secure PDFs for KYC</p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* ID Document */}
                        <div className="space-y-3">
                          <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-2 themed-text">Owner ID Document</label>
                          <div className={`p-6 border-2 border-dashed rounded-[1.5rem] flex flex-col items-center justify-center gap-3 text-center transition-all ${user?.id_proof_url ? 'border-green-500/50 bg-green-500/5' : 'border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 hover:border-black dark:hover:border-white'}`}>
                            {user?.id_proof_url ? (
                              <div className="text-green-500">
                                <svg className="w-8 h-8 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                <span className="text-[10px] font-bold uppercase tracking-widest mt-2 block">Uploaded</span>
                              </div>
                            ) : (
                              <>
                                <svg className="w-8 h-8 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                <button type="button" onClick={() => {
                                  const input = document.createElement('input');
                                  input.type = 'file';
                                  input.accept = 'application/pdf,image/*';
                                  input.onchange = (e: any) => handleDocumentUpload(e, 'id_proof_url');
                                  input.click();
                                }} className="text-[10px] font-black uppercase tracking-widest underline opacity-60 hover:opacity-100">Browse Files</button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Company Registration */}
                        <div className="space-y-3">
                          <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-2 themed-text">Company Reg Document</label>
                          <div className={`p-6 border-2 border-dashed rounded-[1.5rem] flex flex-col items-center justify-center gap-3 text-center transition-all ${user?.organization_proof_url ? 'border-green-500/50 bg-green-500/5' : 'border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 hover:border-black dark:hover:border-white'}`}>
                            {user?.organization_proof_url ? (
                              <div className="text-green-500">
                                <svg className="w-8 h-8 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                <span className="text-[10px] font-bold uppercase tracking-widest mt-2 block">Uploaded</span>
                              </div>
                            ) : (
                              <>
                                <svg className="w-8 h-8 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                                <button type="button" onClick={() => {
                                  const input = document.createElement('input');
                                  input.type = 'file';
                                  input.accept = 'application/pdf,image/*';
                                  input.onchange = (e: any) => handleDocumentUpload(e, 'organization_proof_url');
                                  input.click();
                                }} className="text-[10px] font-black uppercase tracking-widest underline opacity-60 hover:opacity-100">Upload CIPC</button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Proof of Address */}
                        <div className="space-y-3">
                          <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-2 themed-text">Proof of Address</label>
                          <div className={`p-6 border-2 border-dashed rounded-[1.5rem] flex flex-col items-center justify-center gap-3 text-center transition-all ${user?.address_proof_url ? 'border-green-500/50 bg-green-500/5' : 'border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 hover:border-black dark:hover:border-white'}`}>
                            {user?.address_proof_url ? (
                              <div className="text-green-500">
                                <svg className="w-8 h-8 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                <span className="text-[10px] font-bold uppercase tracking-widest mt-2 block">Uploaded</span>
                              </div>
                            ) : (
                              <>
                                <svg className="w-8 h-8 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                                <button type="button" onClick={() => {
                                  const input = document.createElement('input');
                                  input.type = 'file';
                                  input.accept = 'application/pdf,image/*';
                                  input.onchange = (e: any) => handleDocumentUpload(e, 'address_proof_url');
                                  input.click();
                                }} className="text-[10px] font-black uppercase tracking-widest underline opacity-60 hover:opacity-100">Recent Utility Bill</button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* Social Media Links */}
                <div className="md:col-span-2 pt-8 border-t themed-border">
                  <h4 className="text-lg font-black uppercase tracking-tight themed-text mb-6">Social Connections</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-4 themed-text">Instagram</label>
                      <input
                        className="w-full themed-secondary-bg p-5 rounded-[1.5rem] font-bold themed-text outline-none border themed-border focus:border-black dark:focus:border-white transition-all"
                        placeholder="@username"
                        value={formData.instagram_handle}
                        onChange={e => setFormData({ ...formData, instagram_handle: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-4 themed-text">Twitter / X</label>
                      <input
                        className="w-full themed-secondary-bg p-5 rounded-[1.5rem] font-bold themed-text outline-none border themed-border focus:border-black dark:focus:border-white transition-all"
                        placeholder="@username"
                        value={formData.twitter_handle}
                        onChange={e => setFormData({ ...formData, twitter_handle: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-4 themed-text">Facebook</label>
                      <input
                        className="w-full themed-secondary-bg p-5 rounded-[1.5rem] font-bold themed-text outline-none border themed-border focus:border-black dark:focus:border-white transition-all"
                        placeholder="page.name"
                        value={formData.facebook_handle}
                        onChange={e => setFormData({ ...formData, facebook_handle: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-4 themed-text">Website</label>
                      <input
                        className="w-full themed-secondary-bg p-5 rounded-[1.5rem] font-bold themed-text outline-none border themed-border focus:border-black dark:focus:border-white transition-all"
                        placeholder="https://..."
                        value={formData.website_url}
                        onChange={e => setFormData({ ...formData, website_url: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2 pt-4">
                  <button type="submit" disabled={isUpdating} className="w-full py-6 bg-black dark:bg-white text-white dark:text-black rounded-[2rem] font-black text-xs uppercase tracking-[0.4em] shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-4 hover:shadow-2xl">
                    {isUpdating ? <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" /> : (
                      <>
                        <span>Save Changes</span>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )
        }

        {/* APPEARANCE TAB */}
        {
          activeTab === 'appearance' && (
            <div className="space-y-12 settings-stagger">
              <section className="themed-card border themed-border rounded-[3rem] p-8 md:p-12 space-y-10 shadow-xl">
                <div className="space-y-1">
                  <h3 className="text-2xl font-black uppercase tracking-tight themed-text">Visual Interface</h3>
                  <p className="text-[10px] font-bold opacity-30 uppercase tracking-[0.2em] themed-text">Customize your experience</p>
                </div>

                <div className="grid grid-cols-3 gap-3 md:gap-6">
                  {(['light', 'dark', 'matte-black'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => onThemeChange(t)}
                      className={`p-4 md:p-8 rounded-[2rem] md:rounded-[2.5rem] border-2 flex flex-col items-center gap-3 md:gap-6 transition-all duration-300 shadow-md group ${theme === t ? 'border-black dark:border-white themed-card scale-[1.03] ring-1 ring-black/5 dark:ring-white/10' : 'themed-border themed-secondary-bg opacity-50 hover:opacity-100 hover:scale-[1.01]'}`}
                    >
                      <div className={`w-10 h-10 md:w-16 md:h-16 rounded-xl md:rounded-2xl border-2 themed-border shadow-lg transform group-hover:rotate-3 transition-transform ${t === 'light' ? 'bg-white' : t === 'dark' ? 'bg-zinc-800' : 'bg-black'}`} />
                      <span className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] themed-text text-center">{t.replace('-', ' ')}</span>
                      {theme === t && <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-lg shadow-green-500/50" />}
                    </button>
                  ))}
                </div>
              </section>

              {/* Accessibility Section */}
              <section className="themed-card border themed-border rounded-[3rem] p-12 space-y-10 shadow-xl">
                <div className="space-y-1">
                  <h3 className="text-2xl font-black uppercase tracking-tight themed-text">Accessibility</h3>
                  <p className="text-[10px] font-bold opacity-30 uppercase tracking-[0.2em] themed-text">Interface Adaptations</p>
                </div>

                <div className="space-y-6">
                  {[
                    { key: 'reducedMotion', label: 'Reduced Motion', desc: 'Disable UI animations' },
                    { key: 'highContrast', label: 'High Contrast', desc: 'Increase visual distinction' },
                    { key: 'largeText', label: 'Larger Text', desc: 'Scale up typography' }
                  ].map((item) => (
                    <div key={item.key} className="flex items-center justify-between p-6 rounded-[2rem] themed-secondary-bg border themed-border">
                      <div className="space-y-1">
                        <h4 className="text-sm font-black uppercase tracking-wider themed-text">{item.label}</h4>
                        <p className="text-[9px] font-bold opacity-40 uppercase tracking-widest themed-text">{item.desc}</p>
                      </div>
                      <button
                        onClick={() => onToggleAccessibility?.(item.key)}
                        className={`w-14 h-8 rounded-full p-1 transition-colors duration-300 ${accessibility?.[item.key as keyof typeof accessibility] ? 'bg-green-500' : 'bg-zinc-300 dark:bg-zinc-700'}`}
                      >
                        <div className={`w-6 h-6 bg-white rounded-full shadow-md transform transition-transform duration-300 ${accessibility?.[item.key as keyof typeof accessibility] ? 'translate-x-6' : 'translate-x-0'}`} />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )
        }

        {/* FINANCIALS TAB */}
        {
          activeTab === 'financials' && (
            <div className="space-y-12 settings-stagger">

              {/* Live Activity Graph */}
              <section className="themed-card border themed-border rounded-[3rem] p-8 md:p-12 shadow-2xl relative overflow-hidden">
                {isLoadingFinancials ? (
                  <div className="h-64 flex items-end justify-between gap-2 animate-pulse">
                    {Array(12).fill(0).map((_, i) => (
                      <div key={i} className="flex-1 flex flex-col justify-end gap-2">
                        <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-t-lg" style={{ height: `${20 + Math.random() * 60}%` }} />
                        <div className="h-3 bg-zinc-100 dark:bg-zinc-800 rounded mx-auto w-4" />
                      </div>
                    ))}
                  </div>
                ) : (() => {
                  const totalRevenue = graphData.reduce((a, b) => a + b.value, 0);
                  const thisMonth = graphData[11]?.value || 0;
                  const lastMonth = graphData[10]?.value || 0;
                  const momPct = lastMonth === 0 ? null : ((thisMonth - lastMonth) / lastMonth) * 100;
                  const maxVal = Math.max(...graphData.map(d => d.value), 1);
                  return (
                    <>
                      <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 relative z-10">
                        <div className="space-y-1">
                          <h3 className="text-2xl font-black uppercase tracking-tight themed-text">Revenue Overview</h3>
                          <p className="text-[10px] font-black uppercase tracking-widest themed-text opacity-40">Revenue Growth ({['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][new Date().getMonth()]!})</p>
                        </div>
                        <div className="text-left sm:text-right">
                          <p className="text-3xl font-black themed-text tracking-tighter">R {totalRevenue.toLocaleString('en-ZA', { minimumFractionDigits: 0 })}</p>
                          {momPct !== null ? (
                            <p className={`text-[9px] font-bold uppercase tracking-widest ${momPct >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                              {momPct >= 0 ? '+' : ''}{momPct.toFixed(1)}% vs last month
                            </p>
                          ) : (
                            <p className="text-[9px] font-bold opacity-30 uppercase tracking-widest themed-text">No prior month data</p>
                          )}
                        </div>
                      </div>
                      <div className="h-48 sm:h-64 flex items-end justify-between gap-1 sm:gap-2 relative z-10">
                        {graphData.map((item, index) => (
                          <div key={index} className="flex-1 flex flex-col justify-end gap-1 sm:gap-2 group cursor-pointer">
                            <div
                              className="w-full bg-black/10 dark:bg-white/10 rounded-t-lg relative overflow-hidden transition-all duration-300 group-hover:bg-black/20 dark:group-hover:bg-white/20 min-h-[2px]"
                              style={{ height: `${(item.value / maxVal) * 100}%` }}
                            >
                              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent dark:from-white/20" />
                            </div>
                            <span className="text-[8px] sm:text-[9px] font-bold opacity-30 uppercase text-center themed-text group-hover:opacity-100">{item.label}</span>
                          </div>
                        ))}
                      </div>
                      {totalRevenue === 0 && (
                        <p className="text-center text-xs font-bold opacity-30 themed-text mt-6 uppercase tracking-widest">No confirmed order revenue yet — sell some tickets to see data here.</p>
                      )}
                    </>
                  );
                })()}
              </section>

              {/* Payout History & Deductions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Payouts */}
                <section className="themed-card border themed-border rounded-[3rem] p-8 space-y-6 shadow-xl relative overflow-hidden">
                  <div className="space-y-1">
                    <h3 className="text-xl font-black uppercase tracking-tight themed-text">Payout History</h3>
                    <p className="text-[10px] font-bold opacity-30 uppercase tracking-[0.2em] themed-text">Recent Transfers</p>
                  </div>
                  <div className="space-y-4">
                    {isLoadingFinancials ? (
                      <div className="space-y-3 animate-pulse">
                        {[1, 2, 3].map(i => <div key={i} className="h-14 rounded-3xl bg-zinc-100 dark:bg-zinc-800" />)}
                      </div>
                    ) : payouts.length === 0 ? (
                      <p className="text-center text-xs font-bold opacity-30 themed-text py-8 uppercase tracking-widest">No payouts yet.</p>
                    ) : payouts.map(payout => (
                      <div key={payout.id} className="flex items-center justify-between p-4 rounded-3xl themed-secondary-bg border themed-border">
                        <div className="space-y-1">
                          <p className="text-sm font-bold themed-text">R {Number(payout.amount).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</p>
                          <p className="text-[9px] font-bold opacity-40 uppercase tracking-widest themed-text">{payout.bank_reference || `YIL-PO-${payout.id.slice(-6).toUpperCase()}`}</p>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-wider ${payout.status === 'paid' ? 'bg-green-500/10 text-green-500' :
                          payout.status === 'failed' ? 'bg-red-500/10 text-red-500' :
                            payout.status === 'processing' ? 'bg-blue-500/10 text-blue-500' :
                              'bg-yellow-500/10 text-yellow-500'
                          }`}>
                          {payout.status}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Subscription Plans */}
                <section className="themed-card border themed-border rounded-[3rem] p-8 md:p-12 space-y-10 shadow-xl relative overflow-hidden md:col-span-2">
                  <div className="space-y-1">
                    <h3 className="text-2xl font-black uppercase tracking-tight themed-text">Subscription Plans</h3>
                    <p className="text-[10px] font-bold opacity-30 uppercase tracking-[0.2em] themed-text">Upgrade your organizer limits</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Starter / Free */}
                    <div className={`p-8 rounded-[2rem] border-2 flex flex-col justify-between gap-6 transition-all ${user?.organizer_tier === 'free' || !user?.organizer_tier ? 'border-black dark:border-white shadow-xl scale-[1.02]' : 'themed-border themed-secondary-bg hover:border-black/50 dark:hover:border-white/50'}`}>
                      <div className="space-y-4">
                        <div className="w-12 h-12 rounded-full bg-zinc-200 dark:bg-white/10 flex items-center justify-center">
                          <Sprout className="w-6 h-6 text-zinc-600 dark:text-zinc-400" />
                        </div>
                        <div>
                          <h4 className="text-lg font-black uppercase tracking-tight themed-text">Starter</h4>
                          <p className="text-3xl font-black themed-text mt-2">Free</p>
                        </div>
                        <ul className="space-y-3 pt-4 border-t themed-border text-xs font-bold themed-text opacity-70">
                          <li className="flex gap-2"><span>•</span> Up to 5 Live Events</li>
                          <li className="flex gap-2"><span>•</span> 1,000 Tickets Total limit</li>
                          <li className="flex gap-2"><span>•</span> Standard Platform Fee</li>
                          <li className="flex gap-2"><span>•</span> Basic Insights</li>
                        </ul>
                      </div>
                      {(user?.organizer_tier === 'free' || !user?.organizer_tier) ? (
                        <div className="w-full py-4 bg-zinc-200 dark:bg-white/10 text-black dark:text-white rounded-full font-black text-[10px] uppercase tracking-widest text-center">Current Plan</div>
                      ) : (
                        <button disabled className="w-full py-4 border-2 border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-400 rounded-full font-black text-[10px] uppercase tracking-widest text-center">Downgrade Unavailable</button>
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
                        <ul className="space-y-3 pt-4 border-t themed-border text-xs font-bold themed-text opacity-70">
                          <li className="flex gap-2"><span className="text-purple-500">•</span> Up to 25 Live Events</li>
                          <li className="flex gap-2"><span className="text-purple-500">•</span> 10,000 Tickets limit</li>
                          <li className="flex gap-2"><span className="text-purple-500">•</span> Reduced Platform Fee</li>
                          <li className="flex gap-2"><span className="text-purple-500">•</span> Advanced AI Insights</li>
                          <li className="flex gap-2"><span className="text-purple-500">•</span> Priority Support</li>
                        </ul>
                      </div>
                      {user?.organizer_tier === 'pro' ? (
                        <div className="w-full py-4 bg-purple-500 text-white rounded-full font-black text-[10px] uppercase tracking-widest text-center shadow-lg shadow-purple-500/30">Current Plan</div>
                      ) : (
                        <button
                          onClick={() => handleUpgradeTier('pro')}
                          disabled={isUpdating || user?.organizer_tier === 'premium'}
                          className="w-full py-4 bg-black dark:bg-white text-white dark:text-black rounded-full font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all shadow-xl disabled:opacity-50"
                        >
                          {isUpdating ? '...' : user?.organizer_tier === 'premium' ? 'Current Plan Higher' : 'Upgrade to Pro'}
                        </button>
                      )}
                    </div>

                    {/* PREMIUM */}
                    <div className={`p-8 rounded-[2rem] border-2 flex flex-col justify-between gap-6 transition-all ${user?.organizer_tier === 'premium' ? 'border-amber-500 shadow-xl scale-[1.02] shadow-amber-500/20' : 'border-amber-500/30 themed-secondary-bg hover:border-amber-500'}`}>
                      <div className="space-y-4">
                        <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center">
                          <Crown className="w-6 h-6" />
                        </div>
                        <div>
                          <h4 className="text-lg font-black uppercase tracking-tight themed-text">Premium</h4>
                          <p className="text-3xl font-black themed-text mt-2">R 119<span className="text-xs opacity-50 font-medium">/mo</span></p>
                        </div>
                        <ul className="space-y-3 pt-4 border-t themed-border text-xs font-bold themed-text opacity-70">
                          <li className="flex gap-2"><span className="text-amber-500">•</span> Unlimited Events</li>
                          <li className="flex gap-2"><span className="text-amber-500">•</span> Unlimited Tickets</li>
                          <li className="flex gap-2"><span className="text-amber-500">•</span> Custom Platform Fee</li>
                          <li className="flex gap-2"><span className="text-amber-500">•</span> Custom Domain Support</li>
                          <li className="flex gap-2"><span className="text-amber-500">•</span> Dedicated Account Manager</li>
                        </ul>
                      </div>
                      {user?.organizer_tier === 'premium' ? (
                        <div className="w-full py-4 bg-amber-500 text-white rounded-full font-black text-[10px] uppercase tracking-widest text-center shadow-lg shadow-amber-500/30">Current Plan</div>
                      ) : (
                        <button
                          onClick={() => handleUpgradeTier('premium')}
                          disabled={isUpdating}
                          className="w-full py-4 bg-black dark:bg-white text-white dark:text-black rounded-full font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all shadow-xl disabled:opacity-50"
                        >
                          {isUpdating ? '...' : 'Upgrade to Premium'}
                        </button>
                      )}
                    </div>
                  </div>
                </section>
              </div>

              {/* Collapsible Banking Details */}
              <section className="themed-card border themed-border rounded-[3rem] p-8 md:p-12 shadow-2xl relative overflow-hidden transition-all">
                <div className="flex justify-between items-center cursor-pointer" onClick={() => setBankingOpen(!bankingOpen)}>
                  <div className="space-y-1 relative z-10">
                    <h3 className="text-2xl font-black uppercase tracking-tight themed-text">Banking Details</h3>
                    <p className="text-[10px] font-bold opacity-30 uppercase tracking-[0.2em] themed-text">Secure Payout Information</p>
                  </div>
                  <div className={`p-4 rounded-full themed-secondary-bg transition-transform duration-300 ${bankingOpen ? 'rotate-180' : ''}`}>
                    <svg className="w-5 h-5 themed-text" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </div>

                {bankingOpen && (
                  <div className="mt-8 animate-in fade-in slide-in-from-top-4 duration-300">
                    <form onSubmit={handleUpdate} className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-4 themed-text">Bank Name</label>
                        <input className="w-full themed-secondary-bg p-5 rounded-[1.5rem] font-bold themed-text outline-none border themed-border focus:border-black dark:focus:border-white transition-all" placeholder="e.g. FNB" value={formData.bank_name} onChange={e => setFormData({ ...formData, bank_name: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-4 themed-text">Branch Code</label>
                        <input className="w-full themed-secondary-bg p-5 rounded-[1.5rem] font-bold themed-text outline-none border themed-border focus:border-black dark:focus:border-white transition-all" placeholder="Universal or Specific" value={formData.branch_code} onChange={e => setFormData({ ...formData, branch_code: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-4 themed-text">Account Number</label>
                        <input className="w-full themed-secondary-bg p-5 rounded-[1.5rem] font-bold themed-text outline-none border themed-border focus:border-black dark:focus:border-white transition-all" placeholder="Account Number" value={formData.account_number} onChange={e => setFormData({ ...formData, account_number: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-4 themed-text">Account Type</label>
                        <select
                          className="w-full themed-secondary-bg p-5 rounded-[1.5rem] font-bold themed-text outline-none border themed-border focus:border-black dark:focus:border-white transition-all appearance-none"
                          value={formData.account_type}
                          onChange={e => setFormData({ ...formData, account_type: e.target.value })}
                        >
                          <option value="Savings">Savings</option>
                          <option value="Cheque">Cheque / Current</option>
                          <option value="Transmission">Transmission</option>
                          <option value="Bond">Bond</option>
                        </select>
                      </div>
                      <div className="md:col-span-2 space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-4 themed-text">Account Holder</label>
                        <input className="w-full themed-secondary-bg p-5 rounded-[1.5rem] font-bold themed-text outline-none border themed-border focus:border-black dark:focus:border-white transition-all" placeholder="Account Holder Name" value={formData.account_holder} onChange={e => setFormData({ ...formData, account_holder: e.target.value })} />
                      </div>
                      <button type="submit" disabled={isUpdating} className="md:col-span-2 py-6 border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-black dark:hover:border-white rounded-[2rem] font-black text-xs uppercase tracking-[0.4em] themed-text transition-all hover:bg-zinc-50 dark:hover:bg-white/5">
                        {isUpdating ? "Saving..." : "Update Banking Info"}
                      </button>
                    </form>
                  </div>
                )}
              </section>
            </div>
          )
        }

        {/* COMPLIANCE TAB */}
        {
          activeTab === 'compliance' && (
            <div className="space-y-12 settings-stagger">
              <section className="themed-card border themed-border rounded-[3rem] p-12 space-y-10 shadow-xl">
                <div className="space-y-1">
                  <h3 className="text-2xl font-black uppercase tracking-tight themed-text">Legal & Compliance</h3>
                  <p className="text-[10px] font-bold opacity-30 uppercase tracking-[0.2em] themed-text">Policies & Agreements</p>
                </div>

                <div className="space-y-4">
                  {[
                    { title: 'Terms of Service', date: 'Last updated: Jan 2026', type: 'Required' },
                    { title: 'Privacy Policy', date: 'Last updated: Jan 2026', type: 'Required' },
                    { title: 'Organizer Agreement', date: 'Signed: Feb 2026', type: 'Signed' },
                    { title: 'Tax Compliance (SARS)', date: 'Submitted', type: 'Verified' },
                  ].map((doc, i) => (
                    <div key={i} className="flex items-center justify-between p-6 rounded-[2rem] themed-secondary-bg border themed-border group hover:border-black dark:hover:border-white transition-colors cursor-pointer">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-zinc-200 dark:bg-white/5 rounded-2xl">
                          <svg className="w-6 h-6 themed-text" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        </div>
                        <div>
                          <h4 className="text-sm font-black uppercase tracking-wider themed-text group-hover:underline">{doc.title}</h4>
                          <p className="text-[9px] font-bold opacity-40 uppercase tracking-widest themed-text">{doc.date}</p>
                        </div>
                      </div>
                      <div className={`px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-wider ${doc.type === 'Verified' || doc.type === 'Signed' ? 'bg-green-500/10 text-green-500' : 'bg-zinc-500/10 themed-text'}`}>
                        {doc.type}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )
        }

      </div >

      {/* Footer / Account Actions */}
      < footer className="pt-12 border-t themed-border text-center space-y-8 settings-stagger" >
        <button onClick={onLogout} className="group relative px-8 py-3 rounded-full overflow-hidden transition-all hover:scale-105 active:scale-95">
          <div className="absolute inset-0 bg-red-500 opacity-0 group-hover:opacity-10 transition-opacity" />
          <span className="text-[10px] font-black uppercase tracking-[0.5em] text-red-500">Sign Out</span>
        </button>
        <p className="text-[8px] font-bold opacity-20 uppercase tracking-[0.3em] themed-text">Yilama Secure Architecture v3.0.1</p>
      </footer >
    </div >
  );
};