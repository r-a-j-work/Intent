import React from 'react';
import type { Weakness } from '../../lib/intent/types';

interface WeaknessListProps {
  weaknesses: Weakness[];
}

export const WeaknessList: React.FC<WeaknessListProps> = ({ weaknesses }) => {
  if (!weaknesses || weaknesses.length === 0) return null;

  return (
    <div className="w-full border-t border-border-base/50 pt-6 mt-6">
      <h3 className="text-xs font-mono uppercase tracking-wider text-text-muted mb-4">
        What&apos;s holding it back?
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {weaknesses.map((weakness, idx) => (
          <div 
            key={`${weakness.category}-${idx}`} 
            className="flex flex-col bg-bg-base border border-border-base rounded p-5 relative overflow-hidden"
          >
            {/* Minimal top highlight stripe */}
            <div className="absolute top-0 left-0 w-full h-[2px] bg-brand/60" />
            
            <span className="text-[10px] font-mono text-brand font-semibold mb-2.5 tracking-wider uppercase">
              {weakness.category}
            </span>
            
            <h4 className="text-sm font-medium text-text-base mb-2">
              {weakness.title}
            </h4>
            
            <p className="text-xs text-text-muted leading-relaxed font-sans mt-auto">
              {weakness.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};
