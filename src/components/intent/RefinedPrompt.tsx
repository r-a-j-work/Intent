import React, { useState, useEffect } from 'react';

interface RefinedPromptProps {
  refinedPrompt: string;
  onUpdate: (updatedPrompt: string) => void;
  onRefineAgain: () => void;
}

export const RefinedPrompt: React.FC<RefinedPromptProps> = ({
  refinedPrompt,
  onUpdate,
  onRefineAgain
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(refinedPrompt);
  const [copiedText, setCopiedText] = useState<'none' | 'prompt' | 'markdown'>('none');

  // Keep state synced with outer refinedPrompt if it changes (e.g. on new refinement)
  useEffect(() => {
    setEditValue(refinedPrompt);
  }, [refinedPrompt]);

  const handleCopy = async (type: 'prompt' | 'markdown') => {
    try {
      const textToCopy = type === 'markdown' 
        ? `### Refined Prompt\n\n\`\`\`markdown\n${editValue}\n\`\`\``
        : editValue;
        
      await navigator.clipboard.writeText(textToCopy);
      setCopiedText(type);
      setTimeout(() => setCopiedText('none'), 2000);
    } catch (e) {
      console.error('Failed to copy text', e);
    }
  };

  const handleSave = () => {
    onUpdate(editValue);
    setIsEditing(false);
  };

  return (
    <div className="w-full border border-border-base rounded-lg p-6 bg-bg-base mt-6">
      <div className="flex items-center justify-between border-b border-border-base/50 pb-4 mb-4">
        <h3 className="text-xs font-mono uppercase tracking-wider text-text-muted">
          Refined Prompt
        </h3>
        
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <button 
                onClick={() => { setEditValue(refinedPrompt); setIsEditing(false); }}
                className="px-2.5 py-1 text-xs border border-border-base rounded text-text-muted hover:text-text-base cursor-pointer"
              >
                Cancel
              </button>
              <button 
                onClick={handleSave}
                className="px-2.5 py-1 text-xs bg-text-base text-bg-base border border-text-base rounded font-medium hover:opacity-90 cursor-pointer"
              >
                Save
              </button>
            </>
          ) : (
            <button 
              onClick={() => setIsEditing(true)}
              className="px-2.5 py-1 text-xs border border-border-base rounded text-text-muted hover:text-text-base hover:border-text-muted transition-colors cursor-pointer"
            >
              Edit Prompt
            </button>
          )}
        </div>
      </div>

      {isEditing ? (
        <textarea
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          className="w-full bg-bg-base border border-border-base rounded p-4 font-mono text-xs md:text-sm text-text-base focus:ring-1 focus:ring-brand outline-none min-h-[220px] resize-y"
        />
      ) : (
        <div className="relative">
          <div className="w-full bg-bg-base/30 border border-border-base/60 rounded p-4 font-mono text-xs md:text-sm text-text-base leading-relaxed whitespace-pre-wrap select-all overflow-x-auto max-h-[360px] overflow-y-auto">
            {editValue}
          </div>
        </div>
      )}

      {!isEditing && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4 pt-4 border-t border-border-base/50">
          <button
            onClick={onRefineAgain}
            className="text-xs font-mono text-brand hover:underline flex items-center gap-1.5 cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 6H16" />
            </svg>
            Refine this output again
          </button>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleCopy('markdown')}
              className={`px-3 py-1.5 rounded text-xs font-medium border border-border-base transition-all duration-200 cursor-pointer ${
                copiedText === 'markdown' 
                  ? 'bg-success/10 border-success text-success' 
                  : 'bg-bg-base text-text-muted hover:text-text-base hover:border-text-muted'
              }`}
            >
              {copiedText === 'markdown' ? 'Copied Markdown!' : 'Copy as Markdown'}
            </button>
            <button
              onClick={() => handleCopy('prompt')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-all duration-200 cursor-pointer ${
                copiedText === 'prompt' 
                  ? 'bg-success text-white' 
                  : 'bg-text-base text-bg-base hover:opacity-90'
              }`}
            >
              {copiedText === 'prompt' ? '✓ Copied!' : 'Copy Prompt'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
