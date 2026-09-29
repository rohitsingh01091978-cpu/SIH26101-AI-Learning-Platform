import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, GraduationCap, ExternalLink, CheckCircle2, PlayCircle, Circle } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Badge from '../components/Badge.jsx';
import ProgressBar from '../components/ProgressBar.jsx';
import WhyEvidence from '../components/WhyEvidence.jsx';
import CatalogSourceNote from '../components/CatalogSourceNote.jsx';
import { SkeletonCard } from '../components/Skeleton.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { getCourseDetails } from '../services/igotService';
import { getLearningPath } from '../services/learningPathService';
import { listProgress, startProgress, updateProgress } from '../services/progressService';
import { getErrorMessage } from '../services/api';

const STATUS_LABEL = { NOT_STARTED: 'Not started', IN_PROGRESS: 'In progress', COMPLETED: 'Completed' };
const STATUS_ICON = { NOT_STARTED: Circle, IN_PROGRESS: PlayCircle, COMPLETED: CheckCircle2 };
const STATUS_TONE = { NOT_STARTED: 'text-ink-400', IN_PROGRESS: 'text-primary-600', COMPLETED: 'text-success-600' };

export default function CourseDetail() {
  const { id } = useParams();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [course, setCourse] = useState(null);
  const [source, setSource] = useState('');
  const [recommendation, setRecommendation] = useState(null);
  const [progressRecord, setProgressRecord] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [detail, path, progress] = await Promise.all([getCourseDetails(id), getLearningPath(), listProgress()]);
      setCourse(detail.course);
      setSource(detail.source);
      // Reused as-is from the Step 2 recommendation engine — never recomputed here.
      setRecommendation(path.find((r) => r.competencyId === detail.course.competencyId) || null);
      setProgressRecord(progress.find((p) => p.courseId === detail.course.id) || null);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleStart = async () => {
    setBusy(true);
    try {
      const progress = await startProgress({ courseId: course.id, competencyId: course.competencyId });
      setProgressRecord(progress);
      toast.success('Learning activity started — track it on the Progress page.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleAdvance = async () => {
    setBusy(true);
    try {
      const nextPercent = Math.min(100, (progressRecord.progressPercent || 0) + 25);
      const status = nextPercent >= 100 ? 'COMPLETED' : 'IN_PROGRESS';
      const updated = await updateProgress(progressRecord.id, { progressPercent: nextPercent, status });
      setProgressRecord(updated);
      if (status === 'COMPLETED') toast.success(`"${course.title}" marked complete.`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl">
        <SkeletonCard lines={5} />
      </div>
    );
  }
  if (error || !course) return <ErrorState message={error || 'Course not found.'} onRetry={load} />;

  const StatusIcon = STATUS_ICON[progressRecord?.status || 'NOT_STARTED'];

  return (
    <div className="max-w-3xl">
      <Link to="/igot-courses" className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-ink-800">
        <ArrowLeft size={13} /> All courses
      </Link>
      <PageHeader eyebrow="Course Details" title={course.title} action={<CatalogSourceNote source={source} />} />

      <div className="card mb-6">
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {course.competency && <Badge variant={course.competency.category}>{course.competency.name}</Badge>}
          <Badge variant={course.level}>{course.level}</Badge>
        </div>
        <p className="text-sm leading-relaxed text-ink-700">{course.description}</p>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs">
          <div>
            <p className="text-ink-400">Duration</p>
            <p className="flex items-center gap-1 font-semibold text-ink-800"><Clock size={12} /> {course.durationHrs}h</p>
          </div>
          <div>
            <p className="text-ink-400">Competency addressed</p>
            <p className="font-semibold text-ink-800">{course.competency?.name || 'Not mapped'}</p>
          </div>
          {course.url && (
            <div>
              <p className="text-ink-400">External link</p>
              <a href={course.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-semibold text-primary-700 hover:underline">
                Open <ExternalLink size={12} />
              </a>
            </div>
          )}
        </div>
      </div>

      {recommendation ? (
        <div className="card mb-6">
          <p className="section-eyebrow mb-1">Why this course</p>
          <h2 className="mb-1 font-display text-sm font-bold text-ink-900">Recommended for your competency gap</h2>
          <p className="text-sm text-ink-700">{recommendation.reason}</p>
          <WhyEvidence competency={course.competency?.name || 'this competency'} evidence={recommendation.whyEvidence} defaultOpen />
        </div>
      ) : (
        <div className="card mb-6">
          <p className="text-sm text-ink-500">This course is not currently part of your personalized recommendations.</p>
        </div>
      )}

      <div className="card">
        <p className="section-eyebrow mb-1">Learning activity</p>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-sm font-bold text-ink-900">Your progress</h2>
          <span className={`flex items-center gap-1.5 text-xs font-semibold ${STATUS_TONE[progressRecord?.status || 'NOT_STARTED']}`}>
            <StatusIcon size={14} /> {STATUS_LABEL[progressRecord?.status || 'NOT_STARTED']}
          </span>
        </div>
        <ProgressBar value={progressRecord?.progressPercent || 0} tone={progressRecord?.status === 'COMPLETED' ? 'success' : 'primary'} />

        <div className="mt-4">
          {!progressRecord && (
            <button onClick={handleStart} disabled={busy} className="btn-primary w-full">
              <GraduationCap size={16} /> {busy ? 'Starting…' : 'Start Learning'}
            </button>
          )}
          {progressRecord && progressRecord.status !== 'COMPLETED' && (
            <button onClick={handleAdvance} disabled={busy} className="btn-secondary w-full">
              {busy ? 'Updating…' : 'Mark 25% more progress'}
            </button>
          )}
          {progressRecord?.status === 'COMPLETED' && (
            <p className="text-center text-xs text-success-700">Completed — this competency can now be reassessed.</p>
          )}
        </div>
      </div>
    </div>
  );
}
