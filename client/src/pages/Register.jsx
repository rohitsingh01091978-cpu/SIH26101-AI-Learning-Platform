import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, Eye, EyeOff, UserPlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { register } from '../services/authService';
import { getErrorMessage } from '../services/api';
import GoogleButton from '../components/GoogleButton.jsx';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Uses the existing POST /api/auth/register endpoint. New accounts are always learners
// (the server ignores any role); admin accounts can only be provisioned server-side.
export default function Register() {
  const { establishSession } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return setError('Please enter your name.');
    if (!EMAIL_PATTERN.test(email.trim())) return setError('Please enter a valid email address.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    setError('');
    setLoading(true);
    try {
      const data = await register({ name: name.trim(), email: email.trim(), password });
      establishSession(data.token, data.user);
      toast.success(`Welcome, ${data.user.name.split(' ')[0]}.`);
      navigate('/dashboard');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel shadow-raised p-7 animate-slide-up">
      <div className="mb-6">
        <h2 className="font-display text-lg font-bold text-ink-900">Create your account</h2>
        <p className="mt-1 text-sm text-ink-500">Start building your competency profile and learning path.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label className="label" htmlFor="name">Full name</label>
          <input id="name" type="text" autoComplete="name" autoFocus className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter your name" />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="username" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your email" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              className="input pr-10"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-md bg-danger-50 px-3 py-2 text-sm text-danger-700">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full">
          <UserPlus size={16} />
          {loading ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      <div className="my-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-ink-200" />
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-400">or</span>
        <div className="h-px flex-1 bg-ink-200" />
      </div>

      <GoogleButton label="Sign up with Google" />

      <p className="mt-5 text-center text-sm text-ink-500">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-primary-700 hover:underline">Sign in</Link>
      </p>

      <p className="mt-6 border-t border-ink-200 pt-4 text-center text-[11px] text-ink-400">
        SIH26101 Prototype &bull; For demonstration purposes
      </p>
    </div>
  );
}
