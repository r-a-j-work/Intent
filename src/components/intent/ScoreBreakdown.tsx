import React from 'react';
import type { ScoreBreakdown as ScoreBreakdownType } from '../../lib/intent/types';

interface ScoreBreakdownProps {
  breakdown: ScoreBreakdownType;
}

export const ScoreBreakdown: React.FC<ScoreBreakdownProps> = ({ breakdown }) => {
  const metrics = [
    { label: 'Clarity', value: breakdown.clarity },
    { label: 'Context', value: breakdown.context },
    { label: 'Specificity', value: breakdown.specificity },
    { label: 'Constraints', value: breakdown.constraints },
    { label: 'Expected Output', value: breakdown.expectedOutput }
  ];

  return (
    <div className="w-full space-y-4">
      <h4 className="text-[10px] font-mono uppercase tracking-wider text-text-muted mb-2">
        Prompt Parameters
      </h4>
      
      <div className="space-y-3.5">
        {metrics.map((metric) => (
          <div key={metric.label} className="space-y-1.5">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-text-base font-medium">{metric.label}</span>
              <span className="text-text-muted">{metric.value}%</span>
            </div>
            
            {/* Elegant visual line progress indicator */}
            <div className="relative w-full h-1 bg-border-base rounded-full overflow-hidden">
              <div 
                className="absolute top-0 left-0 h-full bg-text-base rounded-full transition-all duration-500 ease-out"
                style={{ width: `${metric.value}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
