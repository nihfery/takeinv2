'use client';

import { useEffect, useState } from 'react';
import { currentProvider, loginProvider, registerProvider } from './api';
import { Icon } from './components/Icons.jsx';

// Import New Sections
import HeroSection from './sections/HeroSection.jsx';
import PartnerMarquee from './sections/PartnerMarquee.jsx';
import CategoriesSection from './sections/CategoriesSection.jsx';
import StorytellingSection from './sections/StorytellingSection.jsx';
import WebAppSimulatorSection from './sections/WebAppSimulatorSection.jsx';
import StatsStripSection from './sections/StatsStripSection.jsx';
import BusinessImpactSection from './sections/BusinessImpactSection.jsx';
import BenefitsSection from './sections/BenefitsSection.jsx';
import FeatureGridSection from './sections/FeatureGridSection.jsx';
import TransformationSection from './sections/TransformationSection.jsx';
import StatisticsSection from './sections/StatisticsSection.jsx';
import TestimonialsSection from './sections/TestimonialsSection.jsx';
import FAQSection from './sections/FAQSection.jsx';
import PricingSection from './sections/PricingSection.jsx';
import ContactSection from './sections/ContactSection.jsx';
import FinalCTA from './sections/FinalCTA.jsx';

// --- Preserve Existing Logic & Config ---
function normalizeUrl(url) {
    return String(url || '').replace(/\/$/, '');
}

function currentHostname() {
    return typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1';
}

const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1']);

function isLoopbackHost(hostname) {
    return loopbackHosts.has(String(hostname || '').toLowerCase());
}

function localizeLoopbackUrl(url) {
    const normalized = normalizeUrl(url);
    try {
        const parsed = new URL(normalized);
        const hostname = currentHostname();
        if (!isLoopbackHost(hostname) && isLoopbackHost(parsed.hostname)) {
            parsed.hostname = hostname;
        }
        return normalizeUrl(parsed.toString());
    } catch {
        return normalized;
    }
}

function localBackendUrl() {
    return typeof window !== 'undefined' ? window.location.origin : '';
}

const backendUrl = localizeLoopbackUrl((typeof process !== 'undefined' && process.env.NEXT_PUBLIC_BACKEND_URL) || localBackendUrl());
const apiBaseUrl = '/api';
const providerLoginPath = (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_PROVIDER_LOGIN_PATH) || '/register?mode=login';
const providerConsoleLoginUrl = localizeLoopbackUrl(
    (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_PROVIDER_LOGIN_URL)
    || 'http://127.0.0.1:5175/provider/login',
);
const providerDashboardUrl = localizeLoopbackUrl(
    (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_PROVIDER_DASHBOARD_URL)
    || 'http://127.0.0.1:5175/provider/dashboard',
);
const providerVerificationUrl = localizeLoopbackUrl(
    (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_PROVIDER_VERIFICATION_URL)
    || 'http://127.0.0.1:5175/provider/verification',
);

const query = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();

const config = {
    loginUrl: `${backendUrl}${providerLoginPath}`,
    dashboardUrl: providerDashboardUrl,
    registerApiUrl: `${apiBaseUrl}/auth/register/provider`,
    docsUrl: '/docs/api',
    adminLoginUrl: '/admin/login',
    openLogin: ['failed', 'open', '1'].includes(query.get('login')),
    openRegister: ['open', '1'].includes(query.get('register')),
    flash: {
        error: query.get('login_error') || '',
        success: query.get('success') || '',
    },
};

const emptyRegisterForm = {
    fullName: '',
    username: '',
    email: '',
    phone: '',
    password: '',
    passwordConfirmation: '',
};

function splitName(fullName) {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    const firstName = parts.shift() || '';
    const lastName = parts.join(' ') || firstName;
    return { firstName, lastName };
}

function usernameFromEmail(email) {
    const base = email.split('@')[0]?.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
    return base || `mitra${Date.now().toString().slice(-5)}`;
}

// --- Main App Component ---
function App() {
    const [isLoginOpen, setLoginOpen] = useState(Boolean(config.openLogin));
    const [isRegisterOpen, setRegisterOpen] = useState(Boolean(config.openRegister));
    const [isScrolled, setScrolled] = useState(false);
    const [registerForm, setRegisterForm] = useState(emptyRegisterForm);
    const [registerErrors, setRegisterErrors] = useState({});
    const [registerMessage, setRegisterMessage] = useState('');
    const [isRegistering, setRegistering] = useState(false);

    useEffect(() => {
        if (config.openLogin || config.flash.error) {
            const destination = new URL(providerConsoleLoginUrl, window.location.origin);
            if (config.flash.error) {
                destination.searchParams.set('login_error', config.flash.error);
            }
            window.location.href = destination.toString();
            return;
        }

        const handleScroll = () => {
            setScrolled(window.scrollY > 20);
        };handleScroll();
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    function openRegister(prefill = {}) {
        window.location.href = '/register';
    }

    function openLogin() {
        window.location.href = providerConsoleLoginUrl;
    }

    function updateRegisterField(field, value) {
        setRegisterForm((current) => ({ ...current, [field]: value }));
    }

    async function submitRegister(event) {
        event.preventDefault();
        setRegistering(true);
        setRegisterErrors({});
        setRegisterMessage('');

        const { firstName, lastName } = splitName(registerForm.fullName);

        try {
            const result = await registerProvider(config.registerApiUrl || '/api/auth/register/provider', {
                first_name: firstName,
                last_name: lastName,
                username: registerForm.username || usernameFromEmail(registerForm.email),
                email: registerForm.email,
                country_code: '+62',
                phone_number: registerForm.phone,
                password: registerForm.password,
                password_confirmation: registerForm.passwordConfirmation,
            });

            for (let attempt = 0; attempt < 8; attempt += 1) {
                if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 500));
                const current = await currentProvider();
                if (current?.user?.provider_id) break;
            }
            await loginProvider({ email: registerForm.email, password: registerForm.password });
            setRegisterMessage('Pendaftaran berhasil. Membuka halaman verifikasi mitra...');
            const destination = new URL(providerConsoleLoginUrl, window.location.origin);
            destination.searchParams.set('registered', '1');
            destination.searchParams.set('email', registerForm.email);
            destination.searchParams.set('next', new URL(providerVerificationUrl, window.location.origin).pathname);
            window.location.assign(destination.toString());
        } catch (error) {
            setRegisterErrors(error.errors || { form: [error.message] });
        } finally {
            setRegistering(false);
        }
    }

    return (
        <div className="provider-landing">
            <Header
                isScrolled={isScrolled}
                onLogin={() => openLogin()}
                onRegister={() => openRegister()}
            />

            {config.flash?.error && <div className="flash-message error">{config.flash.error}</div>}
            {config.flash?.success && <div className="flash-message success">{config.flash.success}</div>}

            <main>
                <HeroSection onRegister={() => openRegister()} />
                <PartnerMarquee />
                <CategoriesSection />
                <WebAppSimulatorSection />
                <StatsStripSection />
                <BusinessImpactSection />
                <StorytellingSection />
                <BenefitsSection />
                <FeatureGridSection />
                <TransformationSection />
                <StatisticsSection />
                <TestimonialsSection />
                <PricingSection />
                <FAQSection />
                <ContactSection />
                <FinalCTA onRegister={() => openRegister()} />
            </main>

            <Footer />

            <button className="chat-fab" type="button" aria-label="Chat Support">
                <Icon name="headset" size={24} />
            </button>


        </div>
    );
}

// --- Preserved (but restyled) UI Components ---
function Header({ isScrolled, onLogin, onRegister }) {
    const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [activeDropdown, setActiveDropdown] = useState(null);

    // Prevent scrolling when mobile menu is open
    useEffect(() => {
        if (isMobileMenuOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'auto';
        }
        return () => { document.body.style.overflow = 'auto'; };
    }, [isMobileMenuOpen]);

    const businessTypes = [
        "Salon", "Barbershop", "Nails", "Spa & Sauna", 
        "Medical Spa", "Massage", "Fitness & Recovery", 
        "Physical Therapy", "Health Practice", "Tattoo & Piercing", 
        "Pet Grooming", "Tanning Studio"
    ];

    return (
        <>
            <header className={`site-header-new ${isScrolled ? 'is-scrolled' : ''}`}>
                <div className="header-container-new">
                    
                    {/* Left: Logo & Nav */}
                    <div className="header-left-new">
                        <a className="brand-new" href="/" aria-label="JasaKu Mitra">
                            JASAKU
                        </a>
                        
                        <nav className="main-nav-new hide-on-mobile">
                            <div 
                                className="dropdown-trigger-new"
                                onMouseEnter={() => setActiveDropdown('business')} 
                                onMouseLeave={() => setActiveDropdown(null)}
                            >
                                <span className="nav-link-new">Business Type</span>
                                
                                {activeDropdown === 'business' && (
                                    <div className="dropdown-menu-new">
                                        <div className="dropdown-grid-new">
                                            {businessTypes.map(biz => (
                                                <a key={biz} href="#businesses" className="dropdown-item-new">{biz}</a>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <a href="#fitur" className="nav-link-new">Features</a>
                            <a href="#harga" className="nav-link-new">Pricing</a>
                        </nav>
                    </div>

                    {/* Right: Actions */}
                    <div className="header-right-new">
                        <a href="#" className="btn-marketplace-new hide-on-mobile">
                            <Icon name="store" size={18} /> Marketplace
                        </a>
                        <button className="btn-dark-new hide-on-mobile" onClick={onRegister}>Register</button>
                        
                        <button 
                            className="btn-menu-new"
                            onClick={() => setMobileMenuOpen(!isMobileMenuOpen)}
                        >
                            <span>Menu</span>
                            <Icon name={isMobileMenuOpen ? "close" : "list"} size={20} />
                        </button>
                    </div>
                </div>
            </header>

            {/* Mobile Nav Overlay */}
            <div className={`mobile-nav-overlay-new ${isMobileMenuOpen ? 'is-open' : ''}`}>
                <div style={{ padding: '24px' }}>
                    <a href="#businesses" className="mobile-link-new" onClick={() => setMobileMenuOpen(false)}>Business Type</a>
                    <a href="#fitur" className="mobile-link-new" onClick={() => setMobileMenuOpen(false)}>Features</a>
                    <a href="#harga" className="mobile-link-new" onClick={() => setMobileMenuOpen(false)}>Pricing</a>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '32px' }}>
                        <button className="btn-dark-new" style={{ width: '100%', justifyContent: 'center' }} onClick={() => { setMobileMenuOpen(false); onRegister(); }}>Register for Free</button>
                        <button className="btn-marketplace-new" style={{ width: '100%', justifyContent: 'center' }} onClick={() => { setMobileMenuOpen(false); onLogin(); }}>Log in</button>
                    </div>
                </div>
            </div>
        </>
    );
}

function Footer() {
    return (
        <footer className="footer-new">
            <div className="footer-container-new">
                <div className="footer-top-new">
                    <div className="footer-brand-col">
                        <a className="brand-new" href="/">JASAKU</a>
                        <p className="footer-desc-new">An integrated platform to smartly manage schedules, payments, and operations for your service business.</p>
                        <div className="footer-socials">
                            <Icon name="message-circle" size={24} />
                            <Icon name="share-2" size={24} />
                        </div>
                    </div>
                    
                    <div className="footer-links-col">
                        <h4 className="footer-heading">Product</h4>
                        <a href="#">Key Features</a>
                        <a href="#">Pricing</a>
                        <a href="#">Marketplace</a>
                        <a href="#">Hardware (POS)</a>
                    </div>
                    
                    <div className="footer-links-col">
                        <h4 className="footer-heading">Business Solutions</h4>
                        <a href="#">Salon & Hair</a>
                        <a href="#">Spa & Relaxation</a>
                        <a href="#">Beauty Clinic</a>
                        <a href="#">Fitness Studio</a>
                        <a href="#">Pet Grooming</a>
                    </div>
                    
                    <div className="footer-links-col">
                        <h4 className="footer-heading">Support</h4>
                        <a href="#">Help Center</a>
                        <a href="#">Partner Community</a>
                        <a href="#">API Documentation</a>
                        <a href="#">System Status</a>
                    </div>
                </div>
                
                <div className="footer-bottom-new">
                    <p>© 2026 JasaKu Inc. All Rights Reserved.</p>
                    <div className="footer-legal">
                        <a href="#">Privacy</a>
                        <a href="#">Terms & Conditions</a>
                    </div>
                </div>
            </div>
        </footer>
    );
}



function RegisterModal({ form, errors, message, isSubmitting, onClose, onChange, onSubmit }) {
    return (
        <Modal title="Register Partner" onClose={onClose}>
            <form className="modal-form two-column" onSubmit={onSubmit}>
                {errors.form?.[0] && <div className="form-alert">{errors.form[0]}</div>}
                {message && <div className="form-alert success">{message}</div>}
                <label>
                    Full Name
                    <input value={form.fullName} onChange={(event) => onChange('fullName', event.target.value)} required placeholder="e.g. John Doe" />
                    {errors.first_name?.[0] && <span className="field-error">{errors.first_name[0]}</span>}
                </label>
                <label>
                    Username (Optional)
                    <input value={form.username} onChange={(event) => onChange('username', event.target.value)} placeholder="can be left blank" />
                    {errors.username?.[0] && <span className="field-error">{errors.username[0]}</span>}
                </label>
                <label>
                    Email
                    <input type="email" value={form.email} onChange={(event) => onChange('email', event.target.value)} required placeholder="budi@salon.com" />
                    {errors.email?.[0] && <span className="field-error">{errors.email[0]}</span>}
                </label>
                <label>
                    WhatsApp Number
                    <input value={form.phone} onChange={(event) => onChange('phone', event.target.value)} required placeholder="081234567890" />
                    {errors.phone_number?.[0] && <span className="field-error">{errors.phone_number[0]}</span>}
                </label>
                <label>
                    Password
                    <input type="password" value={form.password} onChange={(event) => onChange('password', event.target.value)} required placeholder="********" />
                    {errors.password?.[0] && <span className="field-error">{errors.password[0]}</span>}
                </label>
                <label>
                    Confirm Password
                    <input type="password" value={form.passwordConfirmation} onChange={(event) => onChange('passwordConfirmation', event.target.value)} required placeholder="********" />
                </label>
                <div className="wide">
                    <button className="btn dark-pill" type="submit" disabled={isSubmitting} style={{ width: '100%', height: '56px' }}>
                        {isSubmitting ? 'Registering...' : 'Register as Partner'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}

function Modal({ title, children, onClose }) {
    return (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
            <div className="modal-card">
                <div className="modal-header">
                    <h2>{title}</h2>
                    <button type="button" onClick={onClose} aria-label="Close">
                        <Icon name="close" size={20} />
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}

export default App;
