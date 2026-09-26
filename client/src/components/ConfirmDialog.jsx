import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

export default function ConfirmDialog({ open, title, description, confirmLabel = 'Confirm', tone = 'primary', onConfirm, onCancel }) {
  if (!open) return null;

  const toneClasses = tone === 'danger' ? 'bg-danger-600 hover:bg-danger-700' : 'bg-primary-600 hover:bg-primary-700';

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-ink-950/50 animate-fade-in" onClick={onCancel} />
      <div className="card relative w-full max-w-sm animate-slide-up">
        <button onClick={onCancel} className="absolute right-3 top-3 text-ink-400 hover:text-ink-700">
          <X size={16} />
        </button>
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-warning-50 text-warning-600">
          <AlertTriangle size={20} />
        </div>
        <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
        {description && <p className="mt-1.5 text-sm text-ink-600">{description}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="btn-secondary">Cancel</button>
          <button
            onClick={onConfirm}
            className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white shadow-sm transition-all active:scale-[0.98] ${toneClasses}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
