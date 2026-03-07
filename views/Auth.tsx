import React, { useState, useEffect, useRef } from 'react';
import { UserRole, Profile, OrganizerTier } from '../types';
import { supabase } from '../lib/supabase';
import { signUpSchema, signInSchema } from '../lib/validation';
import { gsap } from 'gsap';
import { LegalModal } from '../components/LegalModal';
import { TERMS_OF_USE, PRIVACY_POLICY, ORGANIZER_AGREEMENT } from '../lib/legalContent';

interface AuthProps {
  onLogin: (profile: Profile) => void;
}

type AuthMode = 'signin' | 'signup' | 'forgot-password';

export const AuthView: React.FC<AuthProps> = ({ onLogin }) => {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [attemptCount, setAttemptCount] = useState(0);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  const formRef = useRef<HTMLDivElement>(null);
  const visualRef = useRef<HTMLDivElement>(null);

  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>(UserRole.USER); // Toggle: User vs Organizer
  // Extended Fields (Organizer)
  const [phone, setPhone] = useState('');
  const [businessName, setBusinessName] = useState('');

  // Legal
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [acceptedOrganizerAgreement, setAcceptedOrganizerAgreement] = useState(false);
  const [legalModal, setLegalModal] = useState<{ title: string; content: string } | null>(null);

  useEffect(() => {
    // Entrance Animation
    if (formRef.current && visualRef.current) {
      gsap.fromTo(formRef.current,
        { opacity: 0, x: 20 },
        { opacity: 1, x: 0, duration: 0.8, ease: "power3.out", delay: 0.2 }
      );
      gsap.fromTo(visualRef.current,
        { opacity: 0, scale: 0.95 },
        { opacity: 1, scale: 1, duration: 1, ease: "power3.out" }
      );
    }
  }, [mode]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cooldownSeconds > 0) return;
    setError(null);
    setLoading(true);

    try {
      if (mode === 'signup') {
        if (!acceptedPrivacy) throw new Error('Please accept the Privacy Policy');
        if (role === UserRole.ORGANIZER && !acceptedOrganizerAgreement) throw new Error('Please accept the Organizer Agreement');

        // Zod schema validation
        const parsed = signUpSchema.safeParse({
          fullName: name, email, password, confirmPassword,
          phone: phone || undefined,
          businessName: businessName || undefined,
        });
        if (!parsed.success) {
          const firstError = parsed.error.errors[0];
          throw new Error(firstError?.message || 'Validation failed');
        }

        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: name,
              role: role,
              phone: phone,
              // Organizer specific
              business_name: role === UserRole.ORGANIZER ? businessName : undefined,
              organizer_tier: role === UserRole.ORGANIZER ? OrganizerTier.FREE : undefined,
              organization_phone: role === UserRole.ORGANIZER ? phone : undefined
            }
          }
        });

        if (signUpError) throw signUpError;

        if (data.user && !data.session) {
          setSuccessMsg("Check your email for the confirmation link!");
          setMode('signin');
        } else if (data.session) {
          // Auto-login if confirmation not required (Dev mode)
          // We need to fetch the profile to ensure triggers ran
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', data.user!.id)
            .maybeSingle();

          if (profileError) {
            console.error("Profile fetch error:", profileError);
          }
          if (!profile) {
            throw new Error("Ghost User Detected: Your Auth account was created, but the Profile trigger failed. Please delete this user in your Supabase Auth Dashboard and sign up again.");
          }
          if (profile) onLogin(profile as Profile);
        }
      } else if (mode === 'signin') {
        console.log(`[AUTH_AUDIT] Attempting sign-in for ${email}...`);
        // Zod validation for signin
        const result = signInSchema.safeParse({ email, password });
        if (!result.success) {
          const firstError = result.error.errors[0]?.message || 'Validation failed';
          setError(firstError);
          setLoading(false);
          return;
        }

        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (signInError) {
          console.warn("[AUTH_AUDIT] Sign-in error:", signInError);
          const newCount = attemptCount + 1;
          setAttemptCount(newCount);
          if (newCount >= 3) {
            let secs = 30;
            setCooldownSeconds(secs);
            const interval = setInterval(() => {
              secs -= 1;
              setCooldownSeconds(secs);
              if (secs <= 0) { clearInterval(interval); setAttemptCount(0); }
            }, 1000);
          }
          throw signInError;
        }

        if (data.user) {
          console.log(`[AUTH_AUDIT] Sign-in successful for ${data.user.id}. Fetching profile with retries...`);

          let profile: Profile | null = null;
          let lastError: any = null;
          const maxRetries = 3;

          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
              console.log(`[AUTH_AUDIT] Profile fetch attempt ${attempt}/${maxRetries}...`);

              const profilePromise = (async () => {
                // 1. Try view first (security definer view)
                const { data: p, error: viewError } = await supabase
                  .from('v_composite_profiles')
                  .select('*')
                  .eq('id', data.user!.id)
                  .maybeSingle();

                if (viewError) {
                  console.error(`[AUTH_AUDIT] View fetch error (attempt ${attempt}):`, viewError);
                  throw viewError;
                }
                if (p) return p;

                // 2. Fallback to basic profiles table if view returns nothing
                console.warn(`[AUTH_AUDIT] View returned nothing. Falling back to profiles table (attempt ${attempt})...`);
                const { data: bp, error: tableError } = await supabase
                  .from('profiles')
                  .select('*')
                  .eq('id', data.user!.id)
                  .maybeSingle();

                if (tableError) {
                  console.error(`[AUTH_AUDIT] Table fetch error (attempt ${attempt}):`, tableError);
                  throw tableError;
                }
                return bp;
              })();

              const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Profile query timed out")), 4000)
              );

              profile = await Promise.race([profilePromise, timeoutPromise]) as Profile | null;

              if (profile) {
                console.log(`[AUTH_AUDIT] Profile found on attempt ${attempt}.`);
                break;
              }
            } catch (err: any) {
              lastError = err;
              console.error(`[AUTH_AUDIT] Attempt ${attempt} failed:`, err.message);
            }

            if (attempt < maxRetries) {
              console.log(`[AUTH_AUDIT] Retrying in 1s...`);
              await new Promise(r => setTimeout(r, 1000));
            }
          }

          if (!profile) {
            console.error("[AUTH_AUDIT] Profile not found after retries or permanent error.", lastError);
            const diagnostics = lastError ? ` Details: ${lastError.message || JSON.stringify(lastError)}` : "";
            throw new Error(`Ghost User Detected: Your Auth account exists, but your Profile is missing.${diagnostics}`);
          }
          console.log("[AUTH_AUDIT] Profile retrieved. Calling onLogin...");
          onLogin(profile as Profile);
        }
      } else if (mode === 'forgot-password') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + '/reset-password',
        });
        if (error) throw error;
        setSuccessMsg("Password reset email sent!");
        setMode('signin');
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-white dark:bg-black text-black dark:text-white overflow-hidden">

      {/* LEFT: Visual / Brand (Hidden on Mobile) */}
      <div ref={visualRef} className="hidden lg:flex w-1/2 bg-zinc-100 dark:bg-zinc-900 relative items-center justify-center p-12 overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1492684223066-81342ee5ff30?q=80&w=2940&auto=format&fit=crop')] bg-cover bg-center opacity-40 mix-blend-overlay" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

        <div className="relative z-10 max-w-lg space-y-8">
          <h1 className="text-7xl font-black tracking-tighter leading-none text-black dark:text-white relative">
            THE<br />EVENT<br />STANDARD.
            <span className="absolute -top-6 left-0 text-[10px] font-black uppercase tracking-[0.4em] opacity-20">Production Beta</span>
          </h1>
          <p className="text-xl font-medium opacity-60 max-w-md">
            Join the platform redefining live experiences using secure, blockchain-verified ticketing.
          </p>
          <div className="flex gap-4">
            <div className="px-4 py-2 bg-white/10 backdrop-blur-md rounded-full border border-white/20 text-xs font-bold uppercase tracking-widest text-black dark:text-white">
              Secure
            </div>
            <div className="px-4 py-2 bg-white/10 backdrop-blur-md rounded-full border border-white/20 text-xs font-bold uppercase tracking-widest text-black dark:text-white">
              Instant
            </div>
            <div className="px-4 py-2 bg-white/10 backdrop-blur-md rounded-full border border-white/20 text-xs font-bold uppercase tracking-widest text-black dark:text-white">
              Verified
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT: Auth Form */}
      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-8 relative">
        <div ref={formRef} className="w-full max-w-md space-y-10">

          {/* Header */}
          <div className="space-y-2 text-center lg:text-left">
            <h2 className="text-4xl font-black tracking-tight">
              {mode === 'signin' ? 'Welcome Back' : mode === 'signup' ? 'Create Account' : 'Reset Password'}
            </h2>
            <p className="text-zinc-500 font-medium">
              {mode === 'signin' ? 'Enter your credentials to access your dashboard.' : mode === 'signup' ? 'Start your journey as an attendee or organizer.' : 'We\'ll send you a link to reset it.'}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleAuth} className="space-y-6">

            {mode === 'signup' && (
              <div className="flex p-1 bg-zinc-100 dark:bg-zinc-900 rounded-2xl mb-8">
                <button
                  type="button"
                  onClick={() => setRole(UserRole.USER)}
                  className={`flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${role === UserRole.USER ? 'bg-white dark:bg-zinc-800 shadow-sm' : 'opacity-40 hover:opacity-100'}`}
                >
                  Attendee
                </button>
                <button
                  type="button"
                  onClick={() => setRole(UserRole.ORGANIZER)}
                  className={`flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${role === UserRole.ORGANIZER ? 'bg-white dark:bg-zinc-800 shadow-sm' : 'opacity-40 hover:opacity-100'}`}
                >
                  Organizer
                </button>
              </div>
            )}

            <div className="space-y-4">
              {mode === 'signup' && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Full Name</label>
                  <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full bg-transparent border-b border-zinc-200 dark:border-zinc-800 py-3 text-lg font-bold outline-none focus:border-black dark:focus:border-white transition-colors"
                    placeholder="John Doe"
                  />
                </div>
              )}

              {/* Organizer Extra Fields */}
              {mode === 'signup' && role === UserRole.ORGANIZER && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Business Name</label>
                    <input
                      value={businessName}
                      onChange={e => setBusinessName(e.target.value)}
                      className="w-full bg-transparent border-b border-zinc-200 dark:border-zinc-800 py-3 text-lg font-bold outline-none focus:border-black dark:focus:border-white transition-colors"
                      placeholder="Yilama Events"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Phone</label>
                    <input
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      className="w-full bg-transparent border-b border-zinc-200 dark:border-zinc-800 py-3 text-lg font-bold outline-none focus:border-black dark:focus:border-white transition-colors"
                      placeholder="+27..."
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full bg-transparent border-b border-zinc-200 dark:border-zinc-800 py-3 text-lg font-bold outline-none focus:border-black dark:focus:border-white transition-colors"
                  placeholder="you@domain.com"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full bg-transparent border-b border-zinc-200 dark:border-zinc-800 py-3 pr-10 text-lg font-bold outline-none focus:border-black dark:focus:border-white transition-colors"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    className="absolute right-0 top-1/2 -translate-y-1/2 p-2 text-zinc-400 hover:text-black dark:hover:text-white transition-colors"
                  >
                    {showPassword ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    )}
                  </button>
                </div>
              </div>

              {mode === 'signup' && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                  <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Confirm Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      className="w-full bg-transparent border-b border-zinc-200 dark:border-zinc-800 py-3 pr-10 text-lg font-bold outline-none focus:border-black dark:focus:border-white transition-colors"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                      className="absolute right-0 top-1/2 -translate-y-1/2 p-2 text-zinc-400 hover:text-black dark:hover:text-white transition-colors"
                    >
                      {showPassword ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Legal Section */}
            {mode === 'signup' && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={acceptedPrivacy}
                    onChange={(e) => setAcceptedPrivacy(e.target.checked)}
                    className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 accent-black dark:accent-white"
                  />
                  <span className="text-xs text-zinc-500 font-medium">
                    I accept the <button type="button" onClick={() => setLegalModal({ title: 'Privacy Policy', content: PRIVACY_POLICY })} className="underline hover:text-black dark:hover:text-white">Privacy Policy</button> & <button type="button" onClick={() => setLegalModal({ title: 'Terms', content: TERMS_OF_USE })} className="underline hover:text-black dark:hover:text-white">Terms of Use</button>
                  </span>
                </div>

                {role === UserRole.ORGANIZER && (
                  <div className="flex items-center gap-3 animate-in fade-in">
                    <input
                      type="checkbox"
                      checked={acceptedOrganizerAgreement}
                      onChange={(e) => setAcceptedOrganizerAgreement(e.target.checked)}
                      className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 accent-black dark:accent-white"
                    />
                    <span className="text-xs text-zinc-500 font-medium">
                      I agree to the <button type="button" onClick={() => setLegalModal({ title: 'Organizer Agreement', content: ORGANIZER_AGREEMENT })} className="underline hover:text-black dark:hover:text-white">Organizer Agreement</button>
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Errors & Success */}
            {error && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs font-bold rounded-xl animate-in shake">
                {error}
              </div>
            )}
            {successMsg && (
              <div className="p-4 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 text-xs font-bold rounded-xl animate-in fade-in">
                {successMsg}
              </div>
            )}

            {/* Submit Action */}
            <button
              disabled={loading || cooldownSeconds > 0}
              className="w-full py-4 bg-black dark:bg-white text-white dark:text-black rounded-full font-black text-xs uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xl flex items-center justify-center gap-2"
            >
              {loading && <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />}
              {cooldownSeconds > 0
                ? `Try again in ${cooldownSeconds}s`
                : mode === 'signin' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Reset Link'
              }
            </button>

          </form>

          {/* Toggle Mode */}
          <div className="text-center">
            <button
              onClick={() => {
                setMode(mode === 'signin' ? 'signup' : 'signin');
                setError(null);
                setSuccessMsg(null);
              }}
              className="text-xs font-bold text-zinc-400 hover:text-black dark:hover:text-white transition-colors"
            >
              {mode === 'signin' ? "New here? Create an account" : "Already have an account? Sign In"}
            </button>
          </div>

        </div>
      </div>

      {legalModal && <LegalModal title={legalModal.title} content={legalModal.content} onClose={() => setLegalModal(null)} />}
    </div>
  );
};