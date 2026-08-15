import React, { useState } from 'react';
import type { RefineResponse } from '../../lib/intent/types';
import { PromptInput } from './PromptInput';
import { ExamplePrompt } from './ExamplePrompt';
import { AnalyzeState } from './AnalyzeState';
import { IntentScore } from './IntentScore';
import { WeaknessList } from './WeaknessList';
import { RefinedPrompt } from './RefinedPrompt';
import { ExpectedOutput } from './ExpectedOutput';
import { ResultActions } from './ResultActions';
import { OriginalPrompt } from './OriginalPrompt';

export const IntentApp: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState<'idle' | 'analyzing' | 'result'>('idle');
  const [result, setResult] = useState<RefineResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (overridePrompt?: string) => {
    const promptToSend = overridePrompt || prompt;
    if (!promptToSend.trim()) return;

    setStatus('analyzing');
    setError(null);

    try {
      const response = await fetch('/api/refine', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ prompt: promptToSend })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData?.error || 'Failed to refine prompt');
      }

      const data = await response.json() as RefineResponse;
      setResult(data);
      setStatus('result');
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'Something went wrong while contacting the server.');
      setStatus('idle');
    }
  };

  const handleUpdatePrompt = (updated: string) => {
    if (result) {
      setResult({ ...result, refinedPrompt: updated });
    }
  };

  const handleRefineAgain = () => {
    if (result) {
      const nextPrompt = result.refinedPrompt;
      setPrompt(nextPrompt);
      handleSubmit(nextPrompt);
    }
  };

  const handleStartOver = () => {
    setPrompt('');
    setResult(null);
    setError(null);
    setStatus('idle');
  };

  const originalPrompt = prompt;

  return (
    <div className="w-full max-w-4xl mx-auto px-4 md:px-6">
      
      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 border border-brand/30 bg-brand-muted/20 text-brand text-sm rounded flex items-center justify-between dark:bg-brand-muted/30 dark:border-brand/40">
          <span>{error}</span>
          <button 
            onClick={() => setError(null)}
            className="text-brand font-bold hover:opacity-80 px-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* States wrapper */}
      <div className="relative">
        
        {/* IDLE STATE */}
        {status === 'idle' && (
          <div className="space-y-6">
            <PromptInput 
              value={prompt}
              onChange={setPrompt}
              onSubmit={() => handleSubmit()}
              isLoading={false}
            />
            <ExamplePrompt onSelect={(val) => {
              setPrompt(val);
              // Submit immediately for snappy UX
              handleSubmit(val);
            }} />
          </div>
        )}

        {/* ANALYZING STATE */}
        {status === 'analyzing' && (
          <AnalyzeState />
        )}

        {/* RESULT STATE */}
        {status === 'result' && result && (
          <div className="space-y-6">
            
            {/* Header & Demo Notice */}
            <div className="animate-stagger-1 space-y-4">
              {result.isMock && (
                <div className="w-full text-center border border-border-base bg-bg-base/40 rounded py-2 text-[10px] font-mono tracking-wider text-text-muted flex items-center justify-center gap-1.5 uppercase">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
                  Demo Mode (No API keys configured)
                </div>
              )}

              <div className="text-center font-mono text-[10px] uppercase tracking-wider text-success">
                ✓ Your prompt has been understood
              </div>
            </div>

            {/* Original Prompt */}
            <div className="animate-stagger-1">
              <OriginalPrompt prompt={originalPrompt} />
            </div>

            {/* Scores & Breakdown */}
            <div className="animate-stagger-2">
              <IntentScore 
                score={result.score}
                summary={result.summary}
                breakdown={result.breakdown}
              />
            </div>

            {/* Refined Prompt Box */}
            <div className="animate-stagger-3">
              <RefinedPrompt 
                refinedPrompt={result.refinedPrompt}
                onUpdate={handleUpdatePrompt}
                onRefineAgain={handleRefineAgain}
              />
            </div>

            {/* Weaknesses List */}
            <div className="animate-stagger-4">
              <WeaknessList weaknesses={result.weaknesses} />
            </div>

            {/* Expected Output Predictions */}
            <div className="animate-stagger-5">
              <ExpectedOutput 
                expectedOutput={result.expectedOutput}
                expectedQuality={result.expectedQuality}
              />
            </div>

            {/* Bottom Actions */}
            <div className="animate-stagger-6">
              <ResultActions onStartOver={handleStartOver} />
            </div>
          </div>
        )}

      </div>
      
      <style>{`
        @keyframes slideUpStagger {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-stagger-1 { animation: slideUpStagger 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.05s forwards; opacity: 0; }
        .animate-stagger-2 { animation: slideUpStagger 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.15s forwards; opacity: 0; }
        .animate-stagger-3 { animation: slideUpStagger 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.25s forwards; opacity: 0; }
        .animate-stagger-4 { animation: slideUpStagger 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.35s forwards; opacity: 0; }
        .animate-stagger-5 { animation: slideUpStagger 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.45s forwards; opacity: 0; }
        .animate-stagger-6 { animation: slideUpStagger 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.55s forwards; opacity: 0; }
      `}</style>
    </div>
  );
};
