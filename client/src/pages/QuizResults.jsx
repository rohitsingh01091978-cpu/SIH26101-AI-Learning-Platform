import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Trophy, ArrowRight, Timer, TrendingUp, TrendingDown, Target } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Badge from '../components/Badge.jsx';
import ProgressBar from '../components/ProgressBar.jsx';
import GapBar from '../components/GapBar.jsx';
import { SkeletonCard } from '../components/Skeleton.jsx';
import BeforeAfterChart from '../charts/BeforeAfterChart.jsx';
import { getPerformance } from '../services/performanceService';
import { getErrorMessage } from '../services/api';

function formatTime(ms) {
  if (!ms) return '—';
  const totalSec = Math.floor(ms / 1000);
  const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

export default function QuizResults() {
  const location = useLocation();
  const [result, setResult] = useState(location.state?.result || null);
  const elapsedMs = location.state?.elapsedMs;
  const [loading, setLoading] = useState(!location.state?.result);
  const [error, setError] = useState('');

  useEffect(() => {
    if (result) return;
    (async () => {
      try {
        const perf = await getPerformance();
        const latest = perf.recentQuizAttempts?.[0]?.performance;
        if (latest) setResult(latest);
        else setError('No recent quiz result found.');
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [result]);

  if (loading) {
    return (
      <div className="max-w-3xl">
        <SkeletonCard lines={4} />
      </div>
    );
  }
  if (error || !result) return <ErrorState message={error || 'No result available.'} />;

  const chartData = result.competencyBreakdown.map((c) => ({ competency: c.competency, before: c.before, after: c.after }));
  const strengths = result.competencyBreakdown.filter((c) => c.accuracy >= 70);
  const toImprove = result.competencyBreakdown.filter((c) => c.accuracy < 70);

  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="Performance Analysis" title="Assessment Results" description="Your competency scores below are computed directly from this attempt, not animated." />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card text-center">
          <Trophy size={22} className="mx-auto mb-2 text-warning-500" />
          <p className="font-display text-3xl font-bold text-ink-900">{result.score}%</p>
          <p className="text-xs text-ink-500">Assessment Score</p>
        </div>
        <div className="card text-center">
          <Target size={22} className="mx-auto mb-2 text-primary-600" />
          <p className="font-display text-3xl font-bold text-ink-900">{result.correctCount}/{result.totalQuestions}</p>
          <p className="text-xs text-ink-500">Accuracy ({result.accuracy}%)</p>
        </div>
        <div className="card text-center">
          <Timer size={22} className="mx-auto mb-2 text-accent-600" />
          <p className="font-display text-3xl font-bold text-ink-900">{formatTime(elapsedMs)}</p>
          <p className="text-xs text-ink-500">Time taken</p>
        </div>
      </div>

      <div className="card mb-6">
        <p className="section-eyebrow mb-1">By competency</p>
        <h2 className="mb-4 font-display text-sm font-bold text-ink-900">Competency Performance</h2>
        <div className="space-y-3">
          {result.competencyBreakdown.map((c) => (
            <div key={c.competency} className="flex items-center gap-3">
              <span className="w-32 shrink-0 truncate text-sm text-ink-700">{c.competency}</span>
              <div className="flex-1"><ProgressBar value={c.accuracy} tone={c.accuracy >= 70 ? 'success' : c.accuracy >= 40 ? 'warning' : 'danger'} /></div>
              <span className="w-10 shrink-0 text-right text-sm font-semibold text-ink-900">{c.accuracy}%</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-3 flex items-center gap-1.5 font-display text-sm font-bold text-ink-900">
            <TrendingUp size={15} className="text-success-600" /> Strengths
          </h2>
          {strengths.length ? (
            <ul className="space-y-1.5">
              {strengths.map((c) => (
                <li key={c.competency} className="flex items-center justify-between text-sm">
                  <span className="text-ink-700">{c.competency}</span>
                  <Badge variant="STRONG">{c.accuracy}%</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-500">No standout strengths in this attempt.</p>
          )}
        </div>
        <div className="card">
          <h2 className="mb-3 flex items-center gap-1.5 font-display text-sm font-bold text-ink-900">
            <TrendingDown size={15} className="text-danger-600" /> Areas to improve
          </h2>
          {toImprove.length ? (
            <ul className="space-y-3">
              {toImprove.map((c) => (
                <li key={c.competency}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-ink-700">{c.competency}</span>
                    <Badge variant="NEEDS_IMPROVEMENT">{c.accuracy}%</Badge>
                  </div>
                  <GapBar current={c.after} required={Math.max(c.after, c.before, 70)} tone="danger" />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-500">No weak areas detected in this quiz.</p>
          )}
        </div>
      </div>

      {result.improvementAreas?.length > 0 && (
        <div className="card mb-6 flex items-start gap-3 border-l-4 !border-l-primary-500">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary-700">
            <Target size={17} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">Recommended focus</p>
            <p className="mt-1 text-sm text-ink-700">
              Prioritize {result.improvementAreas.join(', ')} in your next learning session — see your personalized path below.
            </p>
          </div>
        </div>
      )}

      <div className="card mb-6">
        <p className="section-eyebrow mb-1">Before → After</p>
        <h2 className="mb-4 font-display text-sm font-bold text-ink-900">Competency score changes</h2>
        <BeforeAfterChart data={chartData} />
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {result.competencyBreakdown.map((c) => (
            <div key={c.competency} className="flex items-center justify-between rounded-md bg-surface-subtle px-3.5 py-2.5">
              <span className="text-sm font-medium text-ink-900">{c.competency}</span>
              <span className="flex items-center gap-1.5 text-sm">
                <span className="text-ink-500">{c.before}</span>
                <span className="text-ink-300">→</span>
                <span className="font-semibold text-ink-900">{c.after}</span>
                <span className={`text-xs font-bold ${c.change >= 0 ? 'text-success-600' : 'text-danger-600'}`}>
                  ({c.change >= 0 ? '+' : ''}{c.change})
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-center">
        <Link to="/learning-path" className="btn-primary">
          View updated learning path <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  );
}
