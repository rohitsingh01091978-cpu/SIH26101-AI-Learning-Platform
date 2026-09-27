import React from 'react';
import { Outlet } from 'react-router-dom';
import { BrainCircuit, Sparkles, ClipboardCheck, Target, FileText, TrendingUp, BarChart3 } from 'lucide-react';

const CAPABILITIES = [
  { icon: Sparkles, title: 'AI Content Intelligence', desc: 'Upload material and get grounded summaries, topics, and MCQs.' },
  { icon: ClipboardCheck, title: 'Adaptive Assessment', desc: 'Question difficulty adjusts in real time to your responses.' },
  { icon: Target, title: 'Personalized Competency Development', desc: 'A learning path recomputed from your live skill gaps.' },
];

// Purely illustrative - labels the four-stage concept (content -> competency -> assessment -> a learning
// path), not a competency score. This is shown on the public, pre-login page, so every axis carries the
// SAME value: an even shape that cannot be read as anyone's result, ranking, or progress.
const RADAR_AXES = [
  { label: 'Content', value: 0.72 },
  { label: 'Competency', value: 0.72 },
  { label: 'Assessment', value: 0.72 },
  { label: 'Learning Path', value: 0.72 },
];

// Points for a 4-axis radar polygon, laid out in a 200x200 box centred at (100,100).
function radarPoints(values, radius = 78) {
  const cx = 100;
  const cy = 100;
  return values
    .map((v, i) => {
      const angle = (Math.PI / 2) * i - Math.PI / 2; // start at top, go clockwise
      const r = radius * v;
      return `${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`;
    })
    .join(' ');
}

// Purely decorative illustration of the platform's own pipeline (upload -> AI analysis -> adaptive quiz ->
// competency growth), built from inline SVG/CSS so it needs no image asset and no external dependency.
function CompetencyIllustration() {
  const ringLevels = [1, 0.7, 0.4];
  return (
    <div className="relative mx-auto flex h-52 w-52 items-center justify-center xl:h-60 xl:w-60">
      {/* soft glow */}
      <div className="absolute inset-0 rounded-full bg-accent-400/20 blur-3xl" aria-hidden="true" />

      <svg viewBox="0 0 200 200" className="relative h-full w-full" aria-hidden="true">
        {ringLevels.map((lvl) => (
          <polygon
            key={lvl}
            points={radarPoints([lvl, lvl, lvl, lvl])}
            fill="none"
            stroke="white"
            strokeOpacity={0.14}
            strokeWidth={1}
          />
        ))}
        {[0, 1, 2, 3].map((i) => {
          const angle = (Math.PI / 2) * i - Math.PI / 2;
          return (
            <line
              key={i}
              x1={100}
              y1={100}
              x2={100 + 78 * Math.cos(angle)}
              y2={100 + 78 * Math.sin(angle)}
              stroke="white"
              strokeOpacity={0.14}
              strokeWidth={1}
            />
          );
        })}
        <polygon
          points={radarPoints(RADAR_AXES.map((a) => a.value))}
          fill="url(#radarFill)"
          stroke="#5eead4"
          strokeWidth={1.5}
        />
        {RADAR_AXES.map((a, i) => {
          const angle = (Math.PI / 2) * i - Math.PI / 2;
          const r = 78 * a.value;
          return (
            <circle
              key={a.label}
              cx={100 + r * Math.cos(angle)}
              cy={100 + r * Math.sin(angle)}
              r={3}
              fill="#5eead4"
            />
          );
        })}
        <defs>
          <linearGradient id="radarFill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#5eead4" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#6366f1" stopOpacity={0.25} />
          </linearGradient>
        </defs>
      </svg>

      {/* axis labels */}
      {RADAR_AXES.map((a, i) => {
        const pos = ['left-1/2 top-0 -translate-x-1/2 -translate-y-1', 'left-full top-1/2 -translate-y-1/2 translate-x-1', 'left-1/2 top-full -translate-x-1/2 translate-y-1', 'right-full top-1/2 -translate-y-1/2 -translate-x-1'][i];
        return (
          <span key={a.label} className={`absolute ${pos} whitespace-nowrap text-[10px] font-medium text-primary-100`}>
            {a.label}
          </span>
        );
      })}

      {/* Capability chips floating around the radar - what the platform DOES, never a score, a percentage,
          or anything that could be mistaken for this (not-yet-signed-in) visitor's own data. */}
      <div className="absolute -left-4 top-4 flex items-center gap-1.5 rounded-full bg-white/10 py-1 pl-1.5 pr-3 shadow-popover backdrop-blur-md sm:-left-8">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-400/90 text-primary-900">
          <FileText size={13} />
        </span>
        <span className="text-[11px] font-semibold text-white">AI Content Intelligence</span>
      </div>
      <div className="absolute -right-2 top-1/3 flex items-center gap-1.5 rounded-full bg-white/10 py-1 pl-1.5 pr-3 shadow-popover backdrop-blur-md sm:-right-6">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-300/90 text-primary-900">
          <BarChart3 size={13} />
        </span>
        <span className="text-[11px] font-semibold text-white">Adaptive Assessment</span>
      </div>
      <div className="absolute -bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-white/10 py-1 pl-1.5 pr-3 shadow-popover backdrop-blur-md">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success-400/90 text-primary-900">
          <TrendingUp size={13} />
        </span>
        <span className="text-[11px] font-semibold text-white">Personalized Learning</span>
      </div>
    </div>
  );
}

function Wordmark({ compact }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className={`flex items-center justify-center rounded-lg bg-white/10 backdrop-blur ${compact ? 'h-9 w-9' : 'h-10 w-10'}`}>
        <BrainCircuit size={compact ? 18 : 20} />
      </div>
      <span className="font-display text-sm font-bold tracking-wide">AI LEARNING PLATFORM</span>
    </div>
  );
}

export default function AuthLayout() {
  return (
    <div className="min-h-screen bg-surface-subtle">
      <div className="grid min-h-screen lg:grid-cols-[1.15fr_1fr]">
        {/* Left: brand / capability visual panel (desktop and up only - see the compact banner below for
            everything narrower). Purely presentational; no interactive or auth-relevant content lives here. */}
        <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 p-8 text-white lg:flex xl:p-12">
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }}
            aria-hidden="true"
          />
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent-500/10 blur-3xl" aria-hidden="true" />

          <div className="relative">
            <Wordmark />
            <h1 className="mt-6 font-display text-2xl font-bold leading-tight xl:text-3xl">
              AI-Powered Learning &amp;<br /> Competency Intelligence Platform
            </h1>
            <p className="mt-2 max-w-md text-sm text-primary-100">
              Intelligent capacity building for India&apos;s Official Statistical System
            </p>
          </div>

          <div className="relative flex flex-1 items-center justify-center py-2">
            <CompetencyIllustration />
          </div>

          <div className="relative space-y-2">
            {CAPABILITIES.map((c) => (
              <div key={c.title} className="flex items-start gap-3 rounded-lg bg-white/5 p-2.5 backdrop-blur">
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

          <p className="relative mt-3 text-[11px] text-primary-300">SIH26101 · Smart Education</p>
        </div>

        {/* Right: form. On everything narrower than lg, a compact illustrated banner (not the full panel
            above) sits above the card, so the login controls stay primary and nothing important is hidden. */}
        <div className="flex flex-col items-center justify-center px-4 py-10 sm:py-12">
          <div className="mb-6 w-full max-w-sm overflow-hidden rounded-xl bg-gradient-to-br from-primary-800 to-primary-600 text-white lg:hidden">
            <div className="flex items-center justify-between px-4 pt-4">
              <Wordmark compact />
            </div>
            <p className="px-4 pt-3 text-sm font-semibold leading-snug">
              AI-Powered Learning &amp; Competency Intelligence Platform
            </p>
            <div className="mt-3 flex items-center gap-2 overflow-x-auto px-4 pb-4 scrollbar-thin">
              {CAPABILITIES.map((c) => (
                <span key={c.title} className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium whitespace-nowrap">
                  <c.icon size={12} className="text-accent-300" />
                  {c.title}
                </span>
              ))}
            </div>
          </div>

          <div className="w-full max-w-sm">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
