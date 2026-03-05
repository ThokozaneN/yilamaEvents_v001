/**
 * YILAMA EVENTS: PRODUCTION MONITORING
 * Centralized logging and error tracking for high-traffic environments.
 */
import React from 'react';
import * as Sentry from "@sentry/react";

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN ?? '';
const ENVIRONMENT = import.meta.env.MODE ?? 'development';

export const initMonitoring = () => {
  if (SENTRY_DSN) {
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: ENVIRONMENT,
      tracesSampleRate: 1.0,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration(),
      ],
    });
  }
};



/**
 * Log error to console and monitoring service (Sentry).
 * Provides centralized context for debugging.
 */
export const logError = (error: any, context?: Record<string, any>) => {
  const errorObj = error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error));

  // SECURITY FIX: Conditional logging to prevent stack trace exposure in production
  if (ENVIRONMENT === 'development') {
    console.error("[YILAMA_ERROR]", errorObj.message, {
      context,
      original: error,
      stack: errorObj.stack
    });
  } else {
    // Minimal info in production to prevent information disclosure
    console.error("[YILAMA_ERROR]", errorObj.message);
  }

  // Production Tracking
  if (SENTRY_DSN) {
    Sentry.captureException(errorObj, {
      extra: context,
      tags: {
        environment: ENVIRONMENT,
        ...(context?.tag && { type: context.tag })
      }
    });
  }
};

/**
 * Higher-order component/wrapper for error boundaries
 */
export const MonitoringProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  return React.createElement(Sentry.ErrorBoundary, {
    fallback: (props: { error: unknown; componentStack: string | null; resetError: () => void }) =>
      React.createElement('div', { className: "min-h-screen flex items-center justify-center themed-bg p-8 text-center" },
        React.createElement('div', { className: "max-w-md space-y-6" },
          React.createElement('div', { className: "w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto" },
            React.createElement('svg', { className: "w-8 h-8 text-red-500", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24" },
              React.createElement('path', {
                strokeLinecap: "round",
                strokeLinejoin: "round",
                strokeWidth: "2.5",
                d: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              })
            )
          ),
          React.createElement('h2', { className: "text-2xl font-black themed-text uppercase tracking-tight" }, "System Interruption"),
          React.createElement('p', { className: "text-sm themed-text opacity-50 leading-relaxed font-medium" }, "An unexpected technical error occurred. Our team has been notified."),
          React.createElement('button', {
            onClick: props.resetError,
            className: "w-full py-4 bg-black dark:bg-white text-white dark:text-black rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl"
          }, "Reload Platform")
        )
      )
  }, children);
};