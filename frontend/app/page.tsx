'use client';

import { useState, useEffect, useRef } from 'react';

import { Sidebar } from '@/components/dashboard/sidebar';
import { TelemetryHUD } from '@/components/dashboard/telemetry-hud';
import { Chat } from '@/components/ui/chat';
import { type Message } from '@/components/ui/chat-message';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

interface Conversation {
  id: string;
  title: string;
  model: string;
  created_at: string;
  updated_at: string;
}

interface Telemetry {
  latency_ms: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export default function Home() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeTelemetry, setActiveTelemetry] = useState<Telemetry | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('gemini/gemini-2.5-flash-lite');
  
  const abortControllerRef = useRef<AbortController | null>(null);

  // Initial Load: Fetch past chat histories from Neon PostgreSQL
  useEffect(() => {
    fetchConversations();
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

  // Fetch high-precision micro-cost telemetry for the active session
  const fetchTelemetry = async (convId: string) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/conversations/${convId}/telemetry`);
      if (res.ok) {
        const data = await res.json();
        if (data) {
          setActiveTelemetry({
            latency_ms: data.latency_ms,
            prompt_tokens: data.prompt_tokens || 0,
            completion_tokens: data.completion_tokens || 0,
            total_tokens: data.total_tokens || 0
          });
        } else {
          setActiveTelemetry(null);
        }
      }
    } catch (err) {
      console.error('Error fetching telemetry:', err);
    }
  };

  // Initialize a fresh new conversation session
  const startNewConversation = async () => {
    if (isStreaming) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/conversations/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selectedModel })
      });
      if (res.ok) {
        const data = await res.json();
        setConversations((prev) => [data, ...prev]);
        setCurrentConversationId(data.id);
        setMessages([]);
        setActiveTelemetry(null);
      }
    } catch (err) {
      console.error('Error starting conversation:', err);
    }
  };

  // Load a historical chat session, formatting backend timestamps into JS Date objects
  const loadConversation = async (id: string) => {
    if (isStreaming || id === currentConversationId) return;
    setIsLoadingHistory(true);
    setCurrentConversationId(id);
    setActiveTelemetry(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/conversations/${id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.model) {
          setSelectedModel(data.model);
        }
        const formattedMessages = (data.messages || []).map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.created_at ? new Date(m.created_at) : undefined
        }));
        setMessages(formattedMessages);
        await fetchTelemetry(id);
      }
    } catch (err) {
      console.error('Error loading conversation:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Optimistic cascading delete
  const deleteConversation = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (isStreaming) return;

    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (currentConversationId === id) {
      setCurrentConversationId(null);
      setMessages([]);
      setActiveTelemetry(null);
    }

    try {
      await fetch(`${BACKEND_URL}/api/v1/conversations/${id}`, {
        method: 'DELETE'
      });
    } catch (err) {
      console.error('Error deleting conversation:', err);
      fetchConversations();
    }
  };

  // E2E request trigger logic
  const handleSendMessage = async (textToSubmit: string) => {
    const promptText = textToSubmit.trim();
    if (!promptText || isStreaming) return;

    let activeId = currentConversationId;

    // 1. Auto-create conversation locally if we don't have one selected yet
    if (!activeId) {
      activeId = crypto.randomUUID();
      setCurrentConversationId(activeId);
      const tempConv: Conversation = {
        id: activeId,
        title: promptText.slice(0, 15) + (promptText.length > 15 ? '...' : ''),
        model: selectedModel,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      setConversations((prev) => [tempConv, ...prev]);
    } else {
      // Optimistically rename default "New Conversation" placeholder to prompt title instantly in the sidebar list!
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeId && c.title === 'New Conversation'
            ? { ...c, title: promptText.slice(0, 15) + (promptText.length > 15 ? '...' : '') }
            : c
        )
      );
    }

    // 2. Append User Message
    const userMsgId = crypto.randomUUID();
    const newUserMessage: Message = {
      id: userMsgId,
      role: 'user',
      content: promptText,
      createdAt: new Date()
    };

    const updatedMessages = [...messages, newUserMessage];
    setMessages(updatedMessages);
    setInput('');
    setIsStreaming(true);

    // 3. Append Assistant Placeholder
    const assistantMsgId = crypto.randomUUID();
    const newAssistantMessage: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      createdAt: new Date()
    };
    setMessages((prev) => [...prev, newAssistantMessage]);

    // Instantiate AbortController
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // 4. Hit Fast API Ingest streaming endpoint
      const response = await fetch(`${BACKEND_URL}/api/v1/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          conversation_id: activeId,
          messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
          model: selectedModel
        })
      });

      if (!response.ok) {
        let errorMsg = 'Connection failed. Verify that your local database is active and your backend settings are correct.';
        try {
          const errData = await response.json();
          if (errData?.detail) {
            errorMsg = errData.detail;
          }
        } catch {
          try {
            const txt = await response.text();
            if (txt) errorMsg = txt;
          } catch {}
        }
        throw new Error(errorMsg);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No streaming reader available');

      const decoder = new TextDecoder();
      let streamText = '';

      // 5. Read chunks
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        streamText += chunk;

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId ? { ...msg, content: streamText } : msg
          )
        );
      }

      // 6. Refetch Neon telemetry metrics once the background task commits
      setTimeout(() => {
        fetchTelemetry(activeId!);
        fetchConversations();
      }, 850);

    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Streaming aborted by user');
        // Cleanly remove the empty assistant bubble placeholder if cancelled before any tokens arrived!
        setMessages((prev) => {
          const lastMsg = prev.at(-1);
          if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content === '') {
            return prev.slice(0, -1);
          }
          return prev;
        });
      } else {
        console.error('Streaming error:', err);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId
              ? { 
                  ...msg, 
                  content: msg.content 
                    ? `${msg.content}\n\n⚠️ **Stream interrupted:** ${err.message || 'Connection lost.'}`
                    : `❌ ${err.message || 'Connection failed. Verify that your local database is active and your backend settings are correct.'}`
                }
              : msg
          )
        );
      }
    } finally {
      abortControllerRef.current = null;
      setIsStreaming(false);
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsStreaming(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const handleSubmit = (e?: { preventDefault?: () => void }) => {
    if (e && e.preventDefault) {
      e.preventDefault();
    }
    handleSendMessage(input);
  };

  const handleAppend = (message: { role: 'user'; content: string }) => {
    handleSendMessage(message.content);
  };

  const suggestionChips = [
    "Explain DMA in one sentence.",
    "Why is asyncpg so fast?",
    "Compare Neon with standard PostgreSQL.",
    "Show a quick Python Fast API route code snippet."
  ];

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#09090b] font-sans text-zinc-200">
      
      {/* 1. LEFT PANEL: SIDEBAR HISTORY */}
      <Sidebar
        conversations={conversations}
        currentConversationId={currentConversationId}
        isStreaming={isStreaming}
        startNewConversation={startNewConversation}
        loadConversation={loadConversation}
        deleteConversation={deleteConversation}
      />

      {/* 2. RIGHT PANEL: CHAT FEED + TELEMETRY HUD */}
      <main className="flex-1 flex flex-col h-full bg-[#0c0c0e] relative min-w-0">
        
        {/* Header HUD */}
        <TelemetryHUD
          currentConversationId={currentConversationId}
          activeTelemetry={activeTelemetry}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
        />

        {/* Premium Shadcn Chatbot Kit Workspace Component */}
        <div className="flex-1 overflow-hidden p-6 relative max-w-4xl w-full mx-auto flex flex-col justify-between">
          {isLoadingHistory ? (
            <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 gap-2">
              <span className="text-xs font-mono animate-pulse">Synchronizing conversation history...</span>
            </div>
          ) : (
            <Chat
              messages={messages}
              input={input}
              handleInputChange={handleInputChange}
              handleSubmit={handleSubmit}
              isGenerating={isStreaming}
              stop={handleStop}
              append={handleAppend}
              suggestions={suggestionChips}
              setMessages={setMessages}
              className="h-full w-full"
            />
          )}
        </div>

      </main>

    </div>
  );
}
