import React, { useEffect, useState } from 'react';
import { KeyRound, CheckCircle2 } from 'lucide-react';
import { getMe, setPassword } from '../services/authService';
import { getErrorMessage } from '../services/api';

// Lets a signed-in user add an email/password login (accounts created with Google start
// without one) or change their existing password. The server hashes it with bcrypt.
export default function PasswordCard() {
  const [hasPassword, setHasPassword] = useState(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getMe()
      .then((d) => setHasPassword(Boolean(d.user.hasPassword)))
      .catch(() => setHasPassword(null));
  }, []);

  if (hasPassword === null) return null;

  const submit = async (e) => {
    e.preventDefault();
    setDone('');
    if (next.length < 8) return setError('Password must be at least 8 characters.');
    if (next !== confirm) return setError('The new passwords do not match.');
    if (hasPassword && !current) return setError('Please enter your current password.');
    setError('');
    setBusy(true);
    try {
      const payload = hasPassword ? { currentPassword: current, newPassword: next } : { newPassword: next };
      const data = await setPassword(payload);
      setDone(data.message);
      setHasPassword(true);
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card mt-4 space-y-4" noValidate>
      <div>
        <h3 className="font-display text-sm font-bold text-ink-900">{hasPassword ? 'Change password' : 'Set a password'}</h3>
        <p className="mt-1 text-xs text-ink-500">
          {hasPassword
            ? 'Use a new password of at least 8 characters.'
            : 'You signed in with Google. Set a password if you also want to sign in with your email and password. Google sign-in will keep working.'}
        </p>
      </div>

      {hasPassword && (
        <div>
          <label className="label" htmlFor="pw-current">Current password</label>
          <input id="pw-current" type="password" autoComplete="current-password" className="input" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
      )}
      <div>
        <label className="label" htmlFor="pw-new">New password</label>
        <input id="pw-new" type="password" autoComplete="new-password" className="input" value={next} onChange={(e) => setNext(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="pw-confirm">Confirm new password</label>
        <input id="pw-confirm" type="password" autoComplete="new-password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>

      {error && <p role="alert" className="text-sm text-danger-600">{error}</p>}
      {done && (
        <p className="flex items-center gap-1 text-sm text-success-600">
          <CheckCircle2 size={16} /> {done}
        </p>
      )}

      <button type="submit" disabled={busy} className="btn-primary">
        <KeyRound size={16} /> {busy ? 'Saving...' : hasPassword ? 'Change password' : 'Set password'}
      </button>
    </form>
  );
}
