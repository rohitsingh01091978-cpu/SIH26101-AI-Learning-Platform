import React from 'react';
import { Outlet } from 'react-router-dom';
import { BrainCircuit, Sparkles, ClipboardCheck, Target } from 'lucide-react';

const CAPABILITIES = [
  { icon: Sparkles, title: 'AI Content Intelligence', desc: 'Upload material and get grounded summaries, topics, and MCQs.' },
  { icon: ClipboardCheck, title: 'Adaptive Assessment', desc: 'Question difficulty adjusts in real time to your responses.' },
  { icon: Target, title: 'Personalized Competency Development', desc: 'A learning path recomputed from your live skill gaps.' },
];

export default function AuthLayout() {
  return (
    <div className="min-h-screen bg-surface-subtle">
      <div className="grid min-h-screen lg:grid-cols-2">
        {/* Left: brand / capability panel */}
        <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 p-10 text-white lg:flex">
          <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />

          <div className="relative">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 backdrop-blur">
                <BrainCircuit size={20} />
              </div>
              <span className="font-display text-sm font-bold tracking-wide">AI LEARNING PLATFORM</span>
            </div>

            <h1 className="mt-12 font-display text-3xl font-bold leading-tight">
              AI-Powered Learning &amp;<br /> Competency Intelligence Platform
            </h1>
            <p className="mt-3 max-w-md text-sm text-primary-100">
              Intelligent capacity building for India's Official Statistical System
            </p>
          </div>

          <div className="relative space-y-4">
            {CAPABILITIES.map((c) => (
              <div key={c.title} className="flex items-start gap-3 rounded-lg bg-white/5 p-3.5 backdrop-blur">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-500/20 text-accent-300">
                  <c.icon size={17} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{c.title}</p>
                  <p className="mt-0.5 text-xs text-primary-200">{c.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="relative text-[11px] text-primary-300">SIH26101 · Smart Education</p>
        </div>

        {/* Right: form */}
        <div className="flex flex-col items-center justify-center px-4 py-12">
          <div className="w-full max-w-sm">
            <div className="mb-8 flex flex-col items-center text-center lg:hidden">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary-600 text-white">
                <BrainCircuit size={22} />
              </div>
              <h1 className="font-display text-base font-bold text-ink-900">AI Learning &amp; Competency Intelligence Platform</h1>
            </div>
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
