import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Info, Mail, CheckCircle2 } from 'lucide-react';
import { forgotPassword, getAuthCapabilities } from '../services/authService';
import { getErrorMessage } from '../services/api';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UNAVAILABLE = 'Password recovery is currently unavailable. Please contact the administrator.';

// Step 1 of password recovery. The reply is the same whether or not the address has an account, so
// this page never tells the visitor which emails are registered. If the deployment has no email
// service configured, it says so plainly instead of pretending a message was sent.
export default function ForgotPassword() {
  const [available, setAvailable] = useState(null); // null = still checking
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    getAuthCapabilities()
      .then((c) => setAvailable(Boolean(c.passwordReset)))
      .catch(() => setAvailable(true)); // can't tell (e.g. offline): let the server decide on submit
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!EMAIL_PATTERN.test(trimmed)) {
      setError('Please enter a valid email address.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await forgotPassword(trimmed);
      setSent(true);
    } catch (err) {
      if (err?.response?.data?.code === 'PASSWORD_RESET_UNAVAILABLE') setAvailable(false);
      else setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel shadow-raised p-7 animate-slide-up">
      <Link to="/login" className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:underline">
        <ArrowLeft size={13} /> Back to sign in
      </Link>

      <h2 className="font-display text-lg font-bold text-ink-900">Forgot your password?</h2>

      {available === false ? (
        <div role="status" className="mt-4 flex items-start gap-2 rounded-md bg-info-50 px-3 py-2 text-sm text-info-700">
          <Info size={16} className="mt-0.5 shrink-0" />
          <span>{UNAVAILABLE}</span>
        </div>
      ) : sent ? (
        <div role="status" className="mt-4 flex items-start gap-2 rounded-md bg-success-50 px-3 py-2 text-sm text-success-700">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          <span>
            If an account exists for <strong>{email.trim()}</strong>, password reset instructions have been sent. Please check your
            inbox (and spam folder). The link works once and expires soon.
          </span>
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm text-ink-500">Enter your email address and we&apos;ll send you a link to choose a new password.</p>
          <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                autoFocus
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
              />
            </div>

            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-md bg-danger-50 px-3 py-2 text-sm text-danger-700">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button type="submit" disabled={loading || available === null} className="btn-primary w-full">
              <Mail size={16} />
              {loading ? 'Sending...' : 'Send reset link'}
            </button>
          </form>
        </>
      )}

      <p className="mt-6 border-t border-ink-200 pt-4 text-center text-[11px] text-ink-400">
        SIH26101 Prototype &bull; For demonstration purposes
      </p>
    </div>
  );
}
