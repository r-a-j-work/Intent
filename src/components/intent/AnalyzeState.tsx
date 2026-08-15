import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';

const STAGES = [
  "Understanding underlying intent",
  "Checking semantic clarity",
  "Finding missing contextual markers",
  "Evaluating constraint specificity",
  "Structuring refined instruction blocks"
];

export const AnalyzeState: React.FC = () => {
  const [currentStage, setCurrentStage] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStage((prev) => {
        if (prev < STAGES.length - 1) {
          return prev + 1;
        }
        return prev;
      });
    }, 600);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full flex flex-col items-center justify-center py-10 px-4 max-w-sm mx-auto">
      {/* Editorial scanning animation */}
      <div className="relative w-12 h-1 bg-border-base rounded-full overflow-hidden mb-5">
        <div 
          className="absolute top-0 left-0 h-full bg-brand rounded-full animate-[shimmer_1.5s_infinite_linear]"
          style={{ width: '40%' }}
        />
      </div>

      <h3 className="text-xs font-mono uppercase tracking-wider text-brand mb-4">
        Analyzing Prompt
      </h3>

      <ul className="w-full space-y-3.5 text-xs md:text-sm font-sans">
        {STAGES.map((stage, idx) => {
          const isDone = idx < currentStage;
          const isActive = idx === currentStage;
          
          return (
            <div
              key={stage}
              style={{
                opacity: isDone ? 0.6 : isActive ? 1.0 : 0.35,
                transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
              }}
              className={`flex items-center gap-3 transition-transform duration-300 ${isActive ? 'translate-x-1.5' : 'translate-x-0'}`}
            >
              {isDone ? (
                <svg className="w-4 h-4 text-success shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : isActive ? (
                <span className="w-4 h-4 flex items-center justify-center shrink-0">
                  <span className="w-2 h-2 rounded-full bg-brand animate-ping absolute" />
                  <span className="w-2 h-2 rounded-full bg-brand relative" />
                </span>
              ) : (
                <span className="w-4 h-4 flex items-center justify-center shrink-0">
                  <span className="w-1 h-1 rounded-full bg-text-muted/30" />
                </span>
              )}
              <span className={`transition-all duration-300 ${isActive ? 'font-medium pl-0.5 text-text-base' : 'text-text-muted'}`}>
                {stage}
              </span>
            </div>
          );
        })}
      </ul>
      
      {/* Inject custom scan CSS frames if not compiled by default */}
      <style>{`
        @keyframes shimmer {
          0% { left: -40%; }
          100% { left: 100%; }
        }
      `}</style>
    </div>
  );
};
