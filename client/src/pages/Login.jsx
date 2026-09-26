import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, AlertCircle, Eye, EyeOff, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { getErrorMessage } from '../services/api';

export default function Login() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(email, password, remember);
      toast.success(`Welcome back, ${user.name.split(' ')[0]}.`);
      navigate(user.role === 'ADMIN' ? '/admin' : '/dashboard');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (role) => {
    if (role === 'learner') {
      setEmail('learner@demo.gov.in');
      setPassword('Learner@123');
    } else {
      setEmail('admin@demo.gov.in');
      setPassword('Admin@123');
    }
  };

  return (
    <div className="panel shadow-raised p-7 animate-slide-up">
      <div className="mb-6">
        <h2 className="font-display text-lg font-bold text-ink-900">Sign in</h2>
        <p className="mt-1 text-sm text-ink-500">Access your competency dashboard and learning path.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label" htmlFor="email">Email address</label>
          <input
            id="email"
            type="email"
            required
            autoFocus
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@gov.in"
          />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              required
              className="input pr-10"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-ink-600">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-ink-300 accent-primary-600"
            />
            Remember me
          </label>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md bg-danger-50 px-3 py-2 text-sm text-danger-700">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full">
          <LogIn size={16} />
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      <div className="mt-5 border-t border-ink-200 pt-4">
        <button
          type="button"
          onClick={() => setDemoOpen((o) => !o)}
          className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-ink-500 hover:text-ink-700"
        >
          Demo accounts
          <ChevronDown size={14} className={`transition-transform ${demoOpen ? 'rotate-180' : ''}`} />
        </button>
        {demoOpen && (
          <div className="mt-3 grid grid-cols-2 gap-2 animate-fade-in">
            <button type="button" onClick={() => fillDemo('learner')} className="btn-secondary text-xs">
              Fill learner
            </button>
            <button type="button" onClick={() => fillDemo('admin')} className="btn-secondary text-xs">
              Fill admin
            </button>
            <p className="col-span-2 mt-1 text-[11px] leading-relaxed text-ink-400">
              learner@demo.gov.in / Learner@123 &middot; admin@demo.gov.in / Admin@123
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
