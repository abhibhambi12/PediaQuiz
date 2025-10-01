// frontend/src/pages/ForgotPasswordPage.tsx
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '@/components/Toast';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/firebase';
import Loader from '@/components/Loader';

const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { addToast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email) {
      setError('Please enter your email address.');
      return;
    }
    setIsLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setIsSent(true);
    } catch (error: any) {
      addToast(error.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-100 dark:bg-slate-900 p-4">
      <div className="card-base p-8 w-full max-w-sm">
        <h2 className="text-3xl font-bold mb-6 text-center">Reset Password</h2>
        
        {isLoading ? <Loader message="Sending..." /> : isSent ? (
          <div className="text-center">
            <p className="text-slate-600 dark:text-slate-400">
              A password reset link has been sent to <span className="font-semibold">{email}</span>. Please check your inbox.
            </p>
            <Link to="/auth" className="btn-primary mt-6 w-full">
              Back to Login
            </Link>
          </div>
        ) : (
          <>
            <p className="text-center text-slate-500 mb-4">
              Enter your email address and we'll send you a link to reset your password.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div>
                <label htmlFor="email" className="sr-only">Email Address</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field"
                  placeholder="Email Address"
                  required
                  autoComplete="email"
                  aria-invalid={!!error}
                />
                {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
              </div>
              <button type="submit" className="btn-primary w-full py-2.5">
                Send Reset Link
              </button>
            </form>
            <div className="mt-6 text-center text-sm">
              <Link to="/auth" className="font-semibold text-sky-600 dark:text-sky-400 hover:underline">
                Back to Login
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ForgotPasswordPage;