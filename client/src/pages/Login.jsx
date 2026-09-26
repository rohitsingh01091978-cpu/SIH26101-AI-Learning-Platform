import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { LogIn, AlertCircle, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { getErrorMessage } from '../services/api';
import GoogleButton from '../components/GoogleButton.jsx';
import { googleLoginUrl } from '../services/api';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const GOOGLE_ERRORS = {
  cancelled: 'Google sign-in was cancelled.',
  unavailable: 'Google sign-in is not available right now. Please use your email and password.',
  failed: 'Google sign-in could not be completed. Please try again.',
};

export default function Login() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const googleError = searchParams.get('google_error');

  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(googleError ? GOOGLE_ERRORS[googleError] || GOOGLE_ERRORS.failed : '');
  const [loading, setLoading] = useState(false);

  const handleContinue = (e) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setError('Please enter your email address.');
      return;
    }
    if (!EMAIL_PATTERN.test(trimmed)) {
      setError('Please enter a valid email address.');
      return;
    }
    // Nothing is sent to the server here, so this step cannot reveal whether an account exists.
    setEmail(trimmed);
    setError('');
    setStep(2);
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    if (!password) {
      setError('Please enter your password.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const user = await login(email, password);
      toast.success(`Welcome back, ${user.name.split(' ')[0]}.`);
      navigate(user.role === 'ADMIN' ? '/admin' : '/dashboard');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const changeEmail = () => {
    setStep(1);
    setPassword('');
    setShowPassword(false);
    setError('');
  };

  const errorBox = error && (
    <div role="alert" className="flex items-start gap-2 rounded-md bg-danger-50 px-3 py-2 text-sm text-danger-700">
      <AlertCircle size={16} className="mt-0.5 shrink-0" />
      <span>{error}</span>
    </div>
  );

  return (
    <div className="panel shadow-raised p-7 animate-slide-up">
      {step === 1 ? (
        <>
          <div className="mb-6">
            <h2 className="font-display text-lg font-bold text-ink-900">Sign in</h2>
            <p className="mt-1 text-sm text-ink-500">Access your competency dashboard and personalized learning path.</p>
          </div>

          <form onSubmit={handleContinue} className="space-y-4" noValidate>
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

            {errorBox}

            <button type="submit" className="btn-primary w-full">
              Continue
              <ArrowRight size={16} />
            </button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-ink-200" />
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-400">or</span>
            <div className="h-px flex-1 bg-ink-200" />
          </div>

          <GoogleButton />

          <p className="mt-5 text-center text-sm text-ink-500">
            Don&apos;t have an account?{' '}
            <Link to="/register" className="font-medium text-primary-700 hover:underline">Sign up</Link>
          </p>
        </>
      ) : (
        <>
          <div className="mb-6">
            <h2 className="font-display text-lg font-bold text-ink-900">Welcome back</h2>
            <div className="mt-2 flex items-center justify-between gap-3 rounded-md bg-surface-muted px-3 py-2">
              <span className="truncate text-sm text-ink-700">{email}</span>
              <button type="button" onClick={changeEmail} className="shrink-0 text-xs font-medium text-primary-700 hover:underline">
                Change email
              </button>
            </div>
          </div>

          <form onSubmit={handleSignIn} className="space-y-4" noValidate>
            {/* Lets password managers associate the password with the email. */}
            <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
            <div>
              <label className="label" htmlFor="password">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  autoFocus
                  className="input pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
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

            <div>
              <Link to="/forgot-password" className="text-sm font-medium text-primary-700 hover:underline">
                Forgot password?
              </Link>
            </div>

            {errorBox}

            {/* Static hint shown to everyone, so it cannot reveal which emails are Google-only. */}
            <p className="text-xs leading-relaxed text-ink-500">
              Signed up with Google?{' '}
              <a href={googleLoginUrl} className="font-medium text-primary-700 hover:underline">Continue with Google</a>
              , then you can add a password from your Profile.
            </p>

            <button type="submit" disabled={loading} className="btn-primary w-full">
              <LogIn size={16} />
              {loading ? 'Signing in...' : 'Sign in'}
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
