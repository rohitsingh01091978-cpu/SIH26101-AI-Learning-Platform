import React from 'react';

export function SkeletonLine({ width = '100%', height = 12, className = '' }) {
  return <div className={`skeleton ${className}`} style={{ width, height }} />;
}

export function SkeletonCard({ lines = 3 }) {
  return (
    <div className="card space-y-3">
      <SkeletonLine width="40%" height={10} />
      <SkeletonLine width="70%" height={20} />
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine key={i} width={`${90 - i * 15}%`} height={10} />
      ))}
    </div>
  );
}

export function SkeletonKPIRow({ count = 4 }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card space-y-3">
          <SkeletonLine width="55%" height={10} />
          <SkeletonLine width="35%" height={26} />
          <SkeletonLine width="70%" height={8} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonChart({ height = 280 }) {
  return (
    <div className="card">
      <SkeletonLine width="30%" height={12} className="mb-4" />
      <div className="skeleton w-full" style={{ height }} />
    </div>
  );
}

export function SkeletonList({ rows = 4 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card flex items-center gap-3">
          <div className="skeleton h-9 w-9 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <SkeletonLine width="45%" height={10} />
            <SkeletonLine width="25%" height={8} />
          </div>
        </div>
      ))}
    </div>
  );
}
