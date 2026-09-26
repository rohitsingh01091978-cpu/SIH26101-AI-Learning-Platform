import React, { useEffect, useState } from 'react';
import { RefreshCcw, BrainCircuit, Lightbulb } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Badge from '../components/Badge.jsx';
import GapBar from '../components/GapBar.jsx';
import { SkeletonChart, SkeletonKPIRow } from '../components/Skeleton.jsx';
import CompetencyRadarChart from '../charts/CompetencyRadarChart.jsx';
import CompetencyBarChart from '../charts/CompetencyBarChart.jsx';
import { getPerformance } from '../services/performanceService';
import { getSkillGaps } from '../services/skillGapService';
import { getLearningPath } from '../services/learningPathService';
import { getProfile } from '../services/profileService';
import { getErrorMessage } from '../services/api';

const CATEGORY_LABEL = {
  STATISTICAL: 'Statistical',
  TECHNICAL: 'Technical',
  DIGITAL_GOVERNANCE: 'Digital Governance',
  BEHAVIOURAL_MANAGERIAL: 'Behavioural / Managerial',
};

const PRIORITY_TONE = { HIGH: 'danger', MEDIUM: 'warning', LOW: 'primary' };

export default function CompetencyIntelligence() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [performance, skillGaps, learningPath, profile] = await Promise.all([
        getPerformance(),
        getSkillGaps(),
        getLearningPath(),
        getProfile(),
      ]);
      setData({ performance, skillGaps, learningPath, profile });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <SkeletonKPIRow count={3} />
        <SkeletonChart height={320} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;

  const { performance, skillGaps, learningPath, profile } = data;

  const byCategory = {};
  for (const c of performance.competencies) {
    const entry = byCategory[c.category] || { name: CATEGORY_LABEL[c.category] || c.category, total: 0, count: 0 };
    entry.total += c.currentLevel;
    entry.count += 1;
    byCategory[c.category] = entry;
  }
  const categoryChart = Object.values(byCategory).map((e) => ({ name: e.name, currentLevel: Math.round(e.total / e.count) }));

  const radarData = performance.competencies.slice(0, 10).map((c) => ({
    competency: c.competency,
    currentLevel: c.currentLevel,
    requiredLevel: c.requiredLevel,
  }));

  const strengths = performance.competencies.filter((c) => c.currentLevel >= c.requiredLevel).slice(0, 6);
  const priorityGaps = [...skillGaps].filter((g) => g.gap > 0).sort((a, b) => b.gap - a.gap).slice(0, 6);
  const topGap = priorityGaps[0];
  const topGapReason = topGap && learningPath.find((r) => r.competency === topGap.competency.name)?.reason;

  return (
    <div>
      <PageHeader
        eyebrow="Deep analysis"
        title="Competency Intelligence"
        description={`Current vs. required proficiency across your competency framework, calculated for your target role${profile?.targetRole ? ` (${profile.targetRole})` : ''}.`}
        action={
          <button onClick={load} className="btn-secondary">
            <RefreshCcw size={14} /> Recalculate
          </button>
        }
      />

      {topGap && (
        <div className="card mb-6 flex items-start gap-3 border-l-4 !border-l-warning-500">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-warning-50 text-warning-600">
            <Lightbulb size={18} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-warning-700">Why this gap matters</p>
            <p className="mt-1 text-sm text-ink-700">
              {topGapReason || `${topGap.competency.name} is your largest gap at ${topGap.gap} points — closing it has the biggest effect on your readiness for your target role.`}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="card lg:col-span-3">
          <p className="section-eyebrow mb-1">Radar view</p>
          <h2 className="mb-4 font-display text-sm font-bold text-ink-900">Current vs. required competency</h2>
          {radarData.length ? <CompetencyRadarChart data={radarData} /> : <EmptyState title="No competency data yet" />}
        </div>
        <div className="card lg:col-span-2">
          <p className="section-eyebrow mb-1">By category</p>
          <h2 className="mb-4 font-display text-sm font-bold text-ink-900">Category distribution</h2>
          {categoryChart.length ? <CompetencyBarChart data={categoryChart} height={260} /> : <EmptyState title="No data yet" />}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <div className="mb-4 flex items-center gap-2">
            <BrainCircuit size={16} className="text-primary-600" />
            <h2 className="font-display text-sm font-bold text-ink-900">Priority gaps</h2>
          </div>
          {priorityGaps.length ? (
            <div className="space-y-5">
              {priorityGaps.map((g) => (
                <div key={g.id}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-sm font-semibold text-ink-900">{g.competency.name}</span>
                    <div className="flex items-center gap-1.5">
                      <Badge variant={g.priority}>{g.priority} PRIORITY</Badge>
                      <span className="text-xs font-medium text-ink-500">Gap {g.gap}</span>
                    </div>
                  </div>
                  <GapBar current={g.currentLevel} required={g.requiredLevel} tone={PRIORITY_TONE[g.priority]} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No priority gaps" description="Every competency meets or exceeds its required level." />
          )}
        </div>

        <div className="card">
          <p className="section-eyebrow mb-1">Recognized</p>
          <h2 className="mb-4 font-display text-sm font-bold text-ink-900">Top strengths</h2>
          {strengths.length ? (
            <ul className="space-y-4">
              {strengths.map((c) => (
                <li key={c.competency}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-ink-900">{c.competency}</span>
                    <Badge variant="STRONG">STRONG</Badge>
                  </div>
                  <GapBar current={c.currentLevel} required={c.requiredLevel} tone="success" />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No strengths identified yet" description="Take the assessment to establish your competency baseline." />
          )}
        </div>
      </div>
    </div>
  );
}
