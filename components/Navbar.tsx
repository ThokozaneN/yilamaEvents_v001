
import React, { useState, useEffect } from 'react';
import { Profile } from '../types';

interface NavbarProps {
  user: Profile | null;
  currentView: string;
  onNavigate: (view: any) => void;
  onLogout: () => void;
  unreadCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({ user, onNavigate, onLogout, unreadCount = 0 }) => {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header className={`fixed top-0 left-0 right-0 h-16 z-[60] border-b transition-all duration-300 ${isScrolled
      ? 'themed-nav-bg apple-blur themed-border shadow-lg shadow-black/10'
      : 'bg-transparent border-transparent'
      }`}>
      <div className="max-w-7xl mx-auto h-full px-6 md:px-12 flex items-center justify-between">
        <div
          className="flex items-center gap-2 sm:gap-3 cursor-pointer group"
          onClick={() => onNavigate('home')}
        >
          <div className="w-7 h-7 sm:w-8 sm:h-8 bg-black rounded-lg flex items-center justify-center transition-transform active:scale-90 shadow-sm">
            <span className="text-white font-bold text-base sm:text-lg italic">Y</span>
          </div>
          <span className="text-xs sm:text-sm font-bold tracking-tight uppercase themed-text">Yilama</span>
        </div>

        {/* Centered Nav Links (Future Placeholder or move menus here) */}

        <div className="flex items-center gap-4 sm:gap-6">
          {user ? (
            <div className="flex items-center gap-4 sm:gap-5">
              <div className="relative group cursor-pointer" onClick={() => onNavigate('notifications')}>
                <svg className="w-5 h-5 themed-text opacity-40 hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[8px] font-black rounded-full flex items-center justify-center animate-pulse border-2 themed-nav-bg">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </div>
              <span className="hidden sm:inline-block text-[10px] font-bold uppercase tracking-widest text-zinc-400 transition-all cursor-pointer hover:themed-text" onClick={() => onNavigate('settings')}>
                {user.name.split(' ')[0]}
              </span>
              <div className="w-[1px] h-3 bg-zinc-200 hidden sm:block" />
              <button
                onClick={onLogout}
                className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:themed-text transition-colors"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={() => onNavigate('auth')}
                className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest px-5 sm:px-6 py-2 bg-black text-white rounded-full hover:bg-zinc-800 transition-all active:scale-95 shadow-lg shadow-black/5"
              >
                Sign In
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
