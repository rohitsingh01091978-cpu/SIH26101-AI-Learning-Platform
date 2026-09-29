import React, { useEffect, useState } from 'react';
import { CheckCircle2, PlayCircle, Circle, Clock, TrendingUp, Award, Percent } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ProgressBar from '../components/ProgressBar.jsx';
import KPICard from '../components/KPICard.jsx';
import { SkeletonKPIRow, SkeletonChart } from '../components/Skeleton.jsx';
import ScoreTrendChart from '../charts/ScoreTrendChart.jsx';
import BeforeAfterChart from '../charts/BeforeAfterChart.jsx';
import CompetencyProgressCard from '../components/CompetencyProgressCard.jsx';
import CompetencyCalcExplainer from '../components/CompetencyCalcExplainer.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { listProgress, updateProgress } from '../services/progressService';
import { getPerformance } from '../services/performanceService';
import { getSkillGaps } from '../services/skillGapService';
import { getErrorMessage } from '../services/api';

const STATUS_ICON = { NOT_STARTED: Circle, IN_PROGRESS: PlayCircle, COMPLETED: CheckCircle2 };
const STATUS_TONE = { NOT_STARTED: 'text-ink-400', IN_PROGRESS: 'text-primary-600', COMPLETED: 'text-success-600' };

export default function Progress() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  const [performance, setPerformance] = useState(null);
  const [skillGaps, setSkillGaps] = useState([]);
  const [updatingId, setUpdatingId] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [progress, perf, gaps] = await Promise.all([listProgress(), getPerformance(), getSkillGaps()]);
      setItems(progress);
      setPerformance(perf);
      setSkillGaps(gaps);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleAdvance = async (item) => {
    setUpdatingId(item.id);
    try {
      const nextPercent = Math.min(100, item.progressPercent + 25);
      const status = nextPercent >= 100 ? 'COMPLETED' : 'IN_PROGRESS';
      const updated = await updateProgress(item.id, { progressPercent: nextPercent, status });
      setItems((prev) => prev.map((p) => (p.id === item.id ? updated : p)));
      if (status === 'COMPLETED') toast.success(`"${item.course?.title}" marked complete.`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <SkeletonKPIRow />
        <SkeletonChart />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;

  const completed = items.filter((i) => i.status === 'COMPLETED').length;
  const learningHours = items.reduce((s, i) => s + ((i.course?.durationHrs || 0) * i.progressPercent) / 100, 0);

  const quizAttempts = [...performance.recentQuizAttempts].reverse();
  const scoreTrend = quizAttempts.map((a, idx) => ({ label: `Q${idx + 1}`, score: a.score }));

  const growthMap = new Map();
  for (const attempt of quizAttempts) {
    for (const c of attempt.performance?.competencyBreakdown || []) {
      const entry = growthMap.get(c.competency) || { competency: c.competency, before: c.before, after: c.after };
      entry.after = c.after;
      growthMap.set(c.competency, entry);
    }
  }
  const growthData = [...growthMap.values()].filter((g) => g.after !== g.before);

  const gapReduction = [...growthMap.values()].reduce((s, g) => s + Math.max(0, g.after - g.before), 0);

  // Earliest recorded "before" per competency, across both assessment attempts and quiz
  // attempts — this is the real Initial Competency baseline, not a fabricated number.
  const historyEvents = [
    ...performance.recentAssessmentAttempts
      .filter((a) => a.performance?.competencyBreakdown?.length)
      .map((a) => ({ completedAt: a.completedAt, breakdown: a.performance.competencyBreakdown })),
    ...performance.recentQuizAttempts
      .filter((q) => q.performance?.competencyBreakdown?.length)
      .map((q) => ({ completedAt: q.completedAt, breakdown: q.performance.competencyBreakdown })),
  ].sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt));

  const baselineByCompetency = new Map();
  for (const event of historyEvents) {
    for (const c of event.breakdown) {
      if (!baselineByCompetency.has(c.competency)) {
        baselineByCompetency.set(c.competency, c.before);
      }
    }
  }

  const competencyProgress = performance.competencies
    .map((c) => {
      const gapEntry = skillGaps.find((g) => g.competency.name === c.competency);
      const baseline = baselineByCompetency.has(c.competency) ? baselineByCompetency.get(c.competency) : null;
      return {
        competency: c.competency,
        category: c.category,
        baseline,
        current: c.currentLevel,
        required: c.requiredLevel,
        improvement: baseline != null ? c.currentLevel - baseline : null,
        remainingGap: gapEntry ? gapEntry.gap : Math.max(0, c.requiredLevel - c.currentLevel),
        status: gapEntry ? gapEntry.status : c.currentLevel >= c.requiredLevel ? 'STRONG' : 'NEEDS_IMPROVEMENT',
      };
    })
    .sort((a, b) => b.remainingGap - a.remainingGap);

  return (
    <div>
      <PageHeader eyebrow="Learning analytics" title="Learning Progress" description={`${completed} of ${items.length} courses completed`} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard icon={Clock} label="Learning hours" value={`${learningHours.toFixed(1)}h`} sub="Across started courses" tone="primary" />
        <KPICard icon={Award} label="Courses completed" value={completed} sub={`of ${items.length} started`} tone="success" />
        <KPICard icon={Percent} label="Avg. quiz accuracy" value={performance.avgQuizAccuracy != null ? `${performance.avgQuizAccuracy}%` : '—'} sub={`${performance.totalQuizzesTaken} quizzes taken`} tone="accent" />
        <KPICard icon={TrendingUp} label="Skill gap reduction" value={`+${gapReduction}`} sub="Points gained via quizzes" tone="warning" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <p className="section-eyebrow mb-1">Assessment performance</p>
          <h2 className="mb-2 font-display text-sm font-bold text-ink-900">Quiz score trend</h2>
          {scoreTrend.length ? <ScoreTrendChart data={scoreTrend} /> : <EmptyState title="No quiz attempts yet" description="Take an adaptive quiz to start tracking your trend." />}
        </div>
        <div className="card">
          <p className="section-eyebrow mb-1">Competency growth</p>
          <h2 className="mb-2 font-display text-sm font-bold text-ink-900">Before → after, across all quizzes</h2>
          {growthData.length ? <BeforeAfterChart data={growthData} /> : <EmptyState title="No growth data yet" />}
        </div>
      </div>

      <div className="card mt-6">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="section-eyebrow mb-1">Competency Improvement</p>
            <h2 className="font-display text-sm font-bold text-ink-900">Competency Progress</h2>
          </div>
        </div>
        <p className="mb-4 text-sm text-ink-500">
          Initial competency → gap identified → recommended learning → adaptive assessment → updated competency, tracked per
          competency from your real assessment and quiz history.
        </p>
        {competencyProgress.length ? (
          <div className="space-y-3">
            {competencyProgress.map((row) => (
              <CompetencyProgressCard key={row.competency} row={row} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No competency data yet"
            description="Complete the baseline competency assessment to establish your first scores."
          />
        )}
        <div className="mt-4">
          <CompetencyCalcExplainer />
        </div>
      </div>

      <div className="card mt-6">
        <p className="section-eyebrow mb-1">Courses</p>
        <h2 className="mb-4 font-display text-sm font-bold text-ink-900">Course completion</h2>
        {items.length === 0 ? (
          <EmptyState title="No courses started yet" description="Start a course from your learning path to track progress here." />
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const Icon = STATUS_ICON[item.status];
              return (
                <div key={item.id} className="rounded-md border border-ink-200 p-3.5">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon size={17} className={STATUS_TONE[item.status]} />
                      <p className="text-sm font-semibold text-ink-900">{item.course?.title || 'Untitled course'}</p>
                    </div>
                    <span className="text-xs text-ink-500">{item.progressPercent}%</span>
                  </div>
                  <ProgressBar value={item.progressPercent} tone={item.status === 'COMPLETED' ? 'success' : 'primary'} />
                  {item.status !== 'COMPLETED' && (
                    <button
                      onClick={() => handleAdvance(item)}
                      disabled={updatingId === item.id}
                      className="btn-secondary mt-3 text-xs"
                    >
                      {updatingId === item.id ? 'Updating...' : 'Mark 25% more progress'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
