import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Lock, Loader2, CheckCircle, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { Button } from './Button';
import { getSetupTokenInfo, setupAccountPassword } from '../services/firebase';

export const SetPassword: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const token = new URLSearchParams(location.search).get('token') || '';

  const [validating, setValidating] = useState(true);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [email, setEmail] = useState<string>('');
  const [churchName, setChurchName] = useState<string | null>(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const run = async () => {
      if (!token) {
        setTokenError('No setup token was provided. Please use the link from your welcome email.');
        setValidating(false);
        return;
      }
      try {
        const info = await getSetupTokenInfo(token);
        setEmail(info.email);
        setChurchName(info.churchName);
      } catch (err: any) {
        setTokenError(err?.message || 'This setup link is no longer valid.');
      } finally {
        setValidating(false);
      }
    };
    run();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (password.length < 8) {
      setSubmitError('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setSubmitError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await setupAccountPassword(token, password);
      setSuccess(true);
    } catch (err: any) {
      setSubmitError(err?.message || 'Failed to set password. Please try again or request a new link.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white p-8 rounded-xl shadow-xl max-w-md w-full">
        <div className="flex items-center justify-center mb-6">
          <div className="bg-orange-100 rounded-full p-3">
            <Lock className="w-8 h-8 text-orange-600" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">
          Set Your Church Portal Password
        </h1>

        {validating && (
          <div className="flex items-center justify-center py-8 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Validating your setup link...
          </div>
        )}

        {!validating && tokenError && (
          <div className="mt-6">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
              <AlertCircle className="w-5 h-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-800">{tokenError}</div>
            </div>
            <p className="text-sm text-gray-600 mt-4 text-center">
              If you already set your password, you can{' '}
              <button
                onClick={() => navigate('/login')}
                className="text-orange-600 hover:text-orange-700 underline font-medium"
              >
                log in here
              </button>
              .
            </p>
          </div>
        )}

        {!validating && !tokenError && success && (
          <div className="mt-6 text-center">
            <div className="flex justify-center mb-4">
              <CheckCircle className="w-12 h-12 text-green-600" />
            </div>
            <p className="text-gray-800 font-medium mb-2">Password set successfully!</p>
            <p className="text-sm text-gray-600 mb-6">
              You can now log in to the Church Portal with your email and new password.
            </p>
            <Button onClick={() => navigate('/login')}>Go to Login</Button>
          </div>
        )}

        {!validating && !tokenError && !success && (
          <>
            <p className="text-sm text-gray-600 text-center mb-6">
              {churchName ? (
                <>
                  Welcome, <span className="font-semibold">{churchName}</span>! Set a password for{' '}
                  <span className="font-semibold">{email}</span> to access your church portal.
                </>
              ) : (
                <>
                  Set a password for <span className="font-semibold">{email}</span> to access
                  your church portal.
                </>
              )}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    placeholder="At least 8 characters"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm Password
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  placeholder="Re-enter your password"
                />
              </div>

              {submitError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start">
                  <AlertCircle className="w-4 h-4 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-red-800">{submitError}</div>
                </div>
              )}

              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? (
                  <span className="flex items-center justify-center">
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Setting password...
                  </span>
                ) : (
                  'Set Password'
                )}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default SetPassword;
