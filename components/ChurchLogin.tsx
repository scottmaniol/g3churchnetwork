import React, { useState } from 'react';
import { Button } from './Button';
import { ArrowLeft, Church } from 'lucide-react';
import { loginAsChurch, auth } from '../services/firebase';
import { sendPasswordResetEmail } from 'firebase/auth';

interface ChurchLoginProps {
  onBack: () => void;
  onLoginSuccess: (userId: string) => void;
}

export const ChurchLogin: React.FC<ChurchLoginProps> = ({ onBack, onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const userCredential = await loginAsChurch(email, password);
      onLoginSuccess(userCredential.user.uid);
    } catch (err: any) {
      console.error('Church login error:', err);
      
      let errorMessage = 'Failed to sign in. Please check your credentials.';
      
      if (err.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email address.';
      } else if (err.code === 'auth/wrong-password') {
        errorMessage = 'Incorrect password.';
      } else if (err.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address.';
      } else if (err.code === 'auth/too-many-requests') {
        errorMessage = 'Too many failed attempts. Please try again later.';
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white p-8 rounded-xl shadow-xl max-w-md w-full">
        <button 
          onClick={onBack}
          className="mb-6 flex items-center text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Home
        </button>

        <div className="bg-black w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
          <Church className="w-8 h-8 text-white" />
        </div>

        <h2 className="text-2xl font-serif font-bold text-gray-900 mb-2 text-center">
          Church Portal
        </h2>
        <p className="text-gray-600 mb-6 text-center">
          Sign in to manage your church profile
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2 bg-white text-black"
              placeholder="church@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black border p-2 bg-white text-black"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="text-red-600 text-sm bg-red-50 p-3 rounded">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" isLoading={loading}>
            Sign In
          </Button>
        </form>

        <div className="mt-4 text-center">
          <button
            onClick={async () => {
              if (email) {
                try {
                  await sendPasswordResetEmail(auth, email);
                  alert('Password reset email sent! Check your inbox.');
                } catch (err: any) {
                  console.error('Forgot password error:', err);
                  alert(`Failed to send password reset email: ${err.message}`);
                }
              } else {
                alert('Please enter your email address to reset your password.');
              }
            }}
            className="text-sm text-black font-medium hover:underline"
            type="button"
          >
            Forgot Password?
          </button>
        </div>

        <div className="mt-6 text-center text-sm text-gray-600">
          Don't have an account?{' '}
          <button
            onClick={onBack}
            className="text-black font-medium hover:underline"
            type="button"
          >
            Apply to join the network
          </button>
        </div>
      </div>
    </div>
  );
};
