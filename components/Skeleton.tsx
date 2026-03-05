import React from 'react';

export const SkeletonPulse: React.FC<{ className?: string }> = ({ className }) => (
  <div className={`relative overflow-hidden themed-secondary-bg animate-pulse ${className}`}>
    <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
    <style>{`
      @keyframes shimmer {
        100% { transform: translateX(100%); }
      }
    `}</style>
  </div>
);

export const EventCardSkeleton = () => (
  <div className="relative aspect-[4/5] rounded-[3rem] border themed-border overflow-hidden p-8 flex flex-col justify-end gap-4">
    <SkeletonPulse className="absolute inset-0" />
    <div className="relative z-10 space-y-3">
      <SkeletonPulse className="w-1/2 h-8 rounded-xl opacity-20" />
      <SkeletonPulse className="w-3/4 h-4 rounded-lg opacity-10" />
      <SkeletonPulse className="w-1/4 h-4 rounded-lg opacity-10" />
    </div>
  </div>
);

export const StatSkeleton = () => (
  <div className="p-10 themed-card rounded-[3.5rem] border themed-border space-y-4">
    <SkeletonPulse className="w-20 h-3 rounded-full opacity-20" />
    <SkeletonPulse className="w-32 h-10 rounded-2xl opacity-40" />
  </div>
);

export const TableRowSkeleton = () => (
  <tr className="border-b themed-border last:border-0">
    <td className="px-12 py-10">
      <div className="flex items-center gap-4">
        <SkeletonPulse className="w-12 h-12 rounded-xl" />
        <div className="space-y-2">
          <SkeletonPulse className="w-32 h-4 rounded-lg opacity-30" />
          <SkeletonPulse className="w-20 h-2 rounded-lg opacity-10" />
        </div>
      </div>
    </td>
    <td className="px-12 py-10"><SkeletonPulse className="w-24 h-4 rounded-lg mx-auto opacity-20" /></td>
    <td className="px-12 py-10"><SkeletonPulse className="w-20 h-6 rounded-lg ml-auto opacity-30" /></td>
    <td className="px-12 py-10"><SkeletonPulse className="w-16 h-8 rounded-full ml-auto opacity-20" /></td>
  </tr>
);
