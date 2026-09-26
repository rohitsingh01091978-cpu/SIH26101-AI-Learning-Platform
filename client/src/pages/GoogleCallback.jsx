import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, Link2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { googleExchange, googleLink } from '../services/authService';
import { getErrorMessage } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner.jsx';

// Landing page after the backend finishes the Google flow. It receives either
//   #code=<one-time code>   -> swapped for the normal session token, or
//   #link=<token>&email=... -> the Google email matches an existing password account;
//                              the user must confirm with that account's password.
// The fragment is removed from the address bar immediately and is never sent to any server.
export default function GoogleCallback() {
  const { establishSession } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const started = useRef(false);
  const [linkToken, setLinkToken] = useState(null);
  const [linkEmail, setLinkEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const finish = (data) => {
    const user = establishSession(data.token, data.user);
    toast.success(`Welcome, ${user.name.split(' ')[0]}.`);
    navigate(user.role === 'ADMIN' ? '/admin' : '/dashboard', { replace: true });
  };

  useEffect(() => {
    if (started.current) return; // the code is single-use; never exchange it twice (React StrictMode)
    started.current = true;

    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    window.history.replaceState(null, '', window.location.pathname);

    const code = params.get('code');
    const link = params.get('link');
    if (link) {
      setLinkToken(link);
      setLinkEmail(params.get('email') || '');
      return;
    }
    if (!code) {
      navigate('/login?google_error=failed', { replace: true });
      return;
    }
    googleExchange(code)
      .then(finish)
      .catch(() => navigate('/login?google_error=failed', { replace: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirmLink = async (e) => {
    e.preventDefault();
    if (!password) return setError('Please enter your password.');
    setError('');
    setBusy(true);
    try {
      finish(await googleLink(linkToken, password));
    } catch (err) {
      setError(getErrorMessage(err));
      setBusy(false);
    }
  };

  if (!linkToken) {
    return (
      <div className="panel shadow-raised p-7">
        <LoadingSpinner label="Signing you in with Google..." />
      </div>
    );
  }

  return (
    <div className="panel shadow-raised p-7 animate-slide-up">
      <h2 className="font-display text-lg font-bold text-ink-900">Link your Google account</h2>
      <p className="mt-2 text-sm text-ink-500">
        An account for <span className="font-medium text-ink-700">{linkEmail}</span> already exists. Enter its password once to
        connect Google sign-in to it. Your Google password is never shared with this application.
      </p>

      <form onSubmit={confirmLink} className="mt-5 space-y-4" noValidate>
        <div>
          <label className="label" htmlFor="link-password">Account password</label>
          <input
            id="link-password"
            type="password"
            autoComplete="current-password"
            autoFocus
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
          />
        </div>

        {error && (
          <div role="alert" className="alert-error">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button type="submit" disabled={busy} className="btn-primary w-full">
          <Link2 size={16} />
          {busy ? 'Linking...' : 'Link and sign in'}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-ink-500">
        <Link to="/login" className="font-medium text-primary-700 hover:underline">Back to sign in</Link>
      </p>
    </div>
  );
}
