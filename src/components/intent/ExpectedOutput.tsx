import React from 'react';

interface ExpectedOutputProps {
  expectedOutput: string[];
  expectedQuality: number;
}

export const ExpectedOutput: React.FC<ExpectedOutputProps> = ({
  expectedOutput,
  expectedQuality
}) => {
  if (!expectedOutput || expectedOutput.length === 0) return null;

  return (
    <div className="w-full border border-border-base rounded-lg p-6 bg-bg-base mt-6 flex flex-col md:flex-row gap-8 justify-between items-start md:items-center">
      <div className="flex-1">
        <h3 className="text-xs font-mono uppercase tracking-wider text-text-muted mb-4">
          What you&apos;ll probably get
        </h3>
        
        <ul className="space-y-2.5">
          {expectedOutput.map((item, idx) => (
            <li key={idx} className="flex items-center gap-2.5 text-sm text-text-base">
              <span className="w-4 h-4 rounded-full bg-success/15 text-success flex items-center justify-center shrink-0">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </span>
              <span className="font-sans">{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="w-full md:w-60 border-t md:border-t-0 md:border-l border-border-base pt-6 md:pt-0 md:pl-8 flex flex-col justify-center">
        <div className="flex items-baseline gap-1 mb-1">
          <span className="text-xs font-mono uppercase tracking-wider text-text-muted">
            Expected Quality
          </span>
        </div>
        
        <div className="flex items-baseline gap-1.5">
          <span className="text-4xl font-serif text-success font-medium">
            {expectedQuality}
          </span>
          <span className="text-sm font-mono text-text-muted">/ 10</span>
        </div>
        
        <p className="text-[11px] text-text-muted mt-2 leading-relaxed font-sans">
          This rating predicts how much more specific and aligned the LLM output will be compared to your original prompt.
        </p>
      </div>
    </div>
  );
};
