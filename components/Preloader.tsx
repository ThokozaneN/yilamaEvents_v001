import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';

interface PreloaderProps {
  isReady: boolean;
  onComplete: () => void;
}

export const Preloader: React.FC<PreloaderProps> = ({ isReady, onComplete }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const shineRef = useRef<HTMLDivElement>(null);
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);

  // Minimum display timer
  useEffect(() => {
    if (isReady) {
      // If ready immediately, short circuit with small delay
      const timer = setTimeout(() => setMinTimeElapsed(true), 800);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => setMinTimeElapsed(true), 2500); // 2.5s for branding
    return () => clearTimeout(timer);
  }, []);

  // GSAP Animations
  useEffect(() => {
    const ctx = gsap.context(() => {
      // 1. Reveal Text
      gsap.fromTo(textRef.current,
        { y: 30, opacity: 0, scale: 0.95 },
        { y: 0, opacity: 1, scale: 1, duration: 1.2, ease: "power3.out" }
      );

      // 2. Continuous Shine Loop
      gsap.fromTo(shineRef.current,
        { x: '-150%' },
        { x: '150%', duration: 1.8, ease: "power2.inOut", repeat: -1, repeatDelay: 2 }
      );
    }, containerRef);

    return () => ctx.revert();
  }, []);

  // Exit Animation
  useEffect(() => {
    if (isReady && minTimeElapsed) {
      // Smooth exit
      gsap.to(containerRef.current, {
        opacity: 0,
        duration: 0.8,
        ease: "power2.inOut",
        onComplete: () => {
          if (containerRef.current) containerRef.current.style.display = 'none'; // Ensure it's gone
          onComplete();
        }
      });
    }
  }, [isReady, minTimeElapsed, onComplete]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: '#000000',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden' // Important for shine mask
      }}
    >
      {/* Container for Logo/Text with Masking */}
      <div style={{ position: 'relative', overflow: 'hidden', padding: '10px 20px' }}>

        {/* Main Text */}
        <div ref={textRef} style={{
          color: '#ffffff',
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
          fontSize: 'clamp(1.5rem, 5vw, 3rem)', // Responsive font size
          fontWeight: 700,
          letterSpacing: '0.4em',
          textTransform: 'uppercase',
          opacity: 0, // Handled by GSAP
          textAlign: 'center'
        }}>
          Yilama Events
        </div>

        {/* Shine Element (Masked by parent overflow, but we want it over text) */}
        {/* Actually, to shine JUST the text, we need background-clip: text. 
            But for "shining effect" passing over, an overlay with mix-blend-mode is easier. */}
        <div ref={shineRef} style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.8) 50%, transparent 70%)',
          mixBlendMode: 'overlay', // or soft-light
          pointerEvents: 'none'
        }} />
      </div>

      {/* Subtext */}
      <div style={{
        marginTop: '1.5rem',
        color: '#666',
        fontFamily: "'Inter', sans-serif",
        fontSize: '0.75rem',
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        animation: 'pulse 3s infinite ease-in-out'
      }}>
        Experience 2026
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
};
