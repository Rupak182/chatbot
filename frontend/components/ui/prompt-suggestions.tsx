'use client';

import { Sparkles, ChevronRight } from "lucide-react";

interface PromptSuggestionsProps {
  label: string;
  append: (message: { role: "user"; content: string }) => void;
  suggestions: string[];
}

export function PromptSuggestions({
  label,
  append,
  suggestions,
}: PromptSuggestionsProps) {
  return (
    <div className="space-y-4 max-w-2xl mx-auto w-full px-4 select-none animate-in fade-in slide-in-from-bottom-2 duration-300">
      
      {/* Premium subtle heading */}
      <h2 className="text-center text-[10px] font-mono font-bold tracking-widest text-zinc-500 uppercase flex items-center justify-center gap-2">
        <Sparkles className="h-3 w-3 text-cyan-500" />
        {label}
      </h2>

      {/* Grid of suggestions */}
      <div className="grid grid-cols-2 gap-3 mt-4">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            onClick={() => append({ role: "user", content: suggestion })}
            className="flex items-center justify-between p-4 text-xs font-medium border border-zinc-900 bg-zinc-900/25 hover:bg-zinc-900/60 hover:border-zinc-700/80 rounded-xl text-zinc-400 hover:text-zinc-200 transition-all text-left cursor-pointer group active:scale-[0.98] duration-200"
          >
            <span className="leading-normal">{suggestion}</span>
            <ChevronRight className="h-3.5 w-3.5 text-zinc-700 group-hover:text-zinc-500 shrink-0 ml-2 transition-colors" />
          </button>
        ))}
      </div>
    </div>
  );
}
