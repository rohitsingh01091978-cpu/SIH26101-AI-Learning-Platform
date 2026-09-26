import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles, X, Send, Bot, User, Loader2, RotateCw, AlertCircle } from 'lucide-react';
import { sendChat } from '../services/assistantService';

const QUICK_QUESTIONS = [
  'What should I learn next?',
  'Why is this my top priority?',
  'Explain my competency gap',
  'What course is recommended for me?',
  'Why did my score change?',
];

const WELCOME = {
  id: 'welcome',
  role: 'assistant',
  text: "Hi, I'm the Karmayogi AI Assistant. Ask me about your priorities, skill gaps, recommended courses, assessments or progress - I'll answer from your live competency data.",
  time: new Date(),
};

const MAX_LENGTH = 1000;
const timeLabel = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// On phones the on-screen keyboard covers the bottom of the page without resizing it. When (and only
// when) that happens, lift the panel by the covered height so the input stays visible. On desktop the
// panel is sized purely by CSS (top: 0 / bottom: 0), so it can never be measured wrongly and pushed
// off-screen - the input is always inside the window.
function useKeyboardInset(active) {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (!active || !vv || !touch) {
      setInset(0);
      return undefined;
    }
    const update = () => {
      const covered = window.innerHeight - vv.height - vv.offsetTop;
      setInset(covered > 120 ? Math.round(covered) : 0); // small values are browser chrome, not a keyboard
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [active]);
  return inset;
}

function providerLabel(m) {
  if (m.provider === 'external') return 'AI model · uses your data';
  if (m.provider === 'demo') return m.fellBack ? 'Offline demo assistant (AI model unavailable) · your data' : 'Offline demo assistant · your data';
  return null;
}

/**
 * "Karmayogi AI Assistant" - a conversational assistant grounded in the signed-in learner's
 * real data. Every answer comes from POST /api/assistant/chat (the backend builds the
 * learner's context from the JWT identity); nothing is scripted or computed in the browser.
 * The conversation lives in this component's state, so closing and reopening the panel (or
 * navigating between pages) keeps it; signing out discards it.
 */
export default function AIAssistant() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([WELCOME]);
  const [input, setInput] = useState('');
  const endRef = useRef(null);
  const textareaRef = useRef(null);
  const nextId = useRef(1);
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  const keyboardInset = useKeyboardInset(open);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading, open, keyboardInset]);

  const historyFor = (list) =>
    list
      .filter((m) => m.id !== 'welcome' && !m.error && (m.role === 'user' || m.role === 'assistant'))
      .slice(-6)
      .map((m) => ({ role: m.role, text: m.text }));

  const ask = useCallback(
    async (question, { retry = false } = {}) => {
      const text = question.trim();
      if (!text || loading) return;

      // Work from the current list synchronously (a ref), so history is never read from a state updater.
      let base = [...messagesRef.current];
      if (retry) {
        // Drop the failed attempt (error bubble + the user message that preceded it) before re-sending.
        if (base[base.length - 1]?.error) base.pop();
        if (base[base.length - 1]?.role === 'user' && base[base.length - 1].text === text) base.pop();
      }
      const userMessage = { id: `u${nextId.current++}`, role: 'user', text, time: new Date() };
      setMessages([...base, userMessage]);
      setInput('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      setLoading(true);

      try {
        const data = await sendChat(text, historyFor(base));
        setMessages((m) => [
          ...m,
          { id: `a${nextId.current++}`, role: 'assistant', text: data.reply, time: new Date(), provider: data.provider, fellBack: data.fellBack },
        ]);
      } catch (err) {
        const status = err?.response?.status;
        const friendly =
          status === 429
            ? 'You are sending messages too quickly. Please wait a moment and try again.'
            : status === 400
              ? 'Please type a question (up to 1000 characters).'
              : "I couldn't get an answer just now. Please check your connection and try again.";
        setMessages((m) => [
          ...m,
          { id: `e${nextId.current++}`, role: 'assistant', text: friendly, time: new Date(), error: true, retryText: status === 400 ? null : text },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [loading]
  );

  const handleKeyDown = (e) => {
    // Enter sends, Shift+Enter inserts a new line. Ignore Enter while an IME is composing.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      ask(input);
    }
  };

  const handleInput = (e) => {
    setInput(e.target.value.slice(0, MAX_LENGTH));
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 104)}px`;
    el.style.overflowY = el.scrollHeight > 104 ? 'auto' : 'hidden';
  };

  const canSend = input.trim().length > 0 && !loading;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open Karmayogi AI Assistant"
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-primary-600 px-4 py-3 text-sm font-semibold text-white shadow-popover transition-all hover:bg-primary-700 active:scale-95"
      >
        <Sparkles size={17} />
        <span className="hidden sm:inline">Karmayogi AI</span>
      </button>

      {open && (
        <div
          className="fixed left-0 right-0 top-0 z-[95] flex justify-end"
          style={{ bottom: keyboardInset }}
        >
          <div className="absolute inset-0 bg-ink-950/30 animate-fade-in" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-label="Karmayogi AI Assistant"
            className="relative flex h-full w-full max-w-sm flex-col bg-white shadow-popover animate-slide-in-right sm:max-w-md"
          >
            <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3.5">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-600 text-white">
                  <Bot size={16} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink-900">Karmayogi AI Assistant</p>
                  <p className="text-[11px] text-ink-500">Grounded in your live competency data</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close assistant" className="text-ink-400 hover:text-ink-700">
                <X size={18} />
              </button>
            </div>

            <div className="scrollbar-thin min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
              {messages.map((m) => (
                <div key={m.id} className={`flex gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                      m.role === 'user' ? 'bg-ink-200 text-ink-700' : m.error ? 'bg-danger-50 text-danger-700' : 'bg-primary-50 text-primary-700'
                    }`}
                  >
                    {m.role === 'user' ? <User size={12} /> : m.error ? <AlertCircle size={12} /> : <Sparkles size={12} />}
                  </div>
                  <div className={`flex max-w-[85%] flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div
                      className={`whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm leading-relaxed ${
                        m.role === 'user'
                          ? 'bg-primary-600 text-white'
                          : m.error
                            ? 'bg-danger-50 text-danger-700'
                            : 'bg-surface-subtle text-ink-800'
                      }`}
                    >
                      {m.text}
                    </div>
                    {m.error && m.retryText && (
                      <button
                        onClick={() => ask(m.retryText, { retry: true })}
                        disabled={loading}
                        className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-primary-700 hover:underline disabled:opacity-50"
                      >
                        <RotateCw size={11} /> Retry
                      </button>
                    )}
                    <span className="mt-0.5 text-[10px] text-ink-400">
                      {timeLabel(m.time)}
                      {providerLabel(m) ? ` · ${providerLabel(m)}` : ''}
                    </span>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex items-center gap-2 text-xs text-ink-500" role="status">
                  <Loader2 size={13} className="animate-spin" /> Thinking...
                </div>
              )}
              <div ref={endRef} />
            </div>

            <div className="border-t border-ink-200 p-3">
              <div className="scrollbar-thin -mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
                {QUICK_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => ask(q)}
                    disabled={loading}
                    className="shrink-0 whitespace-nowrap rounded-full border border-ink-200 px-2.5 py-1 text-[11px] font-medium text-ink-600 transition-colors hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 disabled:opacity-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  ask(input);
                }}
                className="flex items-end gap-2 rounded-md border border-ink-300 bg-white px-2 py-1.5 focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-100"
              >
                <textarea
                  ref={textareaRef}
                  rows={2}
                  value={input}
                  onChange={handleInput}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask me anything about your learning, skills or competency gaps..."
                  aria-label="Message"
                  maxLength={MAX_LENGTH}
                  className="max-h-[104px] min-h-[52px] flex-1 resize-none overflow-y-hidden bg-transparent px-1 py-1.5 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!canSend}
                  aria-label="Send message"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-600 text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Send size={16} />
                </button>
              </form>
              <p className="mt-1.5 text-[10px] text-ink-400">Enter to send · Shift+Enter for a new line</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
