// frontend/src/components/LoadingSkeleton.tsx
import React from 'react';
import clsx from 'clsx';

interface LoadingSkeletonProps {
  className?: string;
  count?: number;
}

const Shimmer: React.FC = () => (
  <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-slate-200/50 dark:via-slate-700/50 to-transparent" />
);

const SkeletonBox: React.FC<{ className?: string }> = ({ className }) => (
  <div className={clsx("relative overflow-hidden rounded-md bg-slate-200 dark:bg-slate-700", className)}>
    <Shimmer />
  </div>
);

const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({ className, count = 1 }) => {
  return (
    <div className={clsx("space-y-4", className)}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="p-4 rounded-xl bg-white dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/50">
          <SkeletonBox className="h-5 w-3/4 mb-4" />
          <div className="space-y-2">
            <SkeletonBox className="h-4 w-full" />
            <SkeletonBox className="h-4 w-5/6" />
          </div>
        </div>
      ))}
    </div>
  );
};

export default LoadingSkeleton;