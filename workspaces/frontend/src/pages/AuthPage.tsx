import React, { useState } from 'react';
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

const AuthPage: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSignUp, setIsSignUp] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    
    const navigate = useNavigate();
    const { addToast } = useToast();
    const auth = getAuth(app);
    const googleProvider = new GoogleAuthProvider();

    const handleAuthError = (error: any) => {
        console.error('Authentication Error:', error);
        let message = 'An unknown error occurred. Please try again.';
        if (error.code) {
            switch (error.code) {
                case 'auth/user-not-found':
                case 'auth/wrong-password':
                    message = 'Invalid credentials. Please check your email and password.';
                    break;
                case 'auth/email-already-in-use':
                    message = 'An account with this email already exists. Please log in.';
                    break;
                case 'auth/weak-password':
                    message = 'Password is too weak. Please choose a stronger password.';
                    break;
                default:
                    message = error.message;
            }
        }
        addToast(message, 'error');
    };
    
    const handleGoogleSignIn = async () => {
        setIsLoading(true);
        try {
            await signInWithPopup(auth, googleProvider);
            navigate('/');
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
            navigate('/');
        } catch (error) {
            handleAuthError(error);
        } finally {
            setIsLoading(false);
        }
    };

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
                    Sign In with Google
                </button>
            </div>
        </div>
    );
};

export default AuthPage;