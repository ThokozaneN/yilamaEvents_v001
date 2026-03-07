import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Crown, Zap, Shield, Globe, Users, Heart } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

export const AboutView: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const ctx = gsap.context(() => {
            // Entrance animations
            gsap.from(".hero-text", {
                y: 60,
                opacity: 0,
                duration: 1.2,
                ease: "power4.out",
                stagger: 0.2
            });

            // Scroll animations for sections
            gsap.utils.toArray<HTMLElement>(".reveal-section").forEach((section) => {
                gsap.from(section, {
                    scrollTrigger: {
                        trigger: section,
                        start: "top 85%",
                        toggleActions: "play none none reverse"
                    },
                    y: 40,
                    opacity: 0,
                    duration: 1,
                    ease: "power3.out"
                });
            });
        }, containerRef);

        return () => ctx.revert();
    }, []);

    return (
        <div ref={containerRef} className="min-h-screen themed-bg overflow-x-hidden">
            {/* Hero Section */}
            <section className="relative h-[90vh] flex flex-col justify-center items-center px-6 text-center overflow-hidden">
                {/* Abstract Background Elements */}
                <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                    <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-zinc-500/5 rounded-full blur-[120px] animate-pulse" />
                    <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-zinc-400/5 rounded-full blur-[150px] animate-pulse" style={{ animationDelay: '2s' }} />
                </div>

                <div className="relative z-10 space-y-6 max-w-4xl">
                    <div className="hero-text inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-zinc-100 dark:bg-white/5 border themed-border backdrop-blur-md">
                        <Crown className="w-3 h-3 text-amber-500" />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] themed-text">The Future of Events</span>
                    </div>
                    <h1 className="hero-text text-6xl md:text-9xl font-black tracking-tighter themed-text leading-[0.9] uppercase italic">
                        Yilama<br /><span className="not-italic opacity-40">Events</span>
                    </h1>
                    <p className="hero-text text-lg md:text-2xl font-medium themed-text opacity-60 max-w-2xl mx-auto leading-relaxed">
                        Redefining the African event landscape through transparency, secondary-market integrity, and premium digital experiences.
                    </p>
                </div>

                {/* Scroll Indicator */}
                <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-4 opacity-30">
                    <span className="text-[10px] font-bold uppercase tracking-[0.4em] themed-text">Scroll Vision</span>
                    <div className="w-[1px] h-12 bg-gradient-to-b from-black dark:from-white to-transparent" />
                </div>
            </section>

            {/* Vision Grid */}
            <section className="py-32 px-6 md:px-12 max-w-7xl mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {[
                        {
                            icon: <Zap className="w-8 h-8" />,
                            title: "Instant Utility",
                            desc: "Digital collectibles and tickets delivered instantly to your secure vault with verified blockchain-style ownership.",
                            color: "text-blue-500"
                        },
                        {
                            icon: <Shield className="w-8 h-8" />,
                            title: "Market Integrity",
                            desc: "A strictly controlled resale marketplace that eliminates scalping through fair-price caps and verified transfers.",
                            color: "text-green-500"
                        },
                        {
                            icon: <Globe className="w-8 h-8" />,
                            title: "Pan-African Reach",
                            desc: "Built in South Africa, designed for the continent. Connecting organizers and attendees across borders seamlessly.",
                            color: "text-purple-500"
                        }
                    ].map((item, i) => (
                        <div key={i} className="reveal-section themed-card border themed-border rounded-[3rem] p-10 space-y-6 hover:scale-[1.02] transition-transform duration-500 shadow-xl group">
                            <div className={`${item.color} opacity-80 group-hover:scale-110 group-hover:rotate-6 transition-transform`}>
                                {item.icon}
                            </div>
                            <h3 className="text-2xl font-black uppercase tracking-tight themed-text">{item.title}</h3>
                            <p className="text-sm font-medium opacity-50 themed-text leading-relaxed">
                                {item.desc}
                            </p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Featured Content / Mission */}
            <section className="py-32 relative overflow-hidden">
                <div className="absolute inset-0 bg-black dark:bg-white/5 skew-y-3 translate-y-20 scale-110 pointer-events-none" />

                <div className="relative z-10 px-6 md:px-12 max-w-5xl mx-auto text-center space-y-12">
                    <div className="reveal-section space-y-6">
                        <h2 className="text-4xl md:text-7xl font-black tracking-tighter text-white dark:themed-text italic uppercase">
                            Our Mission
                        </h2>
                        <div className="w-24 h-1 bg-amber-500 mx-auto rounded-full" />
                    </div>

                    <p className="reveal-section text-xl md:text-4xl font-bold text-white/80 dark:themed-text leading-tight uppercase italic tracking-tight">
                        "To empower creators by providing the world's most <span className="text-amber-500">honest</span> and <span className="text-white dark:text-white">electrifying</span> ticketing platform."
                    </p>

                    <div className="reveal-section grid grid-cols-2 md:grid-cols-4 gap-8 pt-12">
                        {[
                            { label: "Community First", icon: <Users /> },
                            { label: "Radical Honesty", icon: <Heart /> },
                            { label: "Limitless Scale", icon: <Zap /> },
                            { label: "Secure Vaults", icon: <Shield /> }
                        ].map((stat, i) => (
                            <div key={i} className="space-y-3">
                                <div className="text-white/40 dark:themed-text flex justify-center">{stat.icon}</div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-white/60 dark:themed-text">{stat.label}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Support / Contact CTA */}
            <section className="py-40 px-6 text-center">
                <div className="reveal-section space-y-10 max-w-3xl mx-auto">
                    <h3 className="text-3xl md:text-5xl font-black themed-text uppercase tracking-tight">Ready to join the movement?</h3>
                    <p className="text-lg opacity-40 themed-text font-medium">Whether you're an organizer looking for better tools or a fan looking for your next experience, Yilama is home.</p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <button className="px-12 py-5 bg-black dark:bg-white text-white dark:text-black rounded-full font-black text-xs uppercase tracking-[0.3em] shadow-2xl hover:scale-105 transition-all">
                            Organize Event
                        </button>
                        <button className="px-12 py-5 themed-secondary-bg themed-text border themed-border backdrop-blur-md rounded-full font-black text-xs uppercase tracking-[0.3em] hover:scale-105 transition-all">
                            Explore Experiences
                        </button>
                    </div>
                </div>
            </section>

            {/* Footer Branding */}
            <footer className="py-20 border-t themed-border opacity-20">
                <div className="px-6 flex flex-col md:flex-row justify-between items-center gap-8">
                    <h4 className="text-2xl font-black themed-text italic uppercase">YILAMA</h4>
                    <p className="text-[10px] font-bold themed-text uppercase tracking-widest">© 2026 Yilama Technologies • All Rights Reserved</p>
                </div>
            </footer>
        </div>
    );
};
