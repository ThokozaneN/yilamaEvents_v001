import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import gsap from 'gsap';

interface TransitionOverlayProps {
    isActive: boolean;
    targetView: string;
    onTransitionComplete: () => void;
}

export const TransitionOverlay: React.FC<TransitionOverlayProps> = ({ isActive, targetView, onTransitionComplete }) => {
    const [shouldRender, setShouldRender] = useState(false);
    const overlayRef = React.useRef<HTMLDivElement>(null);
    const iconRef = React.useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isActive) {
            setShouldRender(true);
        }
    }, [isActive]);

    useEffect(() => {
        if (isActive && shouldRender && overlayRef.current && iconRef.current) {
            const tl = gsap.timeline({
                onComplete: () => {
                    onTransitionComplete();
                    // Fade out and unmount after route switches
                    gsap.to(overlayRef.current, {
                        opacity: 0,
                        duration: 0.5,
                        delay: 0.2, // Let the new page settle for a moment
                        ease: "power2.inOut",
                        onComplete: () => setShouldRender(false)
                    });
                }
            });

            // Show overlay
            tl.fromTo(overlayRef.current,
                { autoAlpha: 0, y: "100%" },
                { autoAlpha: 1, y: "0%", duration: 0.6, ease: "power4.inOut" }
            )
                // Pop in icon
                .fromTo(iconRef.current,
                    { scale: 0, rotation: -45, opacity: 0 },
                    { scale: 1, rotation: 0, opacity: 1, duration: 0.5, ease: "back.out(1.7)" },
                    "-=0.2"
                );
        }
    }, [isActive, shouldRender, onTransitionComplete]);

    if (!shouldRender) return null;

    const renderIcon = () => {
        switch (targetView) {
            case 'experiences':
                return (
                    <div className="flex flex-col items-center gap-4 text-white">
                        <svg className="w-16 h-16 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        <span className="font-black text-2xl uppercase tracking-widest">Loading Tours...</span>
                    </div>
                );
            case 'home':
                return (
                    <div className="flex flex-col items-center gap-4 text-white">
                        <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        <span className="font-black text-2xl uppercase tracking-widest">Loading Events...</span>
                    </div>
                );
            default:
                return (
                    <div className="w-16 h-16 border-4 border-white border-t-transparent rounded-full animate-spin" />
                );
        }
    };

    return createPortal(
        <div
            ref={overlayRef}
            className="fixed inset-0 z-[9999] bg-orange-600 flex items-center justify-center auto-alpha-0 translate-y-full"
        >
            <div ref={iconRef}>
                {renderIcon()}
            </div>
        </div>,
        document.body
    );
};
