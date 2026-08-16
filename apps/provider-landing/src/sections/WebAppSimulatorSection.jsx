import { motion, AnimatePresence, useAnimation, useScroll, useTransform } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import { Icon } from '../components/Icons.jsx';

export default function WebAppSimulatorSection() {

    return (
        <section id="simulator" className="section-padding" style={{ background: '#FAFAFA', overflow: 'hidden', paddingBottom: '80px' }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                
                <motion.div
                    style={{ textAlign: 'center', marginBottom: '64px', maxWidth: '800px', margin: '0 auto 64px' }}
                    initial={{ opacity: 0, y: 22 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-100px' }}
                >
                    <p style={{ fontSize: '16px', fontWeight: 600, color: '#6C63FF', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Private Demo
                    </p>
                    <h2 style={{ fontSize: '48px', fontWeight: 500, letterSpacing: '-0.03em', lineHeight: 1.1, color: '#1A1A1A', marginBottom: '24px' }}>
                        Dashboard Overview.
                    </h2>
                    <p style={{ fontSize: '18px', color: '#666', lineHeight: 1.6 }}>
                        Get a sneak peek into the JasaKu Provider Dashboard. Designed for speed, security, and elegance.
                    </p>
                </motion.div>

                {/* Mockup Browser Window - Automatically scales on mobile via CSS transform */}
                <div className="simulator-wrapper" style={{ paddingBottom: '0' }}>
                    <div className="simulator-mockup" style={{ width: '100%', height: 'auto', overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1, isolation: 'isolate', transform: 'translateZ(0)', WebkitMaskImage: '-webkit-radial-gradient(white, black)' }}>
                    
                    {/* Browser Header */}
                    <div style={{ height: '56px', background: '#F3F4F6', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', padding: '0 24px', gap: '12px' }}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#EF4444' }}></div>
                            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#F59E0B' }}></div>
                            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#10B981' }}></div>
                        </div>
                        <div style={{ background: '#E5E7EB', height: '28px', borderRadius: '6px', flex: 1, marginLeft: '24px', maxWidth: '400px', display: 'flex', alignItems: 'center', padding: '0 16px', fontSize: '12px', color: '#9CA3AF' }}>
                            <Icon name="lock" size={12} style={{ marginRight: '8px' }} />
                            admin.jasaku.id/dashboard
                        </div>
                    </div>

                    <div style={{ flex: 1, overflow: 'hidden', borderBottomLeftRadius: '24px', borderBottomRightRadius: '24px', background: '#F9FAFB' }}>
                        <img 
                            src="/images/dashboard-preview.png" 
                            alt="JasaKu Provider Dashboard Preview"
                            style={{ width: '100%', height: 'auto', display: 'block' }}
                        />
                    </div>
                </div>
                </div>
            </div>
        </section>
    );
}

// ==========================================
// DEMO: Real Staff (Next.js preview)
// ==========================================
function DemoRealStaff() {
    return (
        <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}
        >
            <img 
                src="/images/dashboard-preview.png" 
                alt="JasaKu Provider Dashboard Preview"
                style={{ width: '100%', height: 'auto', display: 'block' }}
            />
        </motion.div>
    );
}

// ==========================================
// DEMO 1: Services (The Drag & Drop / Select Cursor)
// ==========================================
function DemoServices() {
    const cursorControls = useAnimation();
    const serviceControls = useAnimation();
    const saveControls = useAnimation();

    useEffect(() => {
        let isMounted = true;
        const runDemo = async () => {
            while (isMounted) {
                // Reset
                await cursorControls.start({ left: '50%', top: '80%', opacity: 0, transition: { duration: 0 } });
                await serviceControls.start({ borderColor: '#E5E7EB', boxShadow: 'none', scale: 1, transition: { duration: 0 } });
                await saveControls.start({ scale: 1, backgroundColor: '#F3F4F6', color: '#9CA3AF', transition: { duration: 0 } });

                // Cursor enters and moves to Nail Art item
                await cursorControls.start({ opacity: 1, left: '30%', top: '220px', transition: { duration: 0.8, ease: "easeOut" } });
                
                // Cursor clicks the item
                await cursorControls.start({ scale: 0.9, transition: { duration: 0.1 } });
                await cursorControls.start({ scale: 1, transition: { duration: 0.1 } });
                
                // Item gets selected AND Save button becomes active (ready to click)
                serviceControls.start({ borderColor: '#6C63FF', boxShadow: '0 10px 25px rgba(108,99,255,0.1)', scale: 1.02, transition: { type: "spring", stiffness: 300 } });
                await saveControls.start({ backgroundColor: '#1A1A1A', color: '#FFFFFF', transition: { duration: 0.3 } });
                
                // Cursor moves to Save button (right-aligned, width ~180px, padding right 40px)
                await cursorControls.start({ left: 'calc(100% - 130px)', top: '60px', transition: { duration: 0.8, delay: 0.3, ease: "easeOut" } });
                
                // Click Save button
                await cursorControls.start({ scale: 0.9, transition: { duration: 0.1 } });
                saveControls.start({ scale: 0.95, transition: { duration: 0.1 } });
                await cursorControls.start({ scale: 1, transition: { duration: 0.1 } });
                
                // Button turns green (Success)
                await saveControls.start({ backgroundColor: '#10B981', scale: 1, transition: { duration: 0.2 } });
                
                // Wait and loop
                await new Promise(r => setTimeout(r, 2500));
            }
        };
        runDemo();
        return () => { isMounted = false; };
    }, [cursorControls, serviceControls, saveControls]);

    return (
        <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ padding: '40px', width: '100%', height: '100%', position: 'relative' }}
        >
            <div style={{ fontWeight: 600, fontSize: '24px', marginBottom: '32px' }}>Service List</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '600px' }}>
                <div style={{ background: '#FFFFFF', padding: '20px', borderRadius: '16px', border: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between' }}>
                    <div><div style={{ fontWeight: 600, fontSize: '16px' }}>Hair Spa</div><div style={{ fontSize: '13px', color: '#6B7280' }}>60 Minutes</div></div>
                    <div style={{ fontWeight: 600 }}>Rp 150.000</div>
                </div>
                
                <motion.div animate={serviceControls} style={{ background: '#FFFFFF', padding: '20px', borderRadius: '16px', border: '2px solid #E5E7EB', display: 'flex', justifyContent: 'space-between' }}>
                    <div><div style={{ fontWeight: 600, fontSize: '16px' }}>Nail Art Premium</div><div style={{ fontSize: '13px', color: '#6C63FF' }}>45 Minutes</div></div>
                    <div style={{ fontWeight: 600 }}>Rp 200.000</div>
                </motion.div>
            </div>

            <motion.div animate={saveControls} style={{ position: 'absolute', top: '40px', right: '40px', padding: '12px 24px', borderRadius: '100px', fontWeight: 600 }}>
                Save Changes
            </motion.div>

            {/* Simulated Cursor */}
            <motion.div animate={cursorControls} style={{ position: 'absolute', top: 0, left: 0, zIndex: 50, pointerEvents: 'none' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.2))' }}>
                    <path d="M5.5 3.21V20.8C5.5 21.65 6.5 22.1 7.14 21.54L10.93 18.2C11.13 18.02 11.39 17.92 11.66 17.92H18.5C19.33 17.92 19.75 16.92 19.16 16.33L6.16 3.33C5.58 2.74 4.5 3.16 4.5 3.99V3.21H5.5Z" fill="#1A1A1A"/>
                    <path d="M6 4L18 16H11.66C11.13 16 10.62 16.2 10.22 16.55L6 20.25V4Z" fill="white"/>
                </svg>
            </motion.div>
        </motion.div>
    );
}

// ==========================================
// DEMO 2: Roles (The Toggle Cursor)
// ==========================================
function DemoRoles() {
    const cursorControls = useAnimation();
    const [mode, setMode] = useState('pusat');

    useEffect(() => {
        let isMounted = true;
        const runDemo = async () => {
            while (isMounted) {
                // Start with cursor on pusat
                await cursorControls.start({ left: '50%', top: '50%', opacity: 0, transition: { duration: 0 } });
                setMode('pusat');

                // Cursor appears and clicks Branches (the toggle is on the right half of the 300px-wide panel).
                await cursorControls.start({ opacity: 1, transition: { duration: 0.4 } });
                await cursorControls.start({ left: 'calc(100% - 115px)', top: '60px', transition: { duration: 1, delay: 1, ease: "easeOut" } });
                await cursorControls.start({ scale: 0.9, transition: { duration: 0.1 } });
                setMode('cabang');
                await cursorControls.start({ scale: 1, transition: { duration: 0.1 } });
                
                // Cursor clicks Pusat again (Pusat is left half of 300px width)
                await cursorControls.start({ left: 'calc(100% - 265px)', top: '60px', transition: { duration: 1, delay: 2.5, ease: "easeOut" } });
                await cursorControls.start({ scale: 0.9, transition: { duration: 0.1 } });
                setMode('pusat');
                await cursorControls.start({ scale: 1, transition: { duration: 0.1 } });
                
                await new Promise(r => setTimeout(r, 2500));
            }
        };
        runDemo();
        return () => { isMounted = false; };
    }, [cursorControls]);

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ padding: '40px', width: '100%', height: '100%', position: 'relative', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
                <div style={{ fontWeight: 600, fontSize: '24px' }}>Business Overview</div>
                <div style={{ display: 'flex', background: '#F3F4F6', padding: '6px', borderRadius: '100px', position: 'relative', width: '300px' }}>
                    <div style={{ flex: 1, textAlign: 'center', padding: '8px 0', fontWeight: 600, fontSize: '14px', zIndex: 10, color: mode === 'pusat' ? 'white' : '#6B7280' }}>HQ Admin</div>
                    <div style={{ flex: 1, textAlign: 'center', padding: '8px 0', fontWeight: 600, fontSize: '14px', zIndex: 10, color: mode === 'cabang' ? 'white' : '#6B7280' }}>Branch Cashier</div>
                    <motion.div 
                        animate={{ left: mode === 'pusat' ? '6px' : '50%' }} transition={{ type: "spring", stiffness: 400, damping: 30 }}
                        style={{ position: 'absolute', top: '6px', bottom: '6px', width: 'calc(50% - 6px)', background: '#1A1A1A', borderRadius: '100px', zIndex: 5 }}
                    />
                </div>
            </div>

            <AnimatePresence mode="wait">
                {mode === 'pusat' ? (
                    <motion.div key="pusat" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.3 }} style={{ flex: 1 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
                            <div style={{ background: '#FDF2F8', padding: '24px', borderRadius: '16px' }}>
                                <div style={{ fontSize: '13px', fontWeight: 600, color: '#BE185D', textTransform: 'uppercase' }}>Total Combined Revenue</div>
                                <div style={{ fontSize: '32px', fontWeight: 700, color: '#831843', marginTop: '8px' }}>Rp 124.500.000</div>
                            </div>
                            <div style={{ background: '#F0FDF4', padding: '24px', borderRadius: '16px' }}>
                                <div style={{ fontSize: '13px', fontWeight: 600, color: '#15803D', textTransform: 'uppercase' }}>Total Active Therapists</div>
                                <div style={{ fontSize: '32px', fontWeight: 700, color: '#14532D', marginTop: '8px' }}>42 Staff in 3 Branches</div>
                            </div>
                        </div>
                        <div style={{ height: '140px', background: '#F9FAFB', borderRadius: '16px', border: '1px solid #E5E7EB', display: 'flex', alignItems: 'flex-end', padding: '24px', gap: '16px' }}>
                            {[40, 50, 80, 60, 100, 70, 90].map((h, i) => <div key={i} style={{ flex: 1, height: `${h}%`, background: '#C7D2FE', borderRadius: '4px' }}></div>)}
                        </div>
                    </motion.div>
                ) : (
                    <motion.div key="cabang" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.3 }} style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '24px', background: '#FEF2F2', borderRadius: '16px', color: '#991B1B', marginBottom: '24px' }}>
                            <Icon name="lock" size={24} />
                            <div>
                                <div style={{ fontWeight: 700, fontSize: '16px' }}>Access Denied</div>
                                <div style={{ fontSize: '14px', marginTop: '4px' }}>Branch cashiers cannot view Combined Revenue.</div>
                            </div>
                        </div>
                        <div style={{ background: '#F9FAFB', padding: '24px', borderRadius: '16px', border: '1px solid #E5E7EB' }}>
                            <div style={{ fontWeight: 600, fontSize: '16px', marginBottom: '16px' }}>Today's Schedule (Kemang)</div>
                            <div style={{ background: '#FFFFFF', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #10B981', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
                                <div style={{ fontWeight: 600, fontSize: '14px' }}>Hair Spa (14:00)</div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <motion.div animate={cursorControls} style={{ position: 'absolute', top: 0, left: 0, zIndex: 50, pointerEvents: 'none' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.2))' }}>
                    <path d="M5.5 3.21V20.8C5.5 21.65 6.5 22.1 7.14 21.54L10.93 18.2C11.13 18.02 11.39 17.92 11.66 17.92H18.5C19.33 17.92 19.75 16.92 19.16 16.33L6.16 3.33C5.58 2.74 4.5 3.16 4.5 3.99V3.21H5.5Z" fill="#1A1A1A"/>
                    <path d="M6 4L18 16H11.66C11.13 16 10.62 16.2 10.22 16.55L6 20.25V4Z" fill="white"/>
                </svg>
            </motion.div>
        </motion.div>
    );
}

// ==========================================
// DEMO 3: Marketing (Typing & Push Notif)
// ==========================================
function DemoMarketing() {
    const cursorControls = useAnimation();
    const [typedCode, setTypedCode] = useState('');
    const fullCode = "LEBARAN20";
    const [sent, setSent] = useState(false);

    useEffect(() => {
        let isMounted = true;
        const runDemo = async () => {
            while (isMounted) {
                setTypedCode('');
                setSent(false);
                await cursorControls.start({ left: '50%', top: '80%', opacity: 0, transition: { duration: 0 } });
                
                // Cursor moves to input (Left side)
                await cursorControls.start({ opacity: 1, left: '200px', top: '150px', transition: { duration: 0.8, ease: "easeOut" } });
                
                // Typing effect
                for(let i=1; i<=fullCode.length; i++) {
                    if(!isMounted) return;
                    setTypedCode(fullCode.slice(0, i));
                    await new Promise(r => setTimeout(r, 100));
                }

                // Cursor moves to Send button (Below input)
                await cursorControls.start({ left: '200px', top: '230px', transition: { duration: 0.6, delay: 0.5, ease: "easeInOut" } });
                
                // Click Send
                await cursorControls.start({ scale: 0.9, transition: { duration: 0.1 } });
                setSent(true);
                await cursorControls.start({ scale: 1, transition: { duration: 0.1 } });

                await new Promise(r => setTimeout(r, 4000));
            }
        };
        runDemo();
        return () => { isMounted = false; };
    }, [cursorControls]);

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ padding: '40px', width: '100%', height: '100%', position: 'relative', display: 'flex', gap: '32px' }}>
            {/* Admin Input */}
            <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '24px', marginBottom: '32px' }}>Create Coupon Blast</div>
                <div style={{ marginBottom: '24px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#6B7280', marginBottom: '8px' }}>Coupon Code</div>
                    <div style={{ background: '#F9FAFB', border: '1px solid #6C63FF', padding: '16px', borderRadius: '12px', fontWeight: 700, letterSpacing: '0.1em', color: '#1A1A1A', height: '54px', display: 'flex', alignItems: 'center' }}>
                        {typedCode}<motion.span animate={{ opacity: [1,0] }} transition={{ repeat: Infinity, duration: 0.5 }}>|</motion.span>
                    </div>
                </div>
                
                <div 
                    style={{ background: sent ? '#10B981' : '#1A1A1A', color: 'white', padding: '16px', borderRadius: '12px', textAlign: 'center', fontWeight: 600, transition: 'background 0.3s' }}
                >
                    {sent ? "Broadcast Sent!" : "Send to 45 Customers"}
                </div>
            </div>

            {/* Simulated Phone Notification */}
            <div style={{ width: '260px', height: '360px', background: '#F3F4F6', borderRadius: '32px', border: '8px solid #1A1A1A', position: 'relative', overflow: 'hidden' }}>
                <motion.div 
                    initial={{ y: -100, opacity: 0 }}
                    animate={{ y: sent ? 16 : -100, opacity: sent ? 1 : 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    style={{ position: 'absolute', left: '16px', right: '16px', background: '#FFFFFF', padding: '16px', borderRadius: '20px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}
                >
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#6C63FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0 }}>
                            <Icon name="spark" size={16} />
                        </div>
                        <div>
                            <div style={{ fontWeight: 600, fontSize: '13px', color: '#1A1A1A' }}>Aura Studio</div>
                            <div style={{ fontSize: '12px', color: '#4B5563', lineHeight: 1.4, marginTop: '4px' }}>Miss being pampered? Here's a 20% discount just for you! 💅</div>
                        </div>
                    </div>
                </motion.div>
            </div>

            <motion.div animate={cursorControls} style={{ position: 'absolute', top: 0, left: 0, zIndex: 50, pointerEvents: 'none' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.2))' }}>
                    <path d="M5.5 3.21V20.8C5.5 21.65 6.5 22.1 7.14 21.54L10.93 18.2C11.13 18.02 11.39 17.92 11.66 17.92H18.5C19.33 17.92 19.75 16.92 19.16 16.33L6.16 3.33C5.58 2.74 4.5 3.16 4.5 3.99V3.21H5.5Z" fill="#1A1A1A"/>
                    <path d="M6 4L18 16H11.66C11.13 16 10.62 16.2 10.22 16.55L6 20.25V4Z" fill="white"/>
                </svg>
            </motion.div>
        </motion.div>
    );
}

// ==========================================
// DEMO 4: Finance (Static / Growing Graph)
// ==========================================
function DemoFinance() {
    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ padding: '40px', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontWeight: 600, fontSize: '24px', marginBottom: '32px' }}>Revenue Summary</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', flex: 1 }}>
                <div style={{ background: '#FDF2F8', borderRadius: '24px', padding: '32px', gridColumn: 'span 2' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#BE185D', textTransform: 'uppercase' }}>Today's Paid Revenue</span>
                    <div style={{ fontSize: '48px', fontWeight: 700, color: '#831843', marginTop: '12px' }}>Rp 7.414.000</div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '120px', marginTop: '32px' }}>
                        {[40, 60, 45, 80, 55, 90, 100].map((h, i) => (
                            <motion.div key={i} initial={{ height: 0 }} animate={{ height: `${h}%` }} transition={{ delay: 0.1 + (i*0.1), duration: 0.5, type: 'spring' }} style={{ flex: 1, background: '#FBCFE8', borderRadius: '4px' }}></motion.div>
                        ))}
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
