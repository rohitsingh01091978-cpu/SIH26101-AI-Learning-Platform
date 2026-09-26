import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound } from 'lucide-react';
import { resetPassword } from '../services/authService';
import { getErrorMessage } from '../services/api';

// Step 2 of password recovery. The reset link carries the one-time token in the URL fragment
// (#token=...): it is read once, removed from the address bar immediately, and never sent anywhere
// except in the POST body of the reset request.
export default function ResetPassword() {
  // Read the token during render (a pure read of the URL fragment). Stripping it from the address bar
  // happens in the effect below; reading it there instead would lose it when React StrictMode runs effects twice.
  const tokenRef = useRef(undefined);
  if (tokenRef.current === undefined) {
    tokenRef.current = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token');
  }
  const hasToken = Boolean(tokenRef.current);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [invalidLink, setInvalidLink] = useState(false);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  // Remove the one-time token from the address bar / history as soon as the page has loaded.
  useEffect(() => {
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password.length > 72) return setError('Password must be at most 72 characters.');
    if (password !== confirm) return setError('The passwords do not match.');
    setError('');
    setLoading(true);
    try {
      await resetPassword(tokenRef.current, password);
      tokenRef.current = null;
      setDone(true);
    } catch (err) {
      if (err?.response?.data?.code === 'INVALID_RESET_TOKEN') setInvalidLink(true);
      else setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const linkProblem = !hasToken || invalidLink;

  return (
    <div className="panel shadow-raised p-7 animate-slide-up">
      <h2 className="font-display text-lg font-bold text-ink-900">Choose a new password</h2>

      {done ? (
        <>
          <div role="status" className="mt-4 flex items-start gap-2 rounded-md bg-success-50 px-3 py-2 text-sm text-success-700">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            <span>Your password has been reset. Any other devices signed in to your account have been signed out.</span>
          </div>
          <Link to="/login" className="btn-primary mt-5 w-full">Continue to sign in</Link>
        </>
      ) : linkProblem ? (
        <>
          <div role="alert" className="mt-4 flex items-start gap-2 rounded-md bg-danger-50 px-3 py-2 text-sm text-danger-700">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>This reset link is invalid or has expired. Reset links work once and expire after a short time.</span>
          </div>
          <Link to="/forgot-password" className="btn-primary mt-5 w-full">Request a new link</Link>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-ink-500">Use at least 8 characters.</p>
          <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
            <div>
              <label className="label" htmlFor="new-password">New password</label>
              <div className="relative">
                <input
                  id="new-password"
                  type={show ? 'text' : 'password'}
                  autoComplete="new-password"
                  autoFocus
                  className="input pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700"
                  aria-label={show ? 'Hide password' : 'Show password'}
                >
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="label" htmlFor="confirm-password">Confirm new password</label>
              <input
                id="confirm-password"
                type={show ? 'text' : 'password'}
                autoComplete="new-password"
                className="input"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>

            {error && (
              <div role="alert" className="alert-error">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full">
              <KeyRound size={16} />
              {loading ? 'Saving...' : 'Reset password'}
            </button>
          </form>
        </>
      )}

      <p className="mt-6 border-t border-ink-200 pt-4 text-center text-[11px] text-ink-400">
        AI-Powered Learning &amp; Competency Intelligence Platform
      </p>
    </div>
  );
}
