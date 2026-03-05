
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // @ts-ignore
  plugins: [react() as any],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'supabase-client': ['@supabase/supabase-js'],
          'ai-engine': ['@google/genai'],  // P-7.2: still chunked but NOT in optimizeDeps — loaded lazily by organizer views
          'qr-and-scanner': ['qrcode.react', 'jsqr'],
          // 'animations-engine': removed — GSAP dropped from EventDetail (P-7.4); gsap still in organizer wizard if needed
        }
      }
    },
    chunkSizeWarningLimit: 500,
    reportCompressedSize: true
  },
  optimizeDeps: {
    // P-7.2: Removed '@google/genai' and 'gsap' — these are organizer-only and
    // should not pre-warm the dev server for anonymous attendees.
    include: ['react', 'react-dom', '@supabase/supabase-js']
  }
});
