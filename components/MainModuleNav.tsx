import React from 'react';

interface MainModuleNavProps {
    activeModule: 'events' | 'tours' | 'flight' | 'bus';
    onNavigate: (view: string) => void;
}

export const MainModuleNav: React.FC<MainModuleNavProps> = ({ activeModule, onNavigate }) => {
    const getStyles = (module: string) => {
        const isActive = activeModule === module;
        return `leading-none transition-all duration-500 ${isActive
            ? 'text-5xl md:text-8xl font-black tracking-tighter uppercase themed-text'
            : 'text-3xl md:text-5xl font-medium tracking-tight text-zinc-300 dark:text-zinc-700 hover:text-black dark:hover:text-white cursor-pointer'
            }`;
    };


    return (
        <div className="flex flex-wrap items-center gap-6 md:gap-10 pb-4 border-b border-zinc-200 dark:border-zinc-800">
            <button onClick={() => activeModule !== 'events' && onNavigate('home')} className={getStyles('events')}>
                Events
            </button>
            {/* 
            <button onClick={() => activeModule !== 'tours' && onNavigate('experiences')} className={getStyles('tours')}>
                Explore
            </button>
            <button onClick={() => handleComingSoon('Flights')} className={getStyles('flight')}>
                Flights
            </button>
            <button onClick={() => handleComingSoon('Transit')} className={getStyles('bus')}>
                Transit
            </button>
            */}
        </div>
    );
};
