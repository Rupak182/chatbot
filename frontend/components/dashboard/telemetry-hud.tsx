import { Activity, Coins } from 'lucide-react';

interface Telemetry {
  latency_ms: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface TelemetryHUDProps {
  currentConversationId: string | null;
  activeTelemetry: Telemetry | null;
  selectedModel: string;
  onModelChange: (model: string) => void;
}

export function TelemetryHUD({
  currentConversationId,
  activeTelemetry,
  selectedModel,
  onModelChange
}: TelemetryHUDProps) {
  return (
    <header className="h-14 border-b border-zinc-900/80 px-6 flex items-center justify-between select-none shrink-0 bg-[#09090b] z-10">
      {/* Left: Title */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-zinc-100 tracking-wide">
          {currentConversationId ? 'Active Workspace' : 'Telemetry Monitor'}
        </span>
        <select
          value={selectedModel}
          onChange={(e) => onModelChange(e.target.value)}
          className="text-[10px] font-mono py-0.5 px-2 rounded bg-zinc-950 border border-zinc-800 text-cyan-400 focus:outline-none focus:border-cyan-700 cursor-pointer outline-none transition-colors"
        >
          <option value="gemini/gemini-2.5-flash-lite">gemini-2.5-flash-lite</option>
          <option value="gemini/gemini-2.5-flash">gemini-2.5-flash</option>
          <option value="gemini/gemini-3.5-flash">gemini-3.5-flash</option>
          <option value="gemini/gemma-4-31b-it">gemma-4-31b-it</option>
          <option value="groq/llama-3.3-70b-versatile">llama-3.3-70b (groq)</option>
          <option value="groq/llama-3.1-8b-instant">llama-3.1-8b (groq)</option>
        </select>
      </div>

      {/* Right: Telemetry Pills */}
      <div className="flex items-center gap-3">

        {/* Latency */}
        <div className="flex items-center gap-2 bg-zinc-900/40 border border-zinc-800 rounded-lg px-3 h-8">
          <Activity className={`h-3 w-3 shrink-0 ${activeTelemetry ? 'text-amber-500 animate-pulse' : 'text-zinc-600'}`} />
          <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider">Latency</span>
          <span className="text-xs font-bold font-mono text-zinc-200 min-w-[2.5rem] text-right">
            {activeTelemetry ? `${activeTelemetry.latency_ms}ms` : '---'}
          </span>
        </div>

        {/* Tokens */}
        <div className="flex items-center gap-2 bg-zinc-900/40 border border-zinc-800 rounded-lg px-3 h-8">
          <Coins className={`h-3 w-3 shrink-0 ${activeTelemetry ? 'text-emerald-500' : 'text-zinc-600'}`} />
          <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider">Tokens</span>
          <span
            className="text-xs font-bold font-mono text-zinc-200 min-w-[2rem] text-right"
            title={activeTelemetry ? `${activeTelemetry.prompt_tokens} in / ${activeTelemetry.completion_tokens} out` : ''}
          >
            {activeTelemetry ? activeTelemetry.total_tokens : '---'}
          </span>
        </div>

      </div>
    </header>
  );
}
