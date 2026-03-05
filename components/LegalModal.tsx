import React from 'react';

interface LegalModalProps {
    title: string;
    content: string;
    onClose: () => void;
}

export const LegalModal: React.FC<LegalModalProps> = ({ title, content, onClose }) => {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-white dark:bg-black border border-white/10 rounded-3xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/10">
                    <h2 className="text-2xl font-black text-black dark:text-white uppercase tracking-tight">{title}</h2>
                    <button
                        onClick={onClose}
                        className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-white/10 transition-colors text-black dark:text-white"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                        {content.split('\n\n').map((paragraph, i) => {
                            // Handle headers
                            if (paragraph.startsWith('## ')) {
                                return (
                                    <h3 key={i} className="text-lg font-bold text-black dark:text-white mt-6 mb-3 uppercase tracking-wide">
                                        {paragraph.replace('## ', '')}
                                    </h3>
                                );
                            }
                            if (paragraph.startsWith('# ')) {
                                return (
                                    <h2 key={i} className="text-xl font-black text-black dark:text-white mb-4 uppercase">
                                        {paragraph.replace('# ', '')}
                                    </h2>
                                );
                            }
                            // Handle lists
                            if (paragraph.includes('\n- ')) {
                                const items = paragraph.split('\n- ').filter(Boolean);
                                return (
                                    <ul key={i} className="list-disc list-inside space-y-2 text-black/70 dark:text-white/70 mb-4">
                                        {items.map((item, j) => (
                                            <li key={j}>{item.replace(/^- /, '')}</li>
                                        ))}
                                    </ul>
                                );
                            }
                            // Regular paragraphs
                            return (
                                <p key={i} className="text-black/70 dark:text-white/70 mb-4 leading-relaxed">
                                    {paragraph}
                                </p>
                            );
                        })}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-white/10">
                    <button
                        onClick={onClose}
                        className="w-full py-3 bg-black dark:bg-white text-white dark:text-black rounded-xl font-bold text-sm uppercase tracking-wider hover:opacity-90 transition-opacity"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};
