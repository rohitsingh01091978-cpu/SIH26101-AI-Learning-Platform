import React, { useEffect, useState } from 'react';
import { Save, CheckCircle2 } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import ErrorState from '../components/ErrorState.jsx';
import { getProfile, updateProfile } from '../services/profileService';
import { getErrorMessage } from '../services/api';

const FIELDS = [
  { key: 'name', label: 'Full name' },
  { key: 'department', label: 'Department' },
  { key: 'organization', label: 'Organization' },
  { key: 'experience', label: 'Experience (years)', type: 'number' },
  { key: 'currentRole', label: 'Current role' },
  { key: 'targetRole', label: 'Target role' },
];

export default function Profile() {
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
        action={isDemoAccount ? <span className="badge bg-warning-50 text-warning-700">DEMO PROFILE</span> : null}
      />

      {isDemoAccount && (
        <div className="mb-4 rounded-md bg-warning-50 px-3.5 py-2.5 text-xs text-warning-800">
          This is a seeded demo account for the SIH26101 prototype — it does not represent a real government employee.
        </div>
      )}

      <form onSubmit={handleSubmit} className="card space-y-4">
        <div className="rounded-lg bg-surface-subtle px-3 py-2 text-sm text-ink-700">{form.email}</div>

        {FIELDS.map((field) => (
          <div key={field.key}>
            <label className="label">{field.label}</label>
            <input
              type={field.type || 'text'}
              className="input"
              value={form[field.key] ?? ''}
              onChange={(e) => handleChange(field.key, e.target.value)}
            />
          </div>
        ))}

        <div>
          <label className="label">Learning goals</label>
          <textarea
            className="input min-h-[90px]"
            value={form.learningGoals ?? ''}
            onChange={(e) => handleChange('learningGoals', e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-danger-600">{error}</p>}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving} className="btn-primary">
            <Save size={16} /> {saving ? 'Saving...' : 'Save changes'}
          </button>
          {saved && (
            <span className="flex items-center gap-1 text-sm text-success-600">
              <CheckCircle2 size={16} /> Saved
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
