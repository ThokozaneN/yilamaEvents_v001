import React, { useState, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { SkeletonPulse } from '../components/Skeleton';

export const VisionView: React.FC = () => {
  const [fileData, setFileData] = useState<{ url: string; isPdf: boolean } | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<{ date?: string, venue?: string, type?: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const analyzeContent = async (base64: string, mimeType: string) => {
    setIsLoading(true);
    setError(null);
    setAnalysis(null);
    setExtractedData(null);

    try {
      // ⚠️ SECURITY NOTE: Vision feature uses client-side AI for image/PDF analysis.
      // This is a security risk. RECOMMENDED: Move to Edge Function like ai-assistant
      // for production use. Requires passing base64 image data to server.
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const base64Data = base64.split(',')[1];

      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: {
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeType
              }
            },
            { text: "Detailed Analysis Mode: Analyze this file. 1. If it's an event flyer or document, extract the Event Date, Venue Name, and Event Category. 2. Provide a 2-sentence creative description of the aesthetic or document content. 3. Suggest if this looks 'high-energy', 'chill', 'corporate', or 'administrative'. Output Format: Descriptive text first, then a clear section 'DATA: [Date] | [Venue] | [Type]'" }
          ]
        }
      });

      const fullText = response.text || "Analysis unavailable.";

      const dataMatch = fullText.match(/DATA:\s*(.*)\s*\|\s*(.*)\s*\|\s*(.*)/i);
      if (dataMatch) {
        setExtractedData({
          date: dataMatch[1].trim(),
          venue: dataMatch[2].trim(),
          type: dataMatch[3].trim()
        });
      }

      setAnalysis(fullText.split('DATA:')[0].trim());
    } catch (err: any) {
      console.error("AI Analysis Error:", err);
      setError("AI analysis failed. Please try a clearer document or image.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const isPdf = file.type === 'application/pdf';
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setFileData({ url: base64, isPdf });
        analyzeContent(base64, file.type);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="px-6 md:px-12 py-12 max-w-4xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="space-y-4">
        <div className="inline-block px-4 py-1 themed-secondary-bg border themed-border rounded-full">
          <span className="text-[8px] font-black uppercase tracking-[0.3em] themed-text">Gemini 3 Pro Powered</span>
        </div>
        <h1 className="text-5xl md:text-7xl font-bold tracking-tighter themed-text leading-none">Smart Lens</h1>
        <p className="text-zinc-500 font-medium text-lg uppercase tracking-widest">Intelligent Document Processing</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-start">
        <div className="space-y-8">
          <div
            onClick={() => !isLoading && fileInputRef.current?.click()}
            className={`aspect-[4/5] rounded-[3.5rem] themed-secondary-bg border-4 border-dashed themed-border flex flex-col items-center justify-center cursor-pointer overflow-hidden relative group transition-all ${isLoading ? 'opacity-50 cursor-wait' : 'hover:scale-[1.02]'}`}
          >
            {fileData ? (
              fileData.isPdf ? (
                <div className="flex flex-col items-center gap-4 p-12">
                  <div className="w-32 h-32 bg-red-500/10 rounded-3xl flex items-center justify-center text-red-500">
                    <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-widest themed-text opacity-40">PDF Document Loaded</p>
                </div>
              ) : (
                <img src={fileData.url} className="w-full h-full object-cover" alt="Captured" />
              )
            ) : (
              <div className="p-12 text-center space-y-4">
                <div className="w-24 h-24 bg-black dark:bg-white rounded-[2rem] flex items-center justify-center text-white dark:text-black mx-auto shadow-2xl">
                  <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] themed-text opacity-40">Scan Poster or PDF</p>
              </div>
            )}
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*,application/pdf" />

            {!isLoading && (
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="text-white text-[10px] font-black uppercase tracking-widest">Update Source</span>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-8 h-full flex flex-col">
          <div className="flex-grow themed-card border themed-border rounded-[3rem] p-10 shadow-xl relative overflow-hidden">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] opacity-30 themed-text mb-8">AI Interpretation</h3>

            {isLoading ? (
              <div className="space-y-6">
                <div className="space-y-3">
                  <SkeletonPulse className="w-full h-4 rounded-lg" />
                  <SkeletonPulse className="w-5/6 h-4 rounded-lg opacity-60" />
                  <SkeletonPulse className="w-4/6 h-4 rounded-lg opacity-30" />
                </div>
                <div className="pt-12 text-center">
                  <div className="w-16 h-16 border-4 border-black dark:border-white border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-[9px] font-black uppercase tracking-widest themed-text opacity-40">Extracting Document Data...</p>
                </div>
              </div>
            ) : analysis ? (
              <div className="animate-in fade-in duration-500 space-y-10">
                <p className="themed-text text-sm font-medium leading-relaxed whitespace-pre-line italic">"{analysis}"</p>

                {extractedData && (
                  <div className="p-6 themed-secondary-bg rounded-[2rem] border themed-border space-y-4 shadow-inner">
                    <h4 className="text-[9px] font-black uppercase tracking-widest opacity-40">Extracted Intelligence</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center"><span className="text-[10px] font-bold opacity-30">DATE</span><span className="text-xs font-black uppercase">{extractedData.date || 'TBD'}</span></div>
                      <div className="flex justify-between items-center"><span className="text-[10px] font-bold opacity-30">VENUE</span><span className="text-xs font-black uppercase truncate ml-4">{extractedData.venue || 'Unknown'}</span></div>
                      <div className="flex justify-between items-center"><span className="text-[10px] font-bold opacity-30">VIBE</span><span className="text-xs font-black uppercase">{extractedData.type || 'Standard'}</span></div>
                    </div>
                  </div>
                )}

                <div className="pt-8 border-t themed-border">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                    <span className="text-[8px] font-black uppercase tracking-widest opacity-40">Secure Analysis Completed</span>
                  </div>
                </div>
              </div>
            ) : error ? (
              <div className="text-red-500 text-xs font-bold uppercase tracking-widest text-center py-20 bg-red-500/5 rounded-[2rem] border border-red-500/20">{error}</div>
            ) : (
              <div className="text-center py-20 opacity-20">
                <svg className="w-20 h-20 mx-auto mb-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <p className="text-[10px] font-black uppercase tracking-[0.3em]">Awaiting Data Input</p>
              </div>
            )}
          </div>

          <button
            onClick={() => {
              setFileData(null);
              setAnalysis(null);
              setExtractedData(null);
            }}
            className="w-full py-6 themed-secondary-bg themed-text border themed-border rounded-2xl font-black text-[10px] uppercase tracking-widest hover:brightness-95 transition-all shadow-sm"
          >
            Clear Lens
          </button>
        </div>
      </div>
    </div>
  );
};