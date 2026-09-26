import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export default function ErrorState({ message = 'Something went wrong.', onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-danger-200 bg-danger-50 py-14 px-6 text-center animate-fade-in">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-danger-100 text-danger-600">
        <AlertTriangle size={20} />
      </div>
      <p className="max-w-sm text-sm font-medium text-danger-800">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-secondary mt-1">
          <RotateCcw size={14} /> Try again
        </button>
      )}
    </div>
  );
}
