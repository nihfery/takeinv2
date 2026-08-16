'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { currentProvider, loginProvider, registerProvider } from './api';

const providerDashboardUrl = process.env.NEXT_PUBLIC_PROVIDER_DASHBOARD_URL || 'http://127.0.0.1:5175/provider/dashboard';
const providerVerificationUrl = process.env.NEXT_PUBLIC_PROVIDER_VERIFICATION_URL || 'http://127.0.0.1:5175/provider/verification';
const providerLoginUrl = process.env.NEXT_PUBLIC_PROVIDER_LOGIN_URL || 'http://127.0.0.1:5175/provider/login';

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function refreshProjectedProviderSession(email, password) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
        if (attempt > 0) await wait(500);
        const current = await currentProvider();
        if (current?.user?.provider_id) return loginProvider({ email, password });
    }
    return loginProvider({ email, password });
}

export default function Register() {
    const [isLogin, setIsLogin] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [showLoginPassword, setShowLoginPassword] = useState(false);
    const [showRegisterPassword, setShowRegisterPassword] = useState(false);

    const formContainerRef = useRef(null);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            if (params.get('mode') === 'login' || params.get('login') === '1' || params.get('login') === 'failed') {
                window.location.replace(providerLoginUrl);
                return;
            }
            if (params.get('login_error')) {
                setError(params.get('login_error'));
            }
            if (params.get('login_email')) {
                setEmail(params.get('login_email'));
            }
        }
    }, []);

    useEffect(() => {
        if (formContainerRef.current) {
            formContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }, [isLogin]);

    const toggleMode = (e) => {
        e.preventDefault();
        if (!isLogin) {
            window.location.assign(providerLoginUrl);
            return;
        }
        setIsLogin(!isLogin);
        setError('');
        setMessage('');
        setEmail('');
        setPassword('');
    };

    const handleLoginSubmit = async (e) => {
        e.preventDefault();
        if (isSubmitting) return;
        setIsSubmitting(true);
        setError('');
        setMessage('');
        try {
            const result = await loginProvider({ email: email.trim(), password });
            const projected = await refreshProjectedProviderSession(email, password);
            sessionStorage.setItem('takein_provider_user', JSON.stringify(projected?.user || result.user || {}));
            window.location.assign(providerDashboardUrl);
        } catch (err) {
            setError(err.message || 'Login gagal. Periksa email dan password.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleRegisterSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError('');
        setMessage('');

        const username = email.split('@')[0]?.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase() || `mitra${Date.now().toString().slice(-5)}`;

        try {
            const result = await registerProvider('/api/auth/register/provider', {
                first_name: 'Partner',
                last_name: 'JasaKu',
                username: username,
                email: email,
                country_code: '+62',
                phone_number: '080000000000',
                password: password,
                password_confirmation: password,
            });

            sessionStorage.setItem('takein_provider_user', JSON.stringify(result.user || {}));
            setMessage('Pendaftaran berhasil. Membuka halaman verifikasi mitra...');
            const destination = new URL(providerLoginUrl, window.location.origin);
            destination.searchParams.set('registered', '1');
            destination.searchParams.set('email', email);
            destination.searchParams.set('next', new URL(providerVerificationUrl, window.location.origin).pathname);
            window.location.assign(destination.toString());
        } catch (err) {
            setError(err.message || 'Failed to register. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="register-page-container">
            {/* Premium Floating Back Button */}
            <a href="/" className="back-btn" aria-label="Back to home">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
                <span>Back</span>
            </a>

            <motion.div 
                layout 
                className="register-card" 
                style={{ flexDirection: isLogin ? 'row-reverse' : 'row' }}
            >
                {/* Image Section */}
                <motion.div layout className="register-image-section" transition={{ duration: 0.6, type: "spring", bounce: 0.2 }}>
                    <AnimatePresence mode="wait">
                        <motion.div 
                            key={isLogin ? 'login-img' : 'register-img'}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.4 }}
                            style={{ 
                                position: 'absolute', 
                                top: 12, left: 12, 
                                width: 'calc(100% - 24px)', 
                                height: 'calc(100% - 24px)',
                                borderRadius: '20px',
                                overflow: 'hidden'
                            }}
                        >
                            <img 
                                src={isLogin ? "/images/login_bg.png" : "/images/register_bg.png"} 
                                alt={isLogin ? "Modern Salon Management" : "Manual Salon Management"} 
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                        </motion.div>
                    </AnimatePresence>
                </motion.div>

                {/* Form Section */}
                <motion.div ref={formContainerRef} layout className="register-form-section" transition={{ duration: 0.6, type: "spring", bounce: 0.2 }}>
                    <div className="register-header">
                        <a href="/" className="register-brand">JASAKU</a>
                    </div>

                    <div className="register-form-content" style={{ position: 'relative' }}>
                        <AnimatePresence mode="wait">
                            {isLogin ? (
                                <motion.div 
                                    key="login"
                                    initial={{ opacity: 0, x: -30 }} 
                                    animate={{ opacity: 1, x: 0 }} 
                                    exit={{ opacity: 0, x: 30 }}
                                    transition={{ duration: 0.3 }}
                                >
                                    <h2>Partner Login</h2>
                                    <p className="register-subtitle">Welcome back! Enter your details to log in to your account</p>

                                    {error && <div className="register-alert error">{error}</div>}
                                    {message && <div className="register-alert success">{message}</div>}

                                    <form onSubmit={handleLoginSubmit} className="register-form">
                                        <div className="form-group">
                                            <label>Email</label>
                                            <input 
                                                type="email" 
                                                placeholder="nama@email.com" 
                                                value={email}
                                                onChange={(event) => setEmail(event.target.value)}
                                                required 
                                            />
                                        </div>
                                        
                                        <div className="form-group">
                                            <label>Password</label>
                                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                                <input 
                                                    type={showLoginPassword ? "text" : "password"} 
                                                    placeholder="********" 
                                                    value={password}
                                                    onChange={(event) => setPassword(event.target.value)}
                                                    required 
                                                    style={{ width: '100%', paddingRight: '48px' }}
                                                />
                                                <button 
                                                    type="button" 
                                                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                                                    style={{ position: 'absolute', right: '12px', background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', display: 'flex' }}
                                                >
                                                    {showLoginPassword ? (
                                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                                                    ) : (
                                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                                    )}
                                                </button>
                                            </div>
                                        </div>

                                        <div className="form-options">
                                            <label className="checkbox-label">
                                                <input type="checkbox" name="remember" value="1" />
                                                <span>Remember me</span>
                                            </label>
                                            <a href="#" className="forgot-password">Forgot Password?</a>
                                        </div>

                                        <button type="submit" className="btn-primary">
                                            Login to Dashboard
                                        </button>
                                        <p style={{ margin: '16px 0 0 0', fontSize: '13px', color: 'var(--muted)', textAlign: 'center' }}>
                                            After successful login, you will be redirected to the provider dashboard.
                                        </p>
                                    </form>

                                    <div className="login-link">
                                        Don't have an account? <a href="#" onClick={toggleMode}>Create one</a>
                                    </div>
                                </motion.div>
                            ) : (
                                <motion.div 
                                    key="register"
                                    initial={{ opacity: 0, x: 30 }} 
                                    animate={{ opacity: 1, x: 0 }} 
                                    exit={{ opacity: 0, x: -30 }}
                                    transition={{ duration: 0.3 }}
                                >
                                    <h2>Create your account</h2>
                                    <p className="register-subtitle">Welcome! Enter your details to create your partner account</p>

                                    {error && <div className="register-alert error">{error}</div>}
                                    {message && <div className="register-alert success">{message}</div>}

                                    <form onSubmit={handleRegisterSubmit} className="register-form">
                                        <div className="form-group">
                                            <label>Email</label>
                                            <input 
                                                type="email" 
                                                placeholder="Enter your email" 
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                required 
                                                disabled={isSubmitting}
                                            />
                                        </div>

                                        <div className="form-group">
                                            <label>Password</label>
                                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                                <input 
                                                    type={showRegisterPassword ? "text" : "password"} 
                                                    placeholder="Enter your password" 
                                                    value={password}
                                                    onChange={(e) => setPassword(e.target.value)}
                                                    required 
                                                    disabled={isSubmitting}
                                                    style={{ width: '100%', paddingRight: '48px' }}
                                                />
                                                <button 
                                                    type="button" 
                                                    onClick={() => setShowRegisterPassword(!showRegisterPassword)}
                                                    style={{ position: 'absolute', right: '12px', background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', display: 'flex' }}
                                                >
                                                    {showRegisterPassword ? (
                                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                                                    ) : (
                                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                                    )}
                                                </button>
                                            </div>
                                        </div>

                                        <div className="form-options">
                                            <label className="checkbox-label">
                                                <input type="checkbox" />
                                                <span>Remember me</span>
                                            </label>
                                        </div>

                                        <button type="submit" className="btn-primary" disabled={isSubmitting}>
                                            {isSubmitting ? 'Creating account...' : 'Create Account'}
                                        </button>
                                    </form>

                                    <div className="divider">
                                        <span>Or continue with</span>
                                    </div>

                                    <div className="social-login-buttons">
                                        <button type="button" className="btn-social">
                                            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                                                <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/>
                                            </svg>
                                            Sign in with Apple
                                        </button>
                                        <button type="button" className="btn-social">
                                            <svg viewBox="0 0 24 24" width="20" height="20">
                                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                                            </svg>
                                            Sign in with Google
                                        </button>
                                    </div>

                                    <div className="login-link">
                                        Already have an account? <a href="#" onClick={toggleMode}>Login</a>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </motion.div>
            </motion.div>
        </div>
    );
}
