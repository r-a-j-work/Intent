import React from 'react';

interface ResultActionsProps {
  onStartOver: () => void;
}

export const ResultActions: React.FC<ResultActionsProps> = ({ onStartOver }) => {
  return (
    <div className="w-full flex justify-center mt-6 pb-10">
      <button
        onClick={onStartOver}
        className="flex items-center gap-2 px-6 py-2.5 rounded border border-border-base bg-bg-base text-xs font-mono text-text-muted hover:text-text-base hover:border-text-muted transition-colors cursor-pointer"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 15l-3-3m0 0l3-3m-3 3h8M3 12a9 9 0 1118 0 9 9 0 01-18 0z" />
        </svg>
        Start Over
      </button>
    </div>
  );
};
