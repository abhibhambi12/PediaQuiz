import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    getAuth, 
    signInWithPopup, 
    GoogleAuthProvider, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword 
} from 'firebase/auth';
import { app } from '@/firebase';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/contexts/AuthContext';

const AuthPage: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSignUp, setIsSignUp] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    
    const navigate = useNavigate();
    const { addToast } = useToast();
    const auth = getAuth(app);
    const googleProvider = new GoogleAuthProvider();
    const { user, loading: authLoading } = useAuth();

    useEffect(() => {
        if (!authLoading && user) {
            navigate('/');
        }
    }, [user, authLoading, navigate]);

    const handleAuthError = (error: any) => {
        let message = 'An unknown error occurred. Please try again.';
        if (error.code) {
            switch (error.code) {
                case 'auth/user-not-found':
                case 'auth/wrong-password':
                case 'auth/invalid-credential':
                    message = 'Invalid credentials. Please check your email and password.';
                    break;
                case 'auth/email-already-in-use':
                    message = 'An account with this email already exists. Please log in.';
                    break;
                case 'auth/weak-password':
                    message = 'Password is too weak. Please choose a stronger password (at least 6 characters).';
                    break;
                case 'auth/invalid-email':
                    message = 'Invalid email address format.';
                    break;
                case 'auth/operation-not-allowed':
                    message = 'Email/Password sign-in is not enabled. Please contact support.';
                    break;
                default:
                    message = error.message;
            }
        }
        addToast(message, 'danger');
    };
    
    const handleGoogleSignIn = async () => {
        setIsLoading(true);
        try {
            await signInWithPopup(auth, googleProvider);
            addToast('Welcome back!', 'success');
        } catch (error) {
            handleAuthError(error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            if (isSignUp) {
                await createUserWithEmailAndPassword(auth, email, password);
                addToast('Account created successfully!', 'success');
            } else {
                await signInWithEmailAndPassword(auth, email, password);
                addToast('Welcome back!', 'success');
            }
        } catch (error) {
            handleAuthError(error);
        } finally {
            setIsLoading(false);
        }
    };

    if (authLoading) {
        return <div className="flex items-center justify-center min-h-screen">Loading authentication...</div>;
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-slate-100 dark:bg-slate-950">
            <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-xl shadow-lg dark:bg-slate-800 border dark:border-slate-700">
                <h1 className="text-3xl font-bold text-center text-sky-600 dark:text-sky-400">PediaQuiz</h1>
                <h2 className="text-xl font-bold text-center text-slate-800 dark:text-slate-200">
                    {isSignUp ? 'Create an Account' : 'Welcome Back'}
                </h2>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                    <input
                        type="email"
                        placeholder="Email Address"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="w-full px-4 py-2 border rounded-md dark:bg-slate-700 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500"
                        disabled={isLoading}
                    />
                    <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="w-full px-4 py-2 border rounded-md dark:bg-slate-700 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500"
                        disabled={isLoading}
                    />
                    <button type="submit" className="w-full py-2.5 text-white bg-sky-600 rounded-md hover:bg-sky-700 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed" disabled={isLoading}>
                        {isLoading ? 'Processing...' : (isSignUp ? 'Sign Up' : 'Log In')}
                    </button>
                </form>

                <p className="text-sm text-center text-slate-600 dark:text-slate-400">
                    {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
                    <button type="button" onClick={() => setIsSignUp(!isSignUp)} className="font-medium text-sky-600 hover:underline">
                        {isSignUp ? 'Log In' : 'Sign Up'}
                    </button>
                </p>
                
                <div className="relative flex items-center">
                    <div className="flex-grow border-t border-slate-300 dark:border-slate-600"></div>
                    <span className="flex-shrink mx-4 text-slate-400 text-sm">OR</span>
                    <div className="flex-grow border-t border-slate-300 dark:border-slate-600"></div>
                </div>
                
                <button onClick={handleGoogleSignIn} className="w-full py-2.5 flex items-center justify-center gap-2 border border-slate-300 dark:border-slate-600 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50" disabled={isLoading}>
                    <svg className="w-5 h-5" viewBox="0 0 48 48">
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.42-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                        <path fill="none" d="M0 0h48v48H0z"></path>
                    </svg>
                    Sign In with Google
                </button>
            </div>
        </div>
    );
};

export default AuthPage;