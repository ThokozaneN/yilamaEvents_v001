import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Crown, Zap, Shield, Globe, Mail, Phone, MapPin, Instagram, Twitter, Facebook } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

export const AboutView: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const ctx = gsap.context(() => {
            // 1. Hero Entrance - Ultra Smooth & Dramatic
            const heroTl = gsap.timeline();
            heroTl.from(".hero-title-char", {
                y: 100,
                opacity: 0,
                rotateX: -90,
                stagger: 0.05,
                duration: 1.5,
                ease: "expo.out"
            })
                .from(".hero-subtext", {
                    y: 30,
                    opacity: 0,
                    duration: 1,
                    ease: "power3.out"
                }, "-=1")
                .from(".floating-element", {
                    scale: 0,
                    opacity: 0,
                    stagger: 0.2,
                    duration: 2,
                    ease: "elastic.out(1, 0.3)"
                }, "-=0.5");

            // 2. Parallax Background Elements
            gsap.to(".parallax-bg", {
                scrollTrigger: {
                    trigger: containerRef.current,
                    start: "top top",
                    end: "bottom bottom",
                    scrub: true
                },
                y: (_i, target) => {
                    const speed = target.dataset.speed || 0.2;
                    return -window.innerHeight * speed;
                },
                ease: "none"
            });

            // 3. Reveal Sections on Scroll - "Liquid" Effect
            gsap.utils.toArray<HTMLElement>(".reveal-container").forEach((container) => {
                gsap.from(container.querySelectorAll(".reveal-item"), {
                    scrollTrigger: {
                        trigger: container,
                        start: "top 80%",
                        toggleActions: "play none none reverse"
                    },
                    y: 60,
                    opacity: 0,
                    skewY: 5,
                    stagger: 0.1,
                    duration: 1.2,
                    ease: "power4.out"
                });
            });

            // 4. Mission Card Horizontal Slide
            gsap.from(".mission-accent", {
                scrollTrigger: {
                    trigger: ".mission-section",
                    start: "top 70%",
                    end: "bottom 30%",
                    scrub: 2
                },
                width: "0%",
                ease: "none"
            });

            // 5. Contact Form Items Entrance
            gsap.from(".contact-card", {
                scrollTrigger: {
                    trigger: ".contact-section",
                    start: "top 75%"
                },
                x: -50,
                opacity: 0,
                duration: 1,
                ease: "power3.out"
            });

            gsap.from(".contact-info-item", {
                scrollTrigger: {
                    trigger: ".contact-section",
                    start: "top 75%"
                },
                x: 50,
                opacity: 0,
                stagger: 0.1,
                duration: 1,
                ease: "power3.out"
            });

        }, containerRef);

        return () => ctx.revert();
    }, []);

    return (
        <div ref={containerRef} className="min-h-screen themed-bg overflow-x-hidden selection:bg-amber-500 selection:text-black">
            {/* Dynamic Background */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="parallax-bg absolute top-[10%] left-[5%] w-96 h-96 bg-amber-500/10 rounded-full blur-[120px]" data-speed="0.1" />
                <div className="parallax-bg absolute bottom-[20%] right-[10%] w-[500px] h-[500px] bg-zinc-400/5 rounded-full blur-[150px]" data-speed="0.3" />
                <div className="parallax-bg absolute top-[40%] right-[30%] w-64 h-64 bg-purple-500/10 rounded-full blur-[100px]" data-speed="0.2" />
            </div>

            {/* Hero Section */}
            <section className="relative h-screen flex flex-col justify-center items-center px-6 text-center overflow-hidden z-10">
                <div className="space-y-8 max-w-5xl">
                    <div className="floating-element inline-flex items-center gap-2 px-6 py-2 rounded-full bg-black dark:bg-white text-white dark:text-black shadow-2xl">
                        <Crown className="w-4 h-4 text-amber-500 animate-pulse" />
                        <span className="text-[11px] font-black uppercase tracking-[0.4em]">The New Standard</span>
                    </div>

                    <h1 className="text-7xl md:text-[12vw] font-black tracking-tighter themed-text leading-[0.85] uppercase flex flex-wrap justify-center gap-x-8">
                        {["Y", "I", "L", "A", "M", "A"].map((char, i) => (
                            <span key={i} className="hero-title-char inline-block italic hover:text-amber-500 transition-colors duration-300">
                                {char}
                            </span>
                        ))}
                    </h1>

                    <div className="hero-subtext relative pt-12">
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-[1px] bg-gradient-to-r from-transparent via-zinc-500 to-transparent" />
                        <p className="text-xl md:text-3xl font-medium themed-text opacity-50 max-w-3xl mx-auto leading-relaxed italic">
                            "We don't just sell tickets. We curate <span className="themed-text opacity-100 font-black">imperishable</span> memories."
                        </p>
                    </div>
                </div>

                {/* Dynamic Scroll Gate */}
                <div className="absolute bottom-12 flex flex-col items-center gap-3 opacity-40">
                    <div className="w-6 h-10 border-2 themed-border rounded-full flex justify-center p-1">
                        <div className="w-1 h-2 bg-amber-500 rounded-full animate-bounce" />
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-[0.5em]">Enter Vision</span>
                </div>
            </section>

            {/* Features Grid */}
            <section className="py-40 px-6 md:px-12 max-w-7xl mx-auto z-10 relative">
                <div className="reveal-container grid grid-cols-1 md:grid-cols-3 gap-12">
                    {[
                        {
                            icon: <Zap className="w-12 h-12" />,
                            title: "Instant Trust",
                            desc: "Every ticket is a cryptographic proof of your right to belong. No duplicates, no fakes, no exceptions.",
                            color: "text-amber-500"
                        },
                        {
                            icon: <Shield className="w-12 h-12" />,
                            title: "Fair Play",
                            desc: "Our secondary market algorithm prevents price gouging, ensuring real fans get real prices.",
                            color: "text-zinc-500"
                        },
                        {
                            icon: <Globe className="w-12 h-12" />,
                            title: "Local Roots",
                            desc: "Deeply integrated with African payment gateways and local organizer needs.",
                            color: "text-amber-600"
                        }
                    ].map((item, i) => (
                        <div key={i} className="reveal-item group p-12 rounded-[4rem] border themed-border bg-white/5 backdrop-blur-3xl hover:bg-black dark:hover:bg-white transition-all duration-700 shadow-2xl overflow-hidden relative">
                            {/* Card Glow */}
                            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                            <div className={`relative z-10 ${item.color} mb-8 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-12`}>
                                {item.icon}
                            </div>
                            <h3 className="relative z-10 text-3xl font-black uppercase tracking-tight themed-text group-hover:text-white dark:group-hover:text-black transition-colors">{item.title}</h3>
                            <p className="relative z-10 text-base font-medium opacity-50 themed-text group-hover:text-white dark:group-hover:text-black group-hover:opacity-100 transition-all leading-relaxed mt-4">
                                {item.desc}
                            </p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Mission Full-Width Impact */}
            <section className="mission-section py-60 relative z-10 overflow-hidden bg-black">
                <div className="absolute top-0 right-0 w-full h-full opacity-20">
                    <div className="absolute top-[20%] left-[-10%] w-[120%] h-[1px] bg-white rotate-12" />
                    <div className="absolute top-[40%] right-[-10%] w-[120%] h-[1px] bg-white -rotate-12" />
                </div>

                <div className="max-w-6xl mx-auto px-6 text-center space-y-16">
                    <div className="reveal-container space-y-4">
                        <h2 className="reveal-item text-[15vw] font-black text-white leading-none uppercase italic tracking-tighter opacity-10">MISSION</h2>
                        <div className="reveal-item text-4xl md:text-8xl font-black text-white uppercase italic leading-[0.9] -mt-20">
                            Empowering <span className="text-amber-500">Identity</span> Through Experience
                        </div>
                        <div className="mission-accent h-1.5 bg-amber-500 mx-auto rounded-full mt-8" />
                    </div>

                    <p className="reveal-item text-xl md:text-3xl font-bold text-white/40 max-w-4xl mx-auto uppercase tracking-tight leading-tight">
                        YILAMA IS THE ARCHITECT OF <span className="text-white">SOUL-DRIVEN</span> TECHNOLOGY. BUILT FOR THE BOLD, THE CREATIVE, AND THE UNSTOPPABLE.
                    </p>
                </div>
            </section>

            {/* Contact Section - The "New" Part */}
            <section className="contact-section py-40 px-6 z-10 relative">
                <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-20">

                    <div className="space-y-12">
                        <div className="reveal-container space-y-4">
                            <h4 className="reveal-item text-[10px] font-black uppercase tracking-[0.8em] text-amber-500">Communicate</h4>
                            <h2 className="reveal-item text-6xl md:text-8xl font-black themed-text tracking-tighter uppercase leading-none italic">Get in <br /> Touch.</h2>
                            <p className="reveal-item text-lg opacity-50 themed-text font-medium max-w-md">Our team is available 24/7 to support your vision. Reach out and let's manifest something massive.</p>
                        </div>

                        <div className="space-y-8">
                            {[
                                { icon: <Mail />, label: "Email Us", val: "hello@yilama.events" },
                                { icon: <Phone />, label: "Call Us", val: "+27 (0) 11 456 7890" },
                                { icon: <MapPin />, label: "Visit Us", val: "Johannesburg, South Africa" }
                            ].map((item, i) => (
                                <div key={i} className="contact-info-item flex items-center gap-6 group cursor-pointer">
                                    <div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-white/5 border themed-border flex items-center justify-center themed-text group-hover:bg-amber-500 group-hover:text-black transition-all duration-300">
                                        {item.icon}
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black uppercase tracking-widest opacity-40 themed-text">{item.label}</p>
                                        <p className="text-xl font-bold themed-text group-hover:text-amber-500 transition-colors">{item.val}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="flex gap-4 pt-8">
                            {[Instagram, Twitter, Facebook].map((Icon, i) => (
                                <a key={i} href="#" className="w-12 h-12 rounded-full border themed-border flex items-center justify-center themed-text hover:bg-black dark:hover:bg-white hover:text-white dark:hover:text-black transition-all">
                                    <Icon className="w-5 h-5" />
                                </a>
                            ))}
                        </div>
                    </div>

                    <div className="contact-card relative">
                        <div className="absolute inset-0 bg-amber-500 rounded-[4rem] blur-[60px] opacity-20 animate-pulse" />
                        <div className="relative bg-white dark:bg-zinc-900 border themed-border rounded-[4rem] p-12 shadow-2xl space-y-8">
                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-4 themed-text">Name / Organization</label>
                                    <input className="w-full themed-secondary-bg p-6 rounded-[2rem] font-bold themed-text outline-none border themed-border focus:border-amber-500 transition-all" placeholder="Enter name" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-4 themed-text">Inquiry Type</label>
                                    <select className="w-full themed-secondary-bg p-6 rounded-[2rem] font-bold themed-text outline-none border themed-border focus:border-amber-500 transition-all appearance-none cursor-pointer">
                                        <option>Organizer Support</option>
                                        <option>Partnership Inquiry</option>
                                        <option>Technical Issue</option>
                                        <option>Other</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-4 themed-text">Your Vision (Message)</label>
                                    <textarea rows={4} className="w-full themed-secondary-bg p-6 rounded-[2.5rem] font-bold themed-text outline-none border themed-border focus:border-amber-500 transition-all" placeholder="Tell us about your event..." />
                                </div>
                            </div>
                            <button className="w-full py-8 bg-black dark:bg-white text-white dark:text-black rounded-[2.5rem] font-black text-sm uppercase tracking-[0.4em] shadow-2xl hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-4">
                                <span>Send Manifest</span>
                                <Zap className="w-5 h-5 fill-amber-500 text-amber-500" />
                            </button>
                        </div>
                    </div>

                </div>
            </section>

            {/* Footer Branded Reveal */}
            <footer className="py-20 border-t themed-border overflow-hidden bg-white/5 backdrop-blur-md">
                <div className="px-6 md:px-12 flex flex-col md:flex-row justify-between items-center gap-12 max-w-7xl mx-auto">
                    <div className="space-y-2 text-center md:text-left">
                        <h4 className="text-4xl font-black themed-text italic uppercase leading-none">YILAMA</h4>
                        <p className="text-[9px] font-bold themed-text opacity-40 uppercase tracking-[0.4em]">Designing the Invisible</p>
                    </div>
                    <div className="flex gap-8 text-[10px] font-black uppercase tracking-widest opacity-60">
                        <a href="#" className="hover:text-amber-500 transition-colors">Privacy</a>
                        <a href="#" className="hover:text-amber-500 transition-colors">Terms</a>
                        <a href="#" className="hover:text-amber-500 transition-colors">Security</a>
                    </div>
                    <p className="text-[10px] font-bold themed-text uppercase tracking-widest opacity-20">© 2026 Yilama Technologies</p>
                </div>
            </footer>
        </div>
    );
};
