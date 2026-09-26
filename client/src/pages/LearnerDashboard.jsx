import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Target, TrendingUp, AlertTriangle, ClipboardCheck, ArrowRight, RefreshCcw, Building2, BadgeCheck, Flame } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import KPICard from '../components/KPICard.jsx';
import ErrorState from '../components/ErrorState.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Badge from '../components/Badge.jsx';
import JourneyStrip from '../components/JourneyStrip.jsx';
import WhyEvidence from '../components/WhyEvidence.jsx';
import { SkeletonKPIRow, SkeletonChart, SkeletonList } from '../components/Skeleton.jsx';
import CompetencyRadarChart from '../charts/CompetencyRadarChart.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getPerformance } from '../services/performanceService';
import { getSkillGaps } from '../services/skillGapService';
import { getLearningPath } from '../services/learningPathService';
import { getProfile } from '../services/profileService';
import { listMaterials } from '../services/materialService';
import { listProgress } from '../services/progressService';
import { getErrorMessage } from '../services/api';

const JOURNEY_LABELS = [
  'Profile', 'Competency Intel.', 'Identify Gap', 'Upload Material', 'AI Analysis',
  'Generate Quiz', 'Adaptive Quiz', 'Performance', 'Competency Update', 'Learning Path', 'iGOT Discovery', 'Re-assessment',
];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function LearnerDashboard() {
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true, error: '' });

  const load = async () => {
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const [performance, skillGaps, learningPath, profile, materials, progress] = await Promise.all([
        getPerformance(),
        getSkillGaps(),
        getLearningPath(),
        getProfile(),
        listMaterials(),
        listProgress(),
      ]);
      setState({ loading: false, error: '', performance, skillGaps, learningPath, profile, materials, progress });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: getErrorMessage(err) }));
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state.loading) {
    return (
      <div className="space-y-6">
        <SkeletonKPIRow />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3"><SkeletonChart height={300} /></div>
          <div className="lg:col-span-2"><SkeletonList rows={4} /></div>
        </div>
      </div>
    );
  }
  if (state.error) return <ErrorState message={state.error} onRetry={load} />;

  const { performance, skillGaps, learningPath, profile, materials, progress } = state;
  const openGaps = skillGaps.filter((g) => g.status !== 'STRONG');
  const topGaps = openGaps.slice(0, 5);
  const highGaps = openGaps.filter((g) => g.priority === 'HIGH').length;
  const strengths = [...performance.competencies].slice(0, 5);
  const radarData = performance.competencies.slice(0, 8).map((c) => ({
    competency: c.competency,
    currentLevel: c.currentLevel,
    requiredLevel: c.requiredLevel,
  }));

  const latestQuiz = performance.recentQuizAttempts?.[0];
  const competencyTrend = latestQuiz?.performance?.competencyBreakdown?.length
    ? Math.round(
        latestQuiz.performance.competencyBreakdown.reduce((s, c) => s + (c.change || 0), 0) /
          latestQuiz.performance.competencyBreakdown.length
      )
    : null;

  const completedActivities = progress.filter((p) => p.status === 'COMPLETED').length;
  const learningProgressPct = progress.length
    ? Math.round(progress.reduce((s, p) => s + p.progressPercent, 0) / progress.length)
    : 0;

  const latestAssessment = performance.recentAssessmentAttempts?.[0];

  const journeyStages = JOURNEY_LABELS.map((label, idx) => {
    const flags = [
      true, // profile always exists
      performance.competencies.length > 0,
      skillGaps.length > 0,
      materials.length > 0,
      materials.some((m) => m.analysis || m.status === 'COMPLETED'),
      materials.some((m) => (m.quizzes || []).length > 0),
      performance.totalQuizzesTaken > 0,
      performance.totalQuizzesTaken > 0,
      performance.totalQuizzesTaken > 0,
      learningPath.length > 0,
      progress.length > 0,
      performance.totalAssessmentsTaken > 1,
    ];
    return { label, done: flags[idx] };
  });
  const firstNotDone = journeyStages.findIndex((s) => !s.done);
  journeyStages.forEach((s, i) => { s.current = i === firstNotDone; });

  return (
    <div>
      <PageHeader
        eyebrow={`${greeting()}`}
        title={user?.name || 'Learner'}
        description={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {profile?.currentRole && (
              <span className="flex items-center gap-1.5"><BadgeCheck size={14} className="text-primary-600" /> {profile.currentRole}</span>
            )}
            {profile?.department && (
              <span className="flex items-center gap-1.5"><Building2 size={14} className="text-primary-600" /> {profile.department}</span>
            )}
          </span>
        }
        action={
          <button onClick={load} className="btn-secondary">
            <RefreshCcw size={14} /> Refresh
          </button>
        }
      />

      <div className="card mb-6">
        <p className="section-eyebrow mb-3">Your journey through the platform</p>
        <JourneyStrip stages={journeyStages} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          icon={Target}
          label="Overall Competency"
          value={`${performance.overallScore}/100`}
          trend={competencyTrend}
          sub={competencyTrend != null ? 'pts from last quiz' : 'No quizzes yet'}
          tone="primary"
        />
        <KPICard
          icon={TrendingUp}
          label="Learning Progress"
          value={`${learningProgressPct}%`}
          sub={progress.length ? `${completedActivities} of ${progress.length} activities` : 'No courses started'}
          tone="accent"
        />
        <KPICard
          icon={AlertTriangle}
          label="Skill Gaps"
          value={openGaps.length}
          sub={highGaps > 0 ? `${highGaps} high priority` : 'None high priority'}
          tone="warning"
        />
        <KPICard
          icon={ClipboardCheck}
          label="Assessment"
          value={latestAssessment ? `${Math.round(latestAssessment.score)}%` : latestQuiz ? `${latestQuiz.score}%` : '—'}
          sub={latestAssessment ? 'Latest assessment score' : latestQuiz ? 'Latest quiz score' : 'Not yet taken'}
          tone="success"
        />
      </div>

      {learningPath[0] && (
        <div className="card mt-6 border-l-4 !border-l-danger-500">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-danger-50 text-danger-600">
                <Flame size={20} />
              </div>
              <div>
                <p className="section-eyebrow">Your biggest opportunity</p>
                <h2 className="font-display text-lg font-bold text-ink-900">{learningPath[0].competency}</h2>
                <p className="mt-1 text-sm text-ink-600">
                  Current <strong className="text-ink-900">{learningPath[0].currentLevel}</strong> · Required{' '}
                  <strong className="text-ink-900">{learningPath[0].requiredLevel}</strong> · Gap{' '}
                  <strong className="text-danger-700">{learningPath[0].requiredLevel - learningPath[0].currentLevel}</strong>
                </p>
                {learningPath[0].course && (
                  <p className="mt-1 text-xs text-ink-500">Recommended: {learningPath[0].course.title}</p>
                )}
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Link to="/skill-gaps" className="btn-secondary text-xs">View Gap</Link>
              <Link to="/learning-path" className="btn-primary text-xs">Start Learning</Link>
            </div>
          </div>
          <WhyEvidence competency={learningPath[0].competency} evidence={learningPath[0].whyEvidence} />
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="card lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="section-eyebrow">Competency Intelligence</p>
              <h2 className="font-display text-sm font-bold text-ink-900">Current vs. required proficiency</h2>
            </div>
            <Link to="/competency-intelligence" className="text-xs font-semibold text-primary-600 hover:underline">Deep dive</Link>
          </div>
          {radarData.length ? (
            <CompetencyRadarChart data={radarData} />
          ) : (
            <EmptyState title="No competency data yet" description="Take the baseline assessment to generate your competency profile." />
          )}
        </div>

        <div className="card lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="section-eyebrow">Priority</p>
              <h2 className="font-display text-sm font-bold text-ink-900">Priority skill gaps</h2>
            </div>
            <Link to="/skill-gaps" className="text-xs font-semibold text-primary-600 hover:underline">View all</Link>
          </div>
          {topGaps.length ? (
            <ul className="space-y-3">
              {topGaps.map((g) => (
                <li key={g.id} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium text-ink-900">{g.competency.name}</p>
                    <p className="text-xs text-ink-500">{g.currentLevel} → {g.requiredLevel} required</p>
                  </div>
                  <Badge variant={g.priority}>{g.priority}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No significant gaps" description="Your competencies meet your target role requirements." />
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <p className="section-eyebrow mb-1">Recognized</p>
          <h2 className="mb-4 font-display text-sm font-bold text-ink-900">Top strengths</h2>
          {strengths.length ? (
            <ul className="space-y-3">
              {strengths.map((c) => (
                <li key={c.competency} className="flex items-center justify-between text-sm">
                  <span className="text-ink-700">{c.competency}</span>
                  <span className="font-display font-bold text-ink-900">{c.currentLevel}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No data yet" />
          )}
        </div>

        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="section-eyebrow">Next steps</p>
              <h2 className="font-display text-sm font-bold text-ink-900">Recommended for you</h2>
            </div>
            <Link to="/learning-path" className="flex items-center gap-1 text-xs font-semibold text-primary-600 hover:underline">
              Full path <ArrowRight size={12} />
            </Link>
          </div>
          {learningPath.length ? (
            <ul className="space-y-3">
              {learningPath.slice(0, 4).map((r) => (
                <li key={r.priority} className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-50 text-[10px] font-bold text-primary-700">{r.priority}</span>
                  <div>
                    <p className="font-medium text-ink-900">{r.competency}</p>
                    <p className="text-xs text-ink-500">{r.course ? r.course.title : 'No course mapped yet'}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No recommendations yet" description="Complete an assessment or quiz to generate a personalized path." />
          )}
        </div>
      </div>
    </div>
  );
}
