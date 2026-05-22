'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/dashboard/sidebar';
import { 
  Activity, 
  Clock, 
  Cpu, 
  AlertTriangle, 
  TrendingUp, 
  CheckCircle, 
  RefreshCw, 
  Database,
  ArrowUpRight
} from 'lucide-react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

interface ModelStat {
  model: string;
  count: number;
  avg_latency: number;
}

interface RecentLog {
  id: string;
  conversation_id: string | null;
  model: string;
  status: string;
  latency_ms: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  error_message: string | null;
  created_at: string;
}

interface AnalyticsData {
  total_requests: number;
  total_tokens: number;
  avg_latency_ms: number;
  error_count: number;
  success_rate: number;
  model_stats: ModelStat[];
  recent_logs: RecentLog[];
}

interface Conversation {
  id: string;
  title: string;
  model: string;
  created_at: string;
  updated_at: string;
}

export default function Dashboard() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    fetchConversations();
    fetchAnalytics();
  }, []);

  const fetchConversations = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/conversations/`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch (err) {
      console.error('Error fetching conversations:', err);
    }
  };

  const fetchAnalytics = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/conversations/analytics`);
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
      }
    } catch (err) {
      console.error('Error fetching analytics:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Redirect to home and trigger dynamic history loading
  const handleLoadConversation = (id: string) => {
    router.push(`/?session=${id}`);
  };

  const handleStartNewConversation = () => {
    router.push('/');
  };

  const handleDeleteConversation = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setConversations((prev) => prev.filter((c) => c.id !== id));
    try {
      await fetch(`${BACKEND_URL}/api/v1/conversations/${id}`, {
        method: 'DELETE'
      });
      fetchAnalytics();
    } catch (err) {
      console.error('Error deleting conversation:', err);
      fetchConversations();
    }
  };

  // Helper to slice model name for clean visual badges
  const cleanModelName = (name: string) => {
    return name.replace('gemini/', '').replace('groq/', '');
  };

  // Helper to format timestamps
  const formatTime = (isoString: string) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#09090b] font-sans text-zinc-200">
      
      {/* 1. PERSISTENT SIDEBAR */}
      <Sidebar
        conversations={conversations}
        currentConversationId={null}
        isStreaming={false}
        startNewConversation={handleStartNewConversation}
        loadConversation={handleLoadConversation}
        deleteConversation={handleDeleteConversation}
      />

      {/* 2. MAIN OBSERVER DASHBOARD */}
      <main className="flex-1 flex flex-col h-full bg-[#0c0c0e] relative overflow-y-auto scrollbar-thin">
        
        {/* Top Header */}
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-zinc-900 bg-[#0c0c0e]/80 px-6 backdrop-blur">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-emerald-400" />
            <h2 className="text-sm font-semibold tracking-tight text-zinc-100 font-mono">system.telemetry_dashboard</h2>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchAnalytics}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 text-[10px] font-mono py-1 px-2.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-zinc-100 hover:border-zinc-700 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
              REFRESH
            </button>
          </div>
        </header>

        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 gap-2">
            <span className="text-xs font-mono animate-pulse">Aggregating telemetry observability logs...</span>
          </div>
        ) : !analytics || analytics.total_requests === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-600 gap-3 p-12 text-center">
            <Database className="h-10 w-10 text-zinc-800 animate-bounce" />
            <h3 className="text-sm font-semibold text-zinc-400 font-mono">No Observability Logs Found</h3>
            <p className="text-xs max-w-sm text-zinc-500 font-sans leading-relaxed">
              Start conversations in the workspace. Telemetry events will ingest and render performance analytics here.
            </p>
            <button
              onClick={handleStartNewConversation}
              className="mt-2 text-xs font-mono py-2 px-4 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 hover:text-white transition-all cursor-pointer"
            >
              Initialize First Session ⚡
            </button>
          </div>
        ) : (
          <div className="p-6 max-w-5xl w-full mx-auto space-y-6">

            {/* A. OBSERVE KPI GRID */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              
              {/* Throughput */}
              <div className="rounded-2xl border border-zinc-900 bg-zinc-950/40 p-5 flex flex-col justify-between hover:border-zinc-800 transition-colors">
                <div className="flex items-center justify-between text-zinc-500">
                  <span className="text-xs font-mono tracking-wider">01 // THROUGHPUT</span>
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                </div>
                <div className="mt-4">
                  <div className="text-3xl font-extrabold text-white font-mono tracking-tight">
                    {analytics.total_requests} <span className="text-xs text-zinc-600 font-medium">queries</span>
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-1 font-mono">
                    Volume: <span className="text-emerald-500">{(analytics.total_tokens / 1000).toFixed(1)}k</span> total tokens processed
                  </p>
                </div>
              </div>

              {/* Latency */}
              <div className="rounded-2xl border border-zinc-900 bg-zinc-950/40 p-5 flex flex-col justify-between hover:border-zinc-800 transition-colors">
                <div className="flex items-center justify-between text-zinc-500">
                  <span className="text-xs font-mono tracking-wider">02 // LATENCY</span>
                  <Clock className="h-4 w-4 text-cyan-400" />
                </div>
                <div className="mt-4">
                  <div className="text-3xl font-extrabold text-white font-mono tracking-tight">
                    {analytics.avg_latency_ms} <span className="text-xs text-zinc-600 font-medium">ms</span>
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-1 font-mono">
                    System response speed: <span className="text-cyan-400">p50 average</span>
                  </p>
                </div>
              </div>

              {/* Reliability */}
              <div className="rounded-2xl border border-zinc-900 bg-zinc-950/40 p-5 flex flex-col justify-between hover:border-zinc-800 transition-colors">
                <div className="flex items-center justify-between text-zinc-500">
                  <span className="text-xs font-mono tracking-wider">03 // AVAILABILITY</span>
                  <AlertTriangle className={`h-4 w-4 ${analytics.success_rate >= 90 ? 'text-emerald-400' : 'text-amber-500'}`} />
                </div>
                <div className="mt-4">
                  <div className="text-3xl font-extrabold text-white font-mono tracking-tight">
                    {analytics.success_rate}%
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-1 font-mono">
                    Status breakdown: <span className="text-red-500">{analytics.error_count} system exceptions</span>
                  </p>
                </div>
              </div>

            </div>

            {/* B. DETAILED CHARTS GRID */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Latency Comparison (Bar Chart) */}
              <div className="lg:col-span-2 rounded-2xl border border-zinc-900 bg-[#09090b]/40 p-5 flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-mono text-zinc-400 tracking-wider">MODEL PERFORMANCE DISTRIBUTION (avg_latency_ms)</h3>
                  <p className="text-[10px] text-zinc-600 mt-1 font-sans">Speed breakdown across Gemini, Gemma and Groq providers</p>
                </div>

                <div className="mt-8 space-y-4">
                  {analytics.model_stats.map((stat, i) => {
                    // Maximum width calculations
                    const maxLatency = Math.max(...analytics.model_stats.map(s => s.avg_latency), 1000);
                    const percentage = (stat.avg_latency / maxLatency) * 100;
                    
                    return (
                      <div key={i} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-mono">
                          <span className="text-zinc-300 truncate max-w-xs">{cleanModelName(stat.model)}</span>
                          <span className="text-cyan-400 font-bold">{stat.avg_latency.toFixed(0)} ms</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-zinc-950 border border-zinc-900 overflow-hidden relative">
                          <div 
                            className="h-full rounded-full transition-all duration-500 ease-out bg-gradient-to-r from-cyan-600 to-emerald-500"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[9px] text-zinc-600 font-mono">
                          <span>Total calls: {stat.count}</span>
                          <span>Throughput index: {((stat.count / analytics.total_requests) * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Status Breakdown Gauge */}
              <div className="rounded-2xl border border-zinc-900 bg-[#09090b]/40 p-5 flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-mono text-zinc-400 tracking-wider">RELIABILITY INDEX</h3>
                  <p className="text-[10px] text-zinc-600 mt-1 font-sans">Success rate against system anomalies</p>
                </div>

                {/* SVG Radial Progress Ring */}
                <div className="flex flex-col items-center justify-center py-6 relative">
                  <svg className="w-32 h-32 transform -rotate-90">
                    {/* Background ring */}
                    <circle 
                      cx="64" cy="64" r="50" 
                      className="stroke-zinc-900 fill-transparent" 
                      strokeWidth="6" 
                    />
                    {/* Glowing active ring */}
                    <circle 
                      cx="64" cy="64" r="50" 
                      className="stroke-emerald-500 fill-transparent transition-all duration-1000 ease-out" 
                      strokeWidth="6"
                      strokeDasharray={`${2 * Math.PI * 50}`}
                      strokeDashoffset={`${2 * Math.PI * 50 * (1 - analytics.success_rate / 100)}`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center justify-center font-mono">
                    <span className="text-xl font-extrabold text-white">{analytics.success_rate}%</span>
                    <span className="text-[8px] text-zinc-500 tracking-widest mt-0.5">STABLE</span>
                  </div>
                </div>

                <div className="flex items-center justify-around text-center text-[10px] font-mono border-t border-zinc-900 pt-4 mt-2">
                  <div>
                    <div className="text-zinc-400">{analytics.total_requests - analytics.error_count}</div>
                    <div className="text-zinc-600 text-[8px]">SUCCESS</div>
                  </div>
                  <div className="border-l border-zinc-900 h-6 shrink-0" />
                  <div>
                    <div className="text-red-500">{analytics.error_count}</div>
                    <div className="text-zinc-600 text-[8px]">EXCEPTIONS</div>
                  </div>
                </div>
              </div>

            </div>

            {/* C. LIVE LOG STREAM TABLE */}
            <div className="rounded-2xl border border-zinc-900 bg-[#09090b]/40 p-5">
              <div className="flex items-center justify-between pb-4 border-b border-zinc-900">
                <div>
                  <h3 className="text-xs font-mono text-zinc-300 tracking-wider">LIVE INFERENCE TRACES</h3>
                  <p className="text-[10px] text-zinc-600 mt-1 font-sans">Real-time log ingestion stream of LLM requests</p>
                </div>
                <Database className="h-4 w-4 text-zinc-700 animate-pulse" />
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs font-mono border-collapse">
                  <thead>
                    <tr className="text-zinc-600 border-b border-zinc-900/60 pb-2">
                      <th className="py-2.5 font-semibold">TIME</th>
                      <th className="py-2.5 font-semibold">MODEL</th>
                      <th className="py-2.5 font-semibold text-center">STATUS</th>
                      <th className="py-2.5 font-semibold text-right">LATENCY</th>
                      <th className="py-2.5 font-semibold text-right">TOKENS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900/40">
                    {analytics.recent_logs.map((log) => {
                      const isError = log.status === 'error';
                      return (
                        <tr 
                          key={log.id} 
                          onClick={() => log.conversation_id && handleLoadConversation(log.conversation_id)}
                          className="hover:bg-zinc-900/20 transition-all cursor-pointer group"
                        >
                          <td className="py-3 text-zinc-500 font-light flex items-center gap-1.5">
                            <ArrowUpRight className="h-3 w-3 text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity" />
                            {formatTime(log.created_at)}
                          </td>
                          <td className="py-3 font-semibold text-zinc-300">{cleanModelName(log.model)}</td>
                          <td className="py-3 text-center">
                            <span className={`inline-block text-[9px] py-0.5 px-2 rounded-full font-bold uppercase ${
                              isError 
                                ? 'bg-red-950/40 border border-red-900/60 text-red-500' 
                                : log.status === 'canceled'
                                  ? 'bg-amber-950/40 border border-amber-900/60 text-amber-500'
                                  : 'bg-emerald-950/40 border border-emerald-900/60 text-emerald-400'
                            }`}>
                              {log.status}
                            </span>
                          </td>
                          <td className={`py-3 text-right font-bold ${isError ? 'text-zinc-700' : 'text-cyan-400'}`}>
                            {isError ? '—' : `${log.latency_ms}ms`}
                          </td>
                          <td className="py-3 text-right">
                            {isError ? (
                              <span className="text-[10px] text-red-400 truncate max-w-[150px] inline-block font-sans" title={log.error_message || ''}>
                                {log.error_message || 'API Exception'}
                              </span>
                            ) : (
                              <span className="text-zinc-400 text-[10px] bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                                {log.total_tokens} <span className="text-[8px] text-zinc-600">tkn</span>
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

      </main>

    </div>
  );
}
