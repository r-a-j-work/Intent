import React from 'react';

interface OriginalPromptProps {
  prompt: string;
}

export const OriginalPrompt: React.FC<OriginalPromptProps> = ({ prompt }) => {
  if (!prompt.trim()) return null;

  return (
    <div className="w-full border border-border-base/50 rounded-lg p-4 bg-bg-base/30">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
          Your prompt
        </span>
        <span className="h-px bg-border-base/50 flex-1" />
      </div>
      <p className="text-sm text-text-muted leading-relaxed font-sans italic whitespace-pre-wrap">
        {prompt}
      </p>
    </div>
  );
};