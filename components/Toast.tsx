import React, { useEffect } from 'react';
import { gsap } from 'gsap';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastProps {
  message: string;
  type: ToastType;
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, type, onClose }) => {
  useEffect(() => {
    const tl = gsap.timeline();
    tl.fromTo(".toast-container", 
      { y: 50, opacity: 0, scale: 0.9 },
      { y: 0, opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.7)" }
    );

    const timer = setTimeout(() => {
      tl.to(".toast-container", {
        y: 20,
        opacity: 0,
        scale: 0.95,
        duration: 0.4,
        onComplete: onClose
      });
    }, 4000);

    return () => clearTimeout(timer);
  }, [onClose]);

  const icons = {
    success: 'M5 13l4 4L19 7',
    error: 'M6 18L18 6M6 6l12 12',
    info: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    warning: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z'
  };

  const colors = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    info: 'bg-blue-500',
    warning: 'bg-amber-500'
  };

  return (
    <div className="fixed bottom-32 left-0 right-0 z-[100] flex justify-center px-6 pointer-events-none">
      <div className={`toast-container pointer-events-auto themed-card border themed-border shadow-2xl rounded-2xl px-6 py-4 flex items-center gap-4 max-w-md apple-blur`}>
        <div className={`w-8 h-8 rounded-full ${colors[type]} flex items-center justify-center text-white shrink-0`}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d={icons[type]} />
          </svg>
        </div>
        <p className="text-xs font-bold themed-text leading-tight">{message}</p>
        <button onClick={onClose} className="ml-2 opacity-30 hover:opacity-100 transition-opacity">
          <svg className="w-4 h-4 themed-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};