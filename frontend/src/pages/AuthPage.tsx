// frontend/src/pages/AuthPage.tsx
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Loader from '@/components/Loader';
import { useToast } from '@/components/Toast';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '@/firebase';

const AuthPage: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLogin, setIsLogin] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
    const navigate = useNavigate();
    const { addToast } = useToast();

    const validate = () => {
        const newErrors: { email?: string; password?: string } = {};
        if (!email) newErrors.email = "Email is required.";
        else if (!/\S+@\S+\.\S+/.test(email)) newErrors.email = "Email is invalid.";
        if (!password) newErrors.password = "Password is required.";
        else if (password.length < 6 && !isLogin) newErrors.password = "Password must be at least 6 characters.";
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validate()) return;
        setIsLoading(true);
        try {
            if (isLogin) {
                await signInWithEmailAndPassword(auth, email, password);
            } else {
                await createUserWithEmailAndPassword(auth, email, password);
            }
            navigate('/');
        } catch (error: any) {
            addToast(error.message, "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handleGoogleSignIn = async () => {
        setIsLoading(true);
        try {
            await signInWithPopup(auth, new GoogleAuthProvider());
            navigate('/');
        } catch (error: any) { addToast(`Google sign-in failed: ${error.message}`, "error"); }
        finally { setIsLoading(false); }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-slate-100 dark:bg-slate-900 p-4">
            <div className="card-base p-8 w-full max-w-sm">
                <h2 className="text-3xl font-bold mb-6 text-center">{isLogin ? 'Welcome Back' : 'Join PediaQuiz'}</h2>
                
                {isLoading ? <Loader message={isLogin ? "Logging in..." : "Creating account..."} /> : (
                    <>
                        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                            <div>
                                <label htmlFor="email" className="sr-only">Email Address</label>
                                <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-field" placeholder="Email Address" required autoComplete="email" aria-invalid={!!errors.email} />
                                {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email}</p>}
                            </div>
                            <div>
                                <label htmlFor="password"className="sr-only">Password</label>
                                <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input-field" placeholder="Password" required autoComplete={isLogin ? "current-password" : "new-password"} aria-invalid={!!errors.password} />
                                {errors.password && <p className="text-red-500 text-sm mt-1">{errors.password}</p>}
                            </div>
                            <button type="submit" className="btn-primary w-full py-2.5">{isLogin ? 'Login' : 'Sign Up'}</button>
                        </form>

                        <div className="mt-6 text-center text-sm">
                            <Link to="/forgot-password" className="text-sky-600 dark:text-sky-400 hover:underline">Forgot Password?</Link>
                            <div className="relative flex py-5 items-center"><div className="flex-grow border-t border-slate-300 dark:border-slate-600"></div><span className="flex-shrink mx-4 text-slate-400 text-xs uppercase">Or</span><div className="flex-grow border-t border-slate-300 dark:border-slate-600"></div></div>
                            <button onClick={handleGoogleSignIn} className="btn-neutral w-full flex items-center justify-center">
                                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google logo" className="h-5 w-5 mr-3" />
                                Sign {isLogin ? 'in' : 'up'} with Google
                            </button>
                            <p className="mt-4">
                                {isLogin ? "Need an account? " : "Already have an account? "}
                                <button onClick={() => setIsLogin(!isLogin)} className="font-semibold text-sky-600 dark:text-sky-400 hover:underline">
                                    {isLogin ? 'Sign Up' : 'Login'}
                                </button>
                            </p>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default AuthPage;