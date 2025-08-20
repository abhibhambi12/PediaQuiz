// frontend/pages/AuthPage.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Loader from '@/components/Loader';
import { useToast } from '@/components/Toast';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '@/firebase';

const AuthPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false); // Manually manage loading state for forms
  const navigate = useNavigate();
  const { addToast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true); // Start loading immediately for form submission
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
        addToast("Logged in successfully!", "success");
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
        addToast("Account created successfully! Please log in.", "success");
        setIsLogin(true); // Switch to login view after successful signup
      }
      navigate('/'); // Redirect to home on success
    } catch (error: any) {
      console.error('Authentication failed:', error);
      let errorMessage = "Authentication failed. Please try again.";
      if (error.code) {
        switch (error.code) {
          case 'auth/invalid-email':
            errorMessage = 'Invalid email address format.';
            break;
          case 'auth/user-disabled':
            errorMessage = 'This account has been disabled.';
            break;
          case 'auth/user-not-found':
            errorMessage = 'No user found with this email.';
            break;
          case 'auth/wrong-password':
            errorMessage = 'Incorrect password.';
            break;
          case 'auth/email-already-in-use':
            errorMessage = 'This email is already in use. Try logging in or use a different email.';
            break;
          case 'auth/weak-password':
            errorMessage = 'Password should be at least 6 characters.';
            break;
          case 'auth/too-many-requests':
            errorMessage = 'Too many login attempts. Please try again later.';
            break;
          default:
            errorMessage = `Authentication error: ${error.message}`;
        }
      }
      addToast(errorMessage, "error");
    } finally {
      setIsLoading(false); // Stop loading regardless of success/failure
    }
  };

  // Google OAuth sign-in handler (Feature #1.3)
  const handleGoogleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    try {
      // Perform the signInWithPopup immediately on click to preserve user activation
      await signInWithPopup(auth, provider);
      addToast("Signed in with Google successfully!", "success");
      navigate('/'); // Redirect to home on success
    } catch (error: any) {
      console.error("Google sign-in failed:", error);
      let errorMessage = "Google sign-in failed. Please try again.";
      if (error.code === 'auth/popup-closed-by-user') {
        errorMessage = 'Google sign-in cancelled.';
      } else if (error.code === 'auth/cancelled-popup-request') {
        errorMessage = 'Another Google sign-in popup was already open.';
      } else {
        errorMessage = `Google sign-in error: ${error.message}`;
      }
      addToast(errorMessage, "error");
    } finally {
      // Set isLoading to false only after the popup attempt, if you were managing it for this specific flow.
      // For popups, often you don't show a global loader until the popup is dismissed or successful.
      // If `isLoading` was for button disabling, ensure it's reset.
      // Since it's blocking other buttons on the page, set it true briefly for the duration of the popup.
      // Re-enable this if you want to show a loader during the popup flow.
      // setIsLoading(false); // Or manage this more granularly
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-neutral-100 dark:bg-neutral-900">
      <div className="bg-white dark:bg-slate-800 p-8 rounded-lg shadow-xl w-full max-w-sm border border-slate-200 dark:border-slate-700">
        <h2 className="text-3xl font-bold mb-6 text-center text-slate-800 dark:text-slate-50">
          {isLogin ? 'Welcome Back!' : 'Join PediaQuiz'}
        </h2>
        {/* Only show loader if a form submission is in progress, not blocking for popups */}
        {isLoading && <Loader message={isLogin ? "Logging in..." : "Signing up..."} />}
        {/* Only render form if not globally loading from form submission */}
        {!isLoading && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="your.email@example.com"
                required
                disabled={isLoading}
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                placeholder="********"
                required
                disabled={isLoading}
              />
            </div>
            <button
              type="submit"
              className="btn-primary w-full py-2.5"
              disabled={isLoading}
            >
              {isLogin ? 'Login' : 'Sign Up'}
            </button>
          </form>
        )}
        <div className="mt-6 text-center">
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-sky-600 dark:text-sky-400 hover:underline text-sm"
            disabled={isLoading} // Disable if form submission is active
          >
            {isLogin ? 'Need an account? Sign Up' : 'Already have an account? Login'}
          </button>
          
          {/* Google Sign-in Button (Feature #1.3) */}
          {/* This button should only be disabled if a Google sign-in itself is in progress,
              not tied to the main form's isLoading state directly if you want separate UX.
              For simplicity, keeping it tied for now or removing the disabled prop if it causes issues.
          */}
          <button
            onClick={handleGoogleSignIn}
            className="mt-4 flex items-center justify-center w-full py-2.5 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
            // If isLoading only manages email/password form, this might not need to be disabled by it.
            // Consider a separate `isGoogleLoading` state if desired.
            disabled={isLoading} // Temporarily tied to main isLoading for this fix
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google logo" className="h-5 w-5 mr-2" />
            Sign {isLogin ? 'in' : 'up'} with Google
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;