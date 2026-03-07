import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
    Zap, Shield, Globe, Mail, Phone, MapPin,
    Instagram, Twitter, Facebook, ArrowRight, Target,
    Eye, Rocket, Fingerprint, Sparkles, Layers, Search
} from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

export const AboutView: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const ctx = gsap.context(() => {
            // 1. Hero Entrance - Dynamic Splitting Text Effect
            const heroTl = gsap.timeline();
            heroTl.from(".hero-line", {
                y: 150,
                opacity: 0,
                skewY: 10,
                stagger: 0.15,
                duration: 1.8,
                ease: "expo.out"
            })
                .from(".hero-highlight", {
                    scaleX: 0,
                    transformOrigin: "left",
                    duration: 1,
                    ease: "power4.inOut"
                }, "-=0.8")
                .from(".hero-badge", {
                    y: 20,
                    opacity: 0,
                    duration: 1,
                    ease: "back.out(2)"
                }, "-=0.5");

            // 2. Text Scrubbing Effect (Words highlight as you scroll)
            const scrubTexts = gsap.utils.toArray<HTMLElement>(".scrub-text");
            scrubTexts.forEach((text) => {
                gsap.to(text, {
                    scrollTrigger: {
                        trigger: text,
                        start: "top 80%",
                        end: "bottom 30%",
                        scrub: true,
                    },
                    color: "rgba(255, 191, 0, 1)", // Amber-500
                    opacity: 1,
                    duration: 1,
                });
            });

            // 3. Magnetic Hover Effect for Interactive Items
            const magneticItems = gsap.utils.toArray<HTMLElement>(".magnetic-item");
            magneticItems.forEach((item) => {
                item.addEventListener('mousemove', (e) => {
                    const rect = item.getBoundingClientRect();
                    const x = e.clientX - rect.left - rect.width / 2;
                    const y = e.clientY - rect.top - rect.height / 2;
                    gsap.to(item, { x: x * 0.4, y: y * 0.4, duration: 0.3, ease: "power2.out" });
                });
                item.addEventListener('mouseleave', () => {
                    gsap.to(item, { x: 0, y: 0, duration: 0.5, ease: "elastic.out(1, 0.3)" });
                });
            });

            // 4. Horizontal Scroll Section for "The Pillar Timeline"
            const sections = gsap.utils.toArray<HTMLElement>(".pillar-card");
            gsap.to(sections, {
                xPercent: -100 * (sections.length - 1),
                ease: "none",
                scrollTrigger: {
                    trigger: ".horizontal-container",
                    pin: true,
                    scrub: 1,
                    snap: 1 / (sections.length - 1),
                    end: () => "+=" + (scrollRef.current?.offsetWidth || 0),
                }
            });

            // 5. 3D Card Hover - Rotation logic
            const cards = gsap.utils.toArray<HTMLElement>(".three-d-card");
            cards.forEach(card => {
                card.addEventListener('mousemove', (e) => {
                    const rect = card.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    const centerX = rect.width / 2;
                    const centerY = rect.height / 2;
                    const rotateX = (y - centerY) / 10;
                    const rotateY = (centerX - x) / 10;
                    gsap.to(card, { rotateX, rotateY, duration: 0.1 });
                });
                card.addEventListener('mouseleave', () => {
                    gsap.to(card, { rotateX: 0, rotateY: 0, duration: 0.5 });
                });
            });

        }, containerRef);

        return () => ctx.revert();
    }, []);

    return (
        <div ref={containerRef} className="min-h-screen themed-bg overflow-x-hidden selection:bg-amber-500 selection:text-black font-sans">
            {/* Immersive Background Canvas */}
            <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
                {/* Animated Grid Lines */}
                <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
                    style={{ backgroundImage: 'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
            </div>

            {/* Hero: The Manifesto */}
            <section className="relative h-screen flex flex-col justify-center items-center px-6 z-10 text-center">
                <div className="hero-badge mb-10 inline-flex items-center gap-3 px-6 py-2 rounded-full bg-zinc-100 dark:bg-white/5 border themed-border backdrop-blur-xl">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span className="text-[10px] font-black uppercase tracking-[0.5em] themed-text">Visionaries Only</span>
                </div>

                <div className="space-y-2">
                    <h1 className="hero-line text-6xl md:text-[8vw] font-black tracking-tighter themed-text uppercase leading-none italic">
                        Engineered for <br />
                        <span className="relative">
                            <span className="hero-highlight absolute bottom-2 left-0 w-full h-4 bg-amber-500/30 -z-10" />
                            Impact
                        </span>
                    </h1>
                    <h1 className="hero-line text-5xl md:text-[6vw] font-black tracking-tighter themed-text opacity-40 uppercase leading-none italic">
                        Yilama Events
                    </h1>
                </div>

                <div className="mt-20 max-w-2xl mx-auto space-y-8">
                    <p className="text-lg md:text-2xl font-medium themed-text opacity-60 leading-relaxed italic">
                        Step into the future where every interaction is <span className="scrub-text opacity-30">secure</span>, every price is <span className="scrub-text opacity-30">fair</span>, and every attendee is <span className="scrub-text opacity-30">infinite</span>.
                    </p>
                </div>

                {/* Scroll Callout */}
                <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-4 opacity-30">
                    <div className="w-px h-20 bg-gradient-to-b from-black dark:from-white to-transparent" />
                    <span className="text-[9px] font-bold uppercase tracking-[0.6em]">Scroll to Decode</span>
                </div>
            </section>

            {/* Origin Story: Interactive text */}
            <section className="py-40 px-6 max-w-7xl mx-auto z-10 relative">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
                    <div className="space-y-12">
                        <div className="space-y-4">
                            <h2 className="text-sm font-black text-amber-500 uppercase tracking-[0.4em]">The Genesis</h2>
                            <h3 className="text-5xl md:text-7xl font-black themed-text tracking-tighter uppercase leading-none italic">Born from <br /> Chaos.</h3>
                        </div>
                        <div className="space-y-6 text-xl md:text-2xl font-medium themed-text opacity-70 leading-relaxed">
                            <p>In a world of predatory scalpers and opaque ticketing markets, <span className="text-amber-500 font-bold">Yilama</span> was conceived as a digital fortress.</p>
                            <p>We believe technology should serve the creator, not the middleman. Our mission is to strip away the complexity and replace it with <span className="themed-text opacity-100 italic transition-all">radical transparency</span>.</p>
                        </div>
                    </div>
                    <div className="relative group perspective-1000">
                        <div className="three-d-card w-full aspect-[4/5] bg-zinc-900 rounded-[4rem] border themed-border overflow-hidden shadow-2xl relative">
                            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/20 to-transparent opacity-40" />
                            <div className="absolute inset-0 flex flex-col items-center justify-center p-12 text-center space-y-8 group-hover:scale-110 transition-transform duration-700">
                                <Target className="w-20 h-20 text-white mb-4 animate-pulse" />
                                <h4 className="text-3xl font-black text-white uppercase italic">True North</h4>
                                <p className="text-white/40 text-sm font-medium leading-relaxed">Scaling the heartbeat of African entertainment with zero-compromise integrity.</p>
                            </div>
                            {/* Decorative Elements */}
                            <div className="absolute top-10 left-10 w-4 h-4 rounded-full bg-amber-500" />
                            <div className="absolute bottom-10 right-10 w-4 h-4 rounded-full bg-white opacity-20" />
                        </div>
                    </div>
                </div>
            </section>

            {/* Horizontal Pillar Scroll */}
            <section className="horizontal-container bg-black py-40 overflow-hidden relative">
                <div className="absolute top-20 left-12 z-20">
                    <h2 className="text-[12vw] font-black text-white/5 uppercase leading-none italic select-none">ARCHITECTURE</h2>
                </div>

                <div ref={scrollRef} className="flex gap-20 px-24 h-[60vh] items-center">
                    {[
                        { title: "The Vault", icon: <Shield />, desc: "Every ticket is stored in a private digital secure vault, instantly transferable but impossible to steal." },
                        { title: "Fair Market", icon: <Fingerprint />, desc: "Our proprietary algorithm caps resale prices, killing scalping once and for all." },
                        { title: "Omni-Payment", icon: <Zap />, desc: "Integrated with PayFast and digital wallets for seamless Pan-African transactions." },
                        { title: "Live Pulse", icon: <Search />, desc: "Real-time analytics for organizers. Every scan, every ticket, every heartbeat tracked." }
                    ].map((pillar, i) => (
                        <div key={i} className="pillar-card min-w-[80vw] md:min-w-[40vw] h-full bg-white/5 border border-white/10 rounded-[3rem] p-16 flex flex-col justify-between group hover:bg-white/10 transition-colors">
                            <div className="text-amber-500 w-16 h-16 group-hover:scale-125 transition-transform">{pillar.icon}</div>
                            <div className="space-y-4">
                                <h4 className="text-4xl font-black text-white uppercase italic">{pillar.title}</h4>
                                <p className="text-white/50 text-lg font-medium max-w-sm">{pillar.desc}</p>
                            </div>
                            <div className="flex items-center gap-4 text-white/20 uppercase text-[10px] font-black tracking-widest">
                                <span>Standard 0{i + 1}</span>
                                <ArrowRight className="w-4 h-4" />
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* The 4 Values: Impact Grid */}
            <section className="py-40 px-6 max-w-7xl mx-auto z-10 relative">
                <div className="text-center space-y-6 mb-32">
                    <h2 className="text-sm font-black text-amber-500 uppercase tracking-[0.4em]">Our Core</h2>
                    <h3 className="text-6xl md:text-9xl font-black themed-text tracking-tighter uppercase italic leading-none">Radical Values.</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                    {[
                        { icon: <Eye />, title: "Transparency", val: "We expose the hidden costs. No 'surprise' fees, no back-alley deals." },
                        { icon: <Rocket />, title: "Momentum", val: "Built for speed. Instant payouts. Instant tickets. Instant entry." },
                        { icon: <Globe />, title: "Expansion", val: "A platform without borders. Connecting the African diaspora to the source." },
                        { icon: <Layers />, title: "Precision", val: "Pixel-perfect experiences. From the first click to the final curtain." }
                    ].map((value, i) => (
                        <div key={i} className="group relative p-12 rounded-[3.5rem] border themed-border bg-zinc-50 dark:bg-white/5 overflow-hidden transition-all duration-500 hover:shadow-2xl">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 group-hover:bg-amber-500/10 transition-colors rounded-bl-full" />
                            <div className="relative z-10 space-y-6">
                                <div className="themed-text opacity-40 group-hover:scale-110 group-hover:text-amber-500 transition-all">{value.icon}</div>
                                <h4 className="text-3xl font-black themed-text uppercase tracking-tight">{value.title}</h4>
                                <p className="text-base font-medium themed-text opacity-60 leading-relaxed">{value.val}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Magnetic Contact Hub */}
            <section className="py-60 px-6 z-10 relative bg-zinc-900 group">
                <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-32">

                    <div className="space-y-16">
                        <div className="space-y-8">
                            <h2 className="text-sm font-black text-amber-500 uppercase tracking-[0.6em]">Connect</h2>
                            <h3 className="text-7xl md:text-[8vw] font-black text-white leading-[0.85] uppercase italic tracking-tighter">Start <br /> The Wave.</h3>
                            <p className="text-xl text-white/40 font-medium max-w-md">Organizers, entrepreneurs, and seekers—reach out and join the guild.</p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-12">
                            <div className="magnetic-item group/item cursor-pointer space-y-4">
                                <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-white group-hover/item:bg-amber-500 group-hover/item:text-black transition-all">
                                    <Mail className="w-6 h-6" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">Digital Mail</p>
                                    <p className="text-lg font-bold text-white">info@yilama.co.za</p>
                                </div>
                            </div>
                            <div className="magnetic-item group/item cursor-pointer space-y-4">
                                <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-white group-hover/item:bg-amber-500 group-hover/item:text-black transition-all">
                                    <Phone className="w-6 h-6" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">Connect Directly</p>
                                    <p className="text-lg font-bold text-white">+27 69 807 7866</p>
                                </div>
                            </div>
                            <div className="magnetic-item group/item cursor-pointer space-y-4 lg:col-span-2">
                                <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-white group-hover/item:bg-amber-500 group-hover/item:text-black transition-all">
                                    <MapPin className="w-6 h-6" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">Central Hub</p>
                                    <p className="text-lg font-bold text-white">Secunda, Mpumalanga</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-6">
                            {[Instagram, Twitter, Facebook].map((Icon, i) => (
                                <button key={i} className="magnetic-item w-16 h-16 rounded-full border border-white/10 flex items-center justify-center text-white hover:bg-white hover:text-black transition-colors">
                                    <Icon className="w-6 h-6" />
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="relative">
                        <div className="relative bg-zinc-950/50 backdrop-blur-3xl border border-white/5 rounded-[3rem] p-12 space-y-10 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)]">
                            <div className="space-y-8">
                                <div className="space-y-4">
                                    <label className="text-[10px] font-black uppercase text-amber-500/50 tracking-[0.3em] ml-2">Identity</label>
                                    <input className="w-full bg-white/[0.03] border border-white/5 p-6 rounded-2xl text-white font-medium outline-none focus:border-amber-500/50 focus:bg-white/[0.05] transition-all placeholder:text-white/10" placeholder="Your Name / Organization" />
                                </div>
                                <div className="space-y-4">
                                    <label className="text-[10px] font-black uppercase text-amber-500/50 tracking-[0.3em] ml-2">Reason for Contact</label>
                                    <div className="relative">
                                        <select className="w-full bg-white/[0.03] border border-white/5 p-6 rounded-2xl text-white font-medium outline-none focus:border-amber-500/50 focus:bg-white/[0.05] transition-all appearance-none cursor-pointer">
                                            <option className="bg-zinc-900">Partnership Pursuit</option>
                                            <option className="bg-zinc-900">Organizer Studio Support</option>
                                            <option className="bg-zinc-900">Secondary Market Dispute</option>
                                            <option className="bg-zinc-900">Media & General</option>
                                        </select>
                                        <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none opacity-20">
                                            <ArrowRight className="w-4 h-4 rotate-90" />
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <label className="text-[10px] font-black uppercase text-amber-500/50 tracking-[0.3em] ml-2">Message</label>
                                    <textarea rows={4} className="w-full bg-white/[0.03] border border-white/5 p-6 rounded-3xl text-white font-medium outline-none focus:border-amber-500/50 focus:bg-white/[0.05] transition-all placeholder:text-white/10 resize-none" placeholder="Describe your vision..." />
                                </div>
                            </div>
                            <button className="magnetic-item w-full py-8 bg-white text-black rounded-2xl font-black text-[11px] uppercase tracking-[0.6em] shadow-2xl hover:bg-amber-500 transition-all flex items-center justify-center gap-4">
                                <span>Send Message</span>
                                <Zap className="w-4 h-4 fill-current" />
                            </button>
                        </div>
                    </div>

                </div>
            </section>

            {/* Sub-Footer Branding */}
            <footer className="py-20 border-t themed-border opacity-30">
                <div className="px-6 flex flex-col md:flex-row justify-between items-center gap-12 max-w-7xl mx-auto">
                    <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                        <div className="w-8 h-8 bg-black dark:bg-white rounded-lg flex items-center justify-center shadow-sm">
                            <span className="text-white dark:text-black font-bold text-base italic">Y</span>
                        </div>
                        <span className="text-sm font-bold tracking-tight uppercase themed-text">Yilama</span>
                    </div>
                    <div className="flex gap-10 text-[10px] font-black uppercase tracking-widest">
                        <a href="#" className="hover:text-amber-500 transition-colors">Privacy</a>
                        <a href="#" className="hover:text-amber-500 transition-colors">Terms</a>
                        <a href="#" className="hover:text-amber-500 transition-colors">Systems</a>
                    </div>
                    <p className="text-[10px] font-bold themed-text uppercase tracking-widest">© 2026 RSA • Yilama Events</p>
                </div>
            </footer>
        </div>
    );
};
