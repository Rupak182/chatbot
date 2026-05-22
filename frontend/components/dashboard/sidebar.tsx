import { Plus, Trash2, MessageSquare, Cpu, BarChart3 } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Conversation {
  id: string;
  title: string;
  model: string;
  created_at: string;
  updated_at: string;
}

interface SidebarProps {
  conversations: Conversation[];
  currentConversationId: string | null;
  isStreaming: boolean;
  startNewConversation: () => void;
  loadConversation: (id: string) => void;
  deleteConversation: (e: React.MouseEvent, id: string) => void;
}

export function Sidebar({
  conversations,
  currentConversationId,
  isStreaming,
  startNewConversation,
  loadConversation,
  deleteConversation
}: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="w-80 border-r border-zinc-900/80 bg-[#09090b] p-4 flex flex-col justify-between shrink-0 select-none">
      <div className="flex flex-col flex-1 min-h-0">
        
        {/* Header */}
        <div className="flex items-center gap-3 px-2 pb-5 border-b border-zinc-900/80">
          <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]" />
          <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
            Chatbot <span className="text-[10px] py-0.5 px-1.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-500 font-mono">v1.0</span>
          </h1>
        </div>

        {/* Global Navigation Tabs */}
        <div className="mt-4 flex flex-col gap-1">
          <Link
            href="/"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
              pathname === '/'
                ? 'bg-zinc-900 text-white border border-zinc-800'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/30'
            }`}
          >
            <MessageSquare className="h-4 w-4 shrink-0 text-cyan-400" />
            <span>Chat Workspace</span>
          </Link>
          <Link
            href="/dashboard"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
              pathname === '/dashboard'
                ? 'bg-zinc-900 text-white border border-zinc-800'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/30'
            }`}
          >
            <BarChart3 className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>Inference Analytics</span>
          </Link>
        </div>

        {/* New Chat Button */}
        <button
          onClick={startNewConversation}
          disabled={isStreaming}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-900 bg-zinc-900/30 py-3 px-4 text-sm font-medium text-zinc-100 hover:bg-zinc-900/70 hover:border-zinc-800 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
        >
          <Plus className="h-4 w-4 text-zinc-400" />
          New Conversation
        </button>

        {/* Past Sessions List */}
        <div className="mt-5 flex-1 overflow-y-auto space-y-1.5 pr-1 min-h-0 scrollbar-thin">
          {conversations.length === 0 ? (
            <div className="text-center py-10 text-xs text-zinc-600">
              No active chat sessions
            </div>
          ) : (
            conversations.map((conv) => {
              const isActive = conv.id === currentConversationId;
              return (
                <div
                  key={conv.id}
                  onClick={() => loadConversation(conv.id)}
                  className={`group relative flex items-center justify-between rounded-xl p-3 text-sm cursor-pointer transition-all border ${
                    isActive 
                      ? 'bg-zinc-900 border-zinc-800 text-white shadow-inner' 
                      : 'border-transparent text-zinc-400 hover:bg-zinc-900/40 hover:text-zinc-200'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-6">
                    <MessageSquare className={`h-4 w-4 shrink-0 ${isActive ? 'text-cyan-500' : 'text-zinc-500'}`} />
                    <div className="truncate font-medium">{conv.title || 'New Conversation'}</div>
                  </div>

                  <button
                    onClick={(e) => deleteConversation(e, conv.id)}
                    className="absolute right-3 opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 rounded transition-all text-zinc-500"
                    title="Delete chat"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-zinc-900/80 pt-4 flex items-center gap-3 px-1 text-xs text-zinc-600 font-mono">
        <Cpu className="h-4 w-4 text-zinc-700" />
        <span>Neon + LiteLLM + FastAPI</span>
      </div>
    </aside>
  );
}
