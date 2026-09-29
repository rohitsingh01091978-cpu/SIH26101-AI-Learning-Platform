import React, { useEffect, useState } from 'react';
import { Clock, GraduationCap, RefreshCcw, Repeat, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Badge from '../components/Badge.jsx';
import Stepper from '../components/Stepper.jsx';
import WhyEvidence from '../components/WhyEvidence.jsx';
import CatalogSourceNote from '../components/CatalogSourceNote.jsx';
import { SkeletonCard } from '../components/Skeleton.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { getLearningPath } from '../services/learningPathService';
import { startProgress } from '../services/progressService';
import { getErrorMessage } from '../services/api';

// Course level is not a warning, so it is shown in neutral/brand tones (not amber/red).
const DIFFICULTY_BADGE = { ADVANCED: 'ADVANCED', INTERMEDIATE: 'INTERMEDIATE', BEGINNER: 'BEGINNER' };

export default function LearningPath() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [path, setPath] = useState([]);
  const [startingId, setStartingId] = useState(null);
  const [startedIds, setStartedIds] = useState(new Set());

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setPath(await getLearningPath());
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleStart = async (item) => {
    if (!item.course) return;
    setStartingId(item.course.id);
    try {
      await startProgress({ courseId: item.course.id, competencyId: item.competencyId });
      setStartedIds((s) => new Set(s).add(item.course.id));
      toast.success(`Started "${item.course.title}" — track it on the Progress page.`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setStartingId(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl space-y-4 lg:max-w-4xl">
        <SkeletonCard lines={3} />
        <SkeletonCard lines={3} />
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;

  const steps = path.map((item) => ({
    number: item.priority,
    title: item.competency,
    meta: (
      <Badge variant={DIFFICULTY_BADGE[item.difficulty] || 'MEDIUM'}>{item.difficulty}</Badge>
    ),
    children: (
      <>
        <p className="mt-1.5 text-sm text-ink-700">{item.reason}</p>
        {item.course && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md bg-surface-subtle px-3 py-2.5">
            <div className="flex min-w-0 flex-col gap-1">
              <Link to={`/igot-courses/${item.course.id}`} className="flex items-center gap-2 text-sm text-ink-700 hover:text-primary-700">
                <GraduationCap size={16} className="shrink-0 text-primary-600" />
                <span className="truncate font-medium">{item.course.title}</span>
              </Link>
              <CatalogSourceNote source={item.course.source} className="ml-6" />
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-xs text-ink-500">
                <Clock size={12} /> {item.estimatedDurationHrs}h
              </span>
              <Link to={`/igot-courses/${item.course.id}`} className="btn-secondary text-xs">
                Course details
              </Link>
              <button
                onClick={() => handleStart(item)}
                disabled={startingId === item.course.id || startedIds.has(item.course.id)}
                className="btn-primary text-xs"
              >
                {startedIds.has(item.course.id) ? 'Started' : startingId === item.course.id ? 'Starting...' : 'Start Learning'}
              </button>
            </div>
          </div>
        )}
        <p className="mt-3 text-xs text-ink-500">
          Current <strong className="text-ink-700">{item.currentLevel}</strong> → target <strong className="text-ink-700">{item.requiredLevel}</strong> · expected improvement +{item.expectedImprovement} pts
        </p>
        <WhyEvidence competency={item.competency} evidence={item.whyEvidence} />
      </>
    ),
  }));

  return (
    <div className="max-w-3xl lg:max-w-4xl">
      <PageHeader
        eyebrow="Generated for you"
        title="Your Personalized Learning Path"
        description="Generated from your role, competency gaps, assessment performance, and learning history."
        action={
          <button onClick={load} className="btn-secondary">
            <RefreshCcw size={14} /> Regenerate
          </button>
        }
      />

      {path.length === 0 ? (
        <EmptyState title="No recommendations yet" description="Complete the competency assessment or a quiz to generate your path." />
      ) : (
        <>
          <Stepper steps={steps} />

          <div className="card mt-2 flex items-center justify-between gap-3 border-l-4 !border-l-accent-500">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-50 text-accent-700">
                <Repeat size={17} />
              </div>
              <div>
                <p className="text-sm font-semibold text-ink-900">Re-assessment</p>
                <p className="text-xs text-ink-500">Retake the competency assessment any time to refresh this path.</p>
              </div>
            </div>
            <Link to="/assessment" className="btn-secondary shrink-0 text-xs">
              Retake <ArrowRight size={12} />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
