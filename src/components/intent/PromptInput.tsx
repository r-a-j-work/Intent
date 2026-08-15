import React, { useRef, useEffect } from 'react';

interface PromptInputProps {
  value: string;
  onChange: (val: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
}

export const PromptInput: React.FC<PromptInputProps> = ({
  value,
  onChange,
  onSubmit,
  isLoading
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea to fit text length
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.max(120, textarea.scrollHeight)}px`;
  }, [value]);

  // Handle Cmd+Enter or Ctrl+Enter keyboard submission
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (value.trim() && !isLoading) {
        onSubmit();
      }
    }
  };

  return (
    <div className="w-full relative bg-bg-base border border-border-base rounded-lg p-4 transition-all duration-300 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand-muted/70 focus-within:bg-white dark:focus-within:bg-zinc-950 focus-within:shadow-[0_8px_30px_rgb(0,0,0,0.02)] dark:focus-within:shadow-[0_8px_30px_rgb(0,0,0,0.2)]">
      <label htmlFor="prompt-input" className="sr-only">
        Prompt Input
      </label>
      <textarea
        id="prompt-input"
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Paste your rough AI prompt here..."
        disabled={isLoading}
        rows={4}
        maxLength={5000}
        className="w-full bg-transparent text-text-base placeholder-text-muted resize-none outline-none text-base md:text-lg leading-relaxed no-scrollbar"
      />
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4 pt-3 border-t border-border-base/40 text-xs text-text-muted">
        <div className={`flex items-center gap-4 transition-colors duration-200 ${value.trim() ? 'text-text-base/80' : 'text-text-muted'}`}>
          <span className="font-mono">{value.length} characters</span>
          <span className="hidden sm:inline opacity-60">
            Press <kbd className="font-mono bg-border-base px-1.5 py-0.5 rounded text-[10px]">⌘</kbd> + <kbd className="font-mono bg-border-base px-1.5 py-0.5 rounded text-[10px]">Enter</kbd> to refine
          </span>
        </div>
        
        <button
          onClick={onSubmit}
          disabled={!value.trim() || isLoading}
          className={`group flex items-center justify-center gap-1 px-4 py-2 rounded font-medium text-sm transition-all duration-200 ${
            value.trim() && !isLoading
              ? 'bg-brand text-white hover:bg-brand/90 active:scale-[0.97] hover:scale-[1.01] hover:shadow-sm cursor-pointer'
              : 'bg-border-base text-text-muted cursor-not-allowed opacity-50'
          }`}
        >
          {isLoading ? (
            <span>Refining...</span>
          ) : (
            <>
              <span>Refine prompt</span>
              <span className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
