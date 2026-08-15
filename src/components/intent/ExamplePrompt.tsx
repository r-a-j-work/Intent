import React from 'react';

interface ExamplePromptProps {
  onSelect: (val: string) => void;
}

export const ExamplePrompt: React.FC<ExamplePromptProps> = ({ onSelect }) => {
  const exampleText = "Make me a cool landing page for my startup.";

  return (
    <div className="w-full mt-8 border-t border-border-base/50 pt-6">
      <h3 className="text-xs font-mono uppercase tracking-wider text-text-muted mb-4">
        How it helps
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Before Box */}
        <div 
          onClick={() => onSelect(exampleText)}
          className="group relative flex flex-col justify-between bg-bg-base border border-border-base rounded p-4 hover:border-brand/50 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgb(0,0,0,0.02)] dark:hover:shadow-[0_8px_30px_rgb(0,0,0,0.2)] transition-all duration-300 cursor-pointer"
        >
          <div>
            <div className="text-xs font-mono text-text-muted mb-2 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-brand/60" />
              Before (Rough idea)
            </div>
            <p className="text-sm font-medium text-text-base italic">
              &ldquo;{exampleText}&rdquo;
            </p>
          </div>
          <span className="text-[10px] text-brand opacity-0 group-hover:opacity-100 transition-opacity mt-4 font-mono">
            Click to try this prompt →
          </span>
        </div>

        {/* After Box */}
        <div className="relative flex flex-col justify-between bg-bg-base/30 border border-dashed border-border-base rounded p-4">
          <div>
            <div className="text-xs font-mono text-success mb-2 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-success" />
              After (Refined by Intent)
            </div>
            <div className="text-xs text-text-muted leading-relaxed font-mono whitespace-pre-line">
              {`# Objective
Create a high-converting, single-page landing page...

# Visual & Layout Constraints
- Charcoal dark-first aesthetic with a ruby accent
- 1px thin grid lines with constrained padding
- Editorial typography (serif titles + sans body)

# Technical requirements
- Dynamic HTML/CSS with modular ES6 JavaScript
- Optimized mobile responsiveness and page speed`}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
