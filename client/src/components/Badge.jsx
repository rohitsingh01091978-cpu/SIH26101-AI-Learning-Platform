import React from 'react';

const VARIANTS = {
  STRONG: 'bg-success-50 text-success-700',
  DEVELOPING: 'bg-warning-50 text-warning-700',
  NEEDS_IMPROVEMENT: 'bg-danger-50 text-danger-700',
  HIGH: 'bg-danger-50 text-danger-700',
  MEDIUM: 'bg-warning-50 text-warning-700',
  LOW: 'bg-ink-100 text-ink-600',
  EASY: 'bg-success-50 text-success-700',
  HARD: 'bg-danger-50 text-danger-700',
  MIXED: 'bg-primary-50 text-primary-700',
  COMPLETED: 'bg-success-50 text-success-700',
  IN_PROGRESS: 'bg-info-50 text-info-700',
  NOT_STARTED: 'bg-ink-100 text-ink-600',
  PROCESSING: 'bg-warning-50 text-warning-700',
  READY: 'bg-info-50 text-info-700',
  FAILED: 'bg-danger-50 text-danger-700',
  STATISTICAL: 'bg-primary-50 text-primary-700',
  TECHNICAL: 'bg-violet-50 text-violet-700',
  DIGITAL_GOVERNANCE: 'bg-accent-50 text-accent-700',
  BEHAVIOURAL_MANAGERIAL: 'bg-orange-50 text-orange-700',
  BEGINNER: 'bg-ink-100 text-ink-600',
  INTERMEDIATE: 'bg-info-50 text-info-700',
  ADVANCED: 'bg-primary-50 text-primary-700',
  default: 'bg-ink-100 text-ink-600',
};

// Learning-material processing status -> the label and colour a learner should see (never the raw enum).
export const MATERIAL_STATUS = {
  UPLOADED: { label: 'Ready for analysis', variant: 'READY' },
  EXTRACTING: { label: 'Extracting text', variant: 'PROCESSING' },
  ANALYZING: { label: 'Analyzing', variant: 'PROCESSING' },
  COMPLETED: { label: 'Analyzed', variant: 'COMPLETED' },
  FAILED: { label: 'Failed', variant: 'FAILED' },
};

export default function Badge({ children, variant, className = '' }) {
  const classes = VARIANTS[variant] || VARIANTS.default;
  return <span className={`badge ${classes} ${className}`}>{children}</span>;
}
