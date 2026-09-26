import React from 'react';
import { Loader2 } from 'lucide-react';

export default function LoadingSpinner({ label = 'Loading...', size = 20 }) {
  return (
    <div className="flex items-center gap-2 text-ink-500 text-sm">
      <Loader2 size={size} className="animate-spin text-primary-600" />
      <span>{label}</span>
    </div>
  );
}
