import React, { useState, useEffect } from 'react';
import type { ScoreBreakdown as ScoreBreakdownType } from '../../lib/intent/types';
import { ScoreBreakdown } from './ScoreBreakdown';

interface IntentScoreProps {
  score: number;
  summary: string;
  breakdown: ScoreBreakdownType;
}

export const IntentScore: React.FC<IntentScoreProps> = ({
  score,
  summary,
  breakdown
}) => {
  const [displayScore, setDisplayScore] = useState(0);

  useEffect(() => {
    let start = 0;
    const end = score;
    if (start === end) {
      setDisplayScore(end);
      return;
    }
    
    const duration = 750; // Total animation length in ms
    const frameRate = 16; // ~60fps
    const totalFrames = duration / frameRate;
    const increment = Math.max(1, Math.ceil(end / totalFrames));

    const timer = setInterval(() => {
      start += increment;
      if (start >= end) {
        start = end;
        clearInterval(timer);
      }
      setDisplayScore(start);
    }, frameRate);

    return () => clearInterval(timer);
  }, [score]);

  return (
    <div className="w-full border border-border-base rounded-lg p-6 bg-bg-base flex flex-col md:flex-row gap-8 items-start md:items-center justify-between">
      <div className="flex-1">
        <div className="flex items-baseline gap-2 mb-3">
          <span className="text-xs font-mono uppercase tracking-wider text-text-muted">
            Intent Score
          </span>
          <span className="h-px bg-border-base flex-1" />
        </div>
        
        <div className="flex items-baseline gap-2">
          <span className="text-6xl md:text-7xl font-serif font-light text-brand">
            {displayScore}
          </span>
          <span className="text-lg md:text-xl font-mono text-text-muted">
            / 100
          </span>
        </div>
        
        <p className="text-sm md:text-base text-text-base mt-4 leading-relaxed font-sans max-w-xl">
          {summary}
        </p>
      </div>

      <div className="w-full md:w-72 shrink-0 border-t md:border-t-0 md:border-l border-border-base pt-6 md:pt-0 md:pl-8">
        <ScoreBreakdown breakdown={breakdown} />
      </div>
    </div>
  );
};
