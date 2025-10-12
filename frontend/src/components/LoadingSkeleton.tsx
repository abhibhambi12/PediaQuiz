import React from 'react';
import clsx from 'clsx';

// --- BATCH 3: UI/UX ENHANCEMENT ---
// This component has been upgraded to be "content-aware." Instead of a generic
// box, it can now render skeletons that match the layout of specific components
// like MCQs or Dashboard Cards, creating a smoother loading experience.

interface LoadingSkeletonProps {
  className?: string;
  count?: number;
  // The new `variant` prop determines the shape of the skeleton.
  variant?: 'list-item' | 'card' | 'mcq';
}

const Shimmer: React.FC = () => (
  <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-slate-200/50 dark:via-slate-700/50 to-transparent" />
);

const SkeletonBox: React.FC<{ className?: string }> = ({ className }) => (
  <div className={clsx("relative overflow-hidden rounded-md bg-slate-200 dark:bg-slate-700", className)}>
    <Shimmer />
  </div>
);

const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({ className, count = 1, variant = 'list-item' }) => {
  const renderSkeletonVariant = (key: number) => {
    switch (variant) {
      case 'card':
        return (
          <div key={key} className="p-4 rounded-xl bg-white dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/50 text-center">
            <SkeletonBox className="h-12 w-12 mx-auto mb-3 rounded-full" />
            <SkeletonBox className="h-5 w-3/4 mx-auto mb-2" />
            <SkeletonBox className="h-4 w-5/6 mx-auto" />
          </div>
        );
      case 'mcq':
        return (
           <div key={key} className="p-6 rounded-xl bg-white dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/50">
            <SkeletonBox className="h-6 w-5/6 mb-6" />
            <div className="space-y-3">
              <SkeletonBox className="h-12 w-full" />
              <SkeletonBox className="h-12 w-full" />
              <SkeletonBox className="h-12 w-full" />
              <SkeletonBox className="h-12 w-full" />
            </div>
          </div>
        );
      case 'list-item':
      default:
        return (
          <div key={key} className="p-4 rounded-xl bg-white dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/50">
            <SkeletonBox className="h-5 w-3/4 mb-4" />
            <div className="space-y-2">
              <SkeletonBox className="h-4 w-full" />
              <SkeletonBox className="h-4 w-5/6" />
            </div>
          </div>
        );
    }
  };

  return (
    <div className={clsx("space-y-4", className)}>
      {Array.from({ length: count }).map((_, index) => renderSkeletonVariant(index))}
    </div>
  );
};

export default LoadingSkeleton;