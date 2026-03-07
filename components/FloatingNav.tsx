import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Profile, UserRole } from '../types';
import { gsap } from 'gsap';

interface FloatingNavProps {
  currentView: string;
  user: Profile | null;
  onNavigate: (view: string) => void;
}

export const FloatingNav: React.FC<FloatingNavProps> = ({ currentView, user, onNavigate }) => {
  const [mounted, setMounted] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);
  const [ticketOverlayOpen, setTicketOverlayOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Watch for ticket overlay state set by Wallet.tsx via body class
  useEffect(() => {
    const check = () => setTicketOverlayOpen(document.body.classList.contains('ticket-overlay-open'));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Entry Animation
  useEffect(() => {
    if (mounted && navRef.current) {
      gsap.fromTo(navRef.current,
        { y: 100, opacity: 0, scale: 0.8 },
        { y: 0, opacity: 1, scale: 1, duration: 1, ease: "power4.out", delay: 0.5 }
      );
    }
  }, [mounted]);

  const NavItem = ({ view, icon, label, restricted }: { view: string, icon: React.ReactNode, label: string, restricted?: boolean }) => {
    const isActive = currentView === view;
    const isUserAttendee = user?.role === UserRole.USER;
    const itemRef = useRef<HTMLButtonElement>(null);

    // Hover Animation
    const onEnter = () => {
      gsap.to(itemRef.current, { scale: 1.2, duration: 0.3, ease: "back.out(1.7)" });
    };

    const onLeave = () => {
      gsap.to(itemRef.current, { scale: 1, duration: 0.3, ease: "power2.out" });
    };

    return (
      <button
        ref={itemRef}
        type="button"
        onClick={() => { console.log('FloatingNav Click:', view); onNavigate(view); }}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        className={`relative w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 group cursor-pointer outline-none transform-gpu ${isActive ? 'text-black dark:text-white' : 'text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300'
          } ${restricted && isUserAttendee ? 'opacity-30 grayscale' : 'opacity-100'}`}
        aria-label={label}
      >
        <div className={`transition-all duration-300 relative z-10 ${isActive ? 'scale-110 drop-shadow-md' : 'scale-100'}`}>
          {icon}
        </div>

        {/* Active Indicator Dot */}
        {isActive && (
          <div className="absolute bottom-2 w-1 h-1 rounded-full bg-current shadow-[0_0_8px_currentColor] animate-in fade-in zoom-in duration-300" />
        )}

        {/* Hover Glow */}
        <div className="absolute inset-0 rounded-full bg-zinc-500/10 scale-0 group-hover:scale-100 transition-transform duration-300 pointer-events-none" />
      </button>
    );
  };

  const navContent = (
    <div
      className="fixed inset-x-0 bottom-8 z-[100] flex justify-center pointer-events-none isolate transition-all duration-300"
      style={{ transform: ticketOverlayOpen ? 'translateY(6rem)' : 'translateY(0)', opacity: ticketOverlayOpen ? 0 : 1, pointerEvents: ticketOverlayOpen ? 'none' : undefined }}
    >
      <nav
        ref={navRef}
        className="pointer-events-auto bg-white/80 dark:bg-black/80 backdrop-blur-2xl border border-white/20 dark:border-white/10 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.2)] dark:shadow-[0_20px_40px_-10px_rgba(0,0,0,0.5)] rounded-[2.5rem] px-4 py-2 flex items-center gap-1 transition-all duration-300"
      >
        <NavItem
          view="about"
          label="Vision"
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
        />

        <NavItem
          view="home"
          label="Explore"
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>}
        />

        <div className="w-px h-8 bg-zinc-200 dark:bg-zinc-800 mx-1" />

        <NavItem
          view="wallet"
          label="Vault"
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" /></svg>}
        />



        <NavItem
          view="scanner"
          label="Scanner"
          restricted
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>}
        />

        <NavItem
          view="organizer"
          label="Studio"
          restricted
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>}
        />

        <div className="w-px h-8 bg-zinc-200 dark:bg-zinc-800 mx-1" />

        <NavItem
          view="settings"
          label="Setup"
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
        />
      </nav>
    </div>
  );

  return mounted ? createPortal(navContent, document.body) : null;
};