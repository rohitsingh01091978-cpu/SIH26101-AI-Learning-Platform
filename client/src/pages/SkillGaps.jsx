import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCcw, ArrowRight, ShieldCheck } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Badge from '../components/Badge.jsx';
import GapBar from '../components/GapBar.jsx';
import { SkeletonList } from '../components/Skeleton.jsx';
import { getSkillGaps } from '../services/skillGapService';
import { getLearningPath } from '../services/learningPathService';
import { getErrorMessage } from '../services/api';

const GROUPS = [
  { key: 'HIGH', label: 'High Priority', tone: 'danger' },
  { key: 'MEDIUM', label: 'Medium Priority', tone: 'warning' },
  { key: 'STRONG', label: 'Strong Areas', tone: 'success' },
];

export default function SkillGaps() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [gaps, setGaps] = useState([]);
  const [learningPath, setLearningPath] = useState([]);
  const [tab, setTab] = useState('HIGH');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [g, lp] = await Promise.all([getSkillGaps(), getLearningPath()]);
      setGaps(g);
      setLearningPath(lp);
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
      <div>
        <PageHeader title="Skill Gap Analysis" description="Calculating your live gap analysis..." />
        <SkeletonList rows={5} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;

  const strong = gaps.filter((g) => g.status === 'STRONG');
  const grouped = {
    HIGH: gaps.filter((g) => g.priority === 'HIGH' && g.status !== 'STRONG'),
    MEDIUM: gaps.filter((g) => g.priority === 'MEDIUM' && g.status !== 'STRONG'),
    STRONG: strong,
  };
  const active = [...grouped[tab]].sort((a, b) => b.gap - a.gap);

  return (
    <div>
      <PageHeader
        eyebrow="Live calculation"
        title="Skill Gap Analysis"
        description="Gap = required competency level − current level, recalculated from your live scores."
        action={
          <button onClick={load} className="btn-secondary">
            <RefreshCcw size={14} /> Recalculate
          </button>
        }
      />

      <div className="mb-6 grid grid-cols-3 gap-3">
        {GROUPS.map((g) => (
          <button
            key={g.key}
            onClick={() => setTab(g.key)}
            className={`card-interactive text-left ${tab === g.key ? 'ring-2 ring-primary-500 ring-offset-1' : ''}`}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{g.label}</p>
            <p className={`mt-1 font-display text-2xl font-bold ${g.tone === 'danger' ? 'text-danger-600' : g.tone === 'warning' ? 'text-warning-600' : 'text-success-600'}`}>
              {grouped[g.key].length}
            </p>
          </button>
        ))}
      </div>

      {active.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title={tab === 'STRONG' ? 'No strong areas yet' : `No ${GROUPS.find((g) => g.key === tab).label.toLowerCase()} gaps`}
          description={gaps.length === 0 ? 'Take the competency assessment to generate your skill-gap analysis.' : 'Nothing in this category right now.'}
        />
      ) : (
        <div className="space-y-4">
          {active.map((g) => {
            const rec = learningPath.find((r) => r.competency === g.competency.name);
            return (
              <div key={g.id} className="card">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-ink-900">{g.competency.name}</p>
                    <p className="text-xs text-ink-500">{g.competency.category.replace(/_/g, ' ')}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant={g.priority}>{g.priority} priority</Badge>
                    <Badge variant={g.status}>{g.status.replace(/_/g, ' ')}</Badge>
                  </div>
                </div>

                <GapBar current={g.currentLevel} required={g.requiredLevel} tone={g.status === 'STRONG' ? 'success' : g.priority === 'HIGH' ? 'danger' : 'warning'} />

                {g.gap > 0 && (
                  <p className="mt-3 text-xs text-ink-500">
                    Gap of <strong className="text-ink-700">{g.gap} points</strong>
                    {rec ? <> — matched to <strong className="text-ink-700">{rec.course ? rec.course.title : rec.competency}</strong></> : null}
                  </p>
                )}

                {rec && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-subtle px-3 py-2.5">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Recommended next step</p>
                      <p className="text-sm text-ink-800">{rec.reason}</p>
                    </div>
                    <Link to="/learning-path" className="btn-secondary shrink-0 text-xs">
                      View path <ArrowRight size={12} />
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
