import React, { useEffect, useState } from 'react';
import { Save, CheckCircle2, UserCircle, Briefcase, Target } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ErrorState from '../components/ErrorState.jsx';
import PasswordCard from '../components/PasswordCard.jsx';
import { getProfile, updateProfile } from '../services/profileService';
import { getErrorMessage } from '../services/api';
import { maskEmail, roleLabel } from '../utils/display';
import { useAuth } from '../context/AuthContext.jsx';

// The same fields as before, grouped so the page reads as sections instead of one long form.
const SECTIONS = [
  {
    title: 'Personal details',
    icon: UserCircle,
    fields: [{ key: 'name', label: 'Full name' }],
  },
  {
    title: 'Work profile',
    icon: Briefcase,
    fields: [
      { key: 'department', label: 'Department' },
      { key: 'organization', label: 'Organization' },
      { key: 'experience', label: 'Experience (years)', type: 'number' },
      { key: 'currentRole', label: 'Current role' },
    ],
  },
  {
    title: 'Career target',
    icon: Target,
    fields: [{ key: 'targetRole', label: 'Target role' }],
  },
];

export default function Profile() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const profile = await getProfile();
      setForm(profile);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleChange = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const updated = await updateProfile(form);
      setForm((f) => ({ ...f, ...updated }));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <LoadingSpinner label="Loading profile..." />
      </div>
    );
  }

  if (error && !form) {
    return <ErrorState message={error} onRetry={load} />;
  }

  const isDemoAccount = form.email?.endsWith('@demo.gov.in');

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="My Profile"
        description="This information drives your personalized learning recommendations."
        action={isDemoAccount ? <span className="badge bg-warning-50 text-warning-700">SAMPLE PROFILE</span> : null}
      />

      {isDemoAccount && (
        <div className="mb-4 rounded-md bg-warning-50 px-3.5 py-2.5 text-xs text-warning-800">
          This is a sample account and does not represent a real government employee.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="card flex flex-wrap items-center justify-between gap-2" title="Your sign-in email is partly hidden for privacy">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ink-900 text-sm font-semibold text-white" aria-hidden="true">
              {(form.name || '?').slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink-900">{form.name}</p>
              <p className="truncate text-xs text-ink-500">Signed in as {maskEmail(form.email)}</p>
            </div>
          </div>
          <span className="badge bg-primary-50 text-primary-700">{roleLabel(user?.role)}</span>
        </div>

        {SECTIONS.map((section) => (
          <fieldset key={section.title} className="card">
            <legend className="sr-only">{section.title}</legend>
            <h2 className="mb-4 flex items-center gap-2 card-title" aria-hidden="true">
              <section.icon size={16} className="text-primary-600" /> {section.title}
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {section.fields.map((field) => (
                <div key={field.key}>
                  <label className="label" htmlFor={`profile-${field.key}`}>{field.label}</label>
                  <input
                    id={`profile-${field.key}`}
                    type={field.type || 'text'}
                    className="input"
                    value={form[field.key] ?? ''}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </fieldset>
        ))}

        <div className="card">
          <h2 className="mb-1 card-title">Learning goals</h2>
          <p className="mb-3 text-xs text-ink-500">Your goals help the platform prioritise which competencies to build first.</p>
          <label className="sr-only" htmlFor="profile-learningGoals">Learning goals</label>
          <textarea
            id="profile-learningGoals"
            className="input min-h-[96px]"
            value={form.learningGoals ?? ''}
            onChange={(e) => handleChange('learningGoals', e.target.value)}
          />
        </div>

        {error && <p role="alert" className="alert-error">{error}</p>}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving} className="btn-primary">
            <Save size={16} /> {saving ? 'Saving...' : 'Save changes'}
          </button>
          <span role="status" aria-live="polite">
            {saved && (
              <span className="flex items-center gap-1 text-sm text-success-600">
                <CheckCircle2 size={16} /> Saved
              </span>
            )}
          </span>
        </div>
      </form>

      {/* Seeded demo credentials are public, so demo accounts cannot change their password. */}
      {!isDemoAccount && <PasswordCard />}
    </div>
  );
}
