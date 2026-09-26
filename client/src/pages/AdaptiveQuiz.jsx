import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, XCircle, Timer, BrainCircuit, Zap, TrendingUp, TrendingDown } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Badge from '../components/Badge.jsx';
import ProgressBar from '../components/ProgressBar.jsx';
import { SkeletonCard } from '../components/Skeleton.jsx';
import { getQuiz, startQuiz, answerQuestion } from '../services/quizService';
import { getErrorMessage } from '../services/api';

function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

const DIFFICULTY_RANK = { EASY: 0, MEDIUM: 1, HARD: 2 };

export default function AdaptiveQuiz() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [stage, setStage] = useState('intro'); // intro | taking
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [quizMeta, setQuizMeta] = useState(null);
  const [starting, setStarting] = useState(false);

  const [attemptId, setAttemptId] = useState(null);
  const [question, setQuestion] = useState(null);
  const [progress, setProgress] = useState({ answered: 0, total: 0 });
  const [difficulty, setDifficulty] = useState('MEDIUM');
  const [adaptiveNote, setAdaptiveNote] = useState('');
  const [selected, setSelected] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const questionStart = useRef(Date.now());
  const quizStart = useRef(Date.now());
  const submitLock = useRef(false); // synchronous re-entrancy guard — `submitting` state isn't enough because React only disables the button after a re-render, so a fast double-click can fire handleNext twice before the first await resolves.

  const loadMeta = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getQuiz(id);
      setQuizMeta(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (stage !== 'taking') return undefined;
    const interval = setInterval(() => setElapsed(Date.now() - quizStart.current), 1000);
    return () => clearInterval(interval);
  }, [stage]);

  const handleBegin = async () => {
    setStarting(true);
    setError('');
    try {
      const data = await startQuiz(id);
      setAttemptId(data.attemptId);
      setQuestion(data.question);
      setProgress(data.progress);
      setDifficulty(data.currentDifficulty);
      quizStart.current = Date.now();
      questionStart.current = Date.now();
      setStage('taking');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setStarting(false);
    }
  };

  const handleSelect = (idx) => {
    if (feedback) return;
    setSelected(idx);
  };

  const handleNext = async () => {
    if (selected === null || feedback || submitLock.current) return;
    submitLock.current = true;
    setSubmitting(true);
    setError('');
    try {
      const responseTimeMs = Date.now() - questionStart.current;
      const data = await answerQuestion(id, {
        attemptId,
        questionId: question.id,
        selectedAnswer: selected,
        responseTimeMs,
      });
      setFeedback(data.feedback);
      setProgress(data.progress);

      const prevRank = DIFFICULTY_RANK[difficulty];
      const nextDiff = data.currentDifficulty || data.result?.difficultyBreakdown?.[0]?.difficulty;

      if (data.done) {
        setAdaptiveNote(
          data.feedback.isCorrect ? 'Correct — final question complete.' : "That's the final question — let's see your full results."
        );
        setTimeout(() => {
          navigate(`/quizzes/${id}/results`, { state: { result: data.result, elapsedMs: Date.now() - quizStart.current } });
        }, 1400);
      } else {
        const nextRank = DIFFICULTY_RANK[nextDiff];
        if (nextRank > prevRank) {
          setAdaptiveNote(`Strong performance detected. Difficulty adjusted upward to ${nextDiff}.`);
        } else if (nextRank < prevRank) {
          setAdaptiveNote(`Concept reinforcement recommended. Difficulty adjusted to ${nextDiff}.`);
        } else {
          setAdaptiveNote(`Staying at ${nextDiff} difficulty for this competency.`);
        }
        setDifficulty(nextDiff);
        setTimeout(() => {
          setQuestion(data.question);
          setSelected(null);
          setFeedback(null);
          setAdaptiveNote('');
          questionStart.current = Date.now();
        }, 1800);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
      submitLock.current = false;
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl">
        <SkeletonCard lines={5} />
      </div>
    );
  }
  if (error && !quizMeta) return <ErrorState message={error} onRetry={loadMeta} />;

  if (stage === 'intro') {
    const competencies = [...new Set(quizMeta.questions.map((q) => q.competency).filter(Boolean))];
    return (
      <div className="max-w-2xl">
        <PageHeader eyebrow="AI Generated Assessment" title={quizMeta.quiz.title} description="Adaptive difficulty — every answer adjusts the next question in real time." />
        <div className="card">
          <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-[11px] text-ink-500">Source</p>
              <p className="text-sm font-medium text-ink-900">Uploaded material</p>
            </div>
            <div>
              <p className="text-[11px] text-ink-500">Questions</p>
              <p className="text-sm font-medium text-ink-900">{quizMeta.quiz.questionCount}</p>
            </div>
            <div>
              <p className="text-[11px] text-ink-500">Difficulty</p>
              <p className="text-sm font-medium text-ink-900">Adaptive</p>
            </div>
          </div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">Competencies covered</p>
          <div className="mb-5 flex flex-wrap gap-1.5">
            {competencies.map((c) => (
              <Badge key={c} variant="STATISTICAL">{c}</Badge>
            ))}
          </div>
          {error && <p className="mb-3 text-sm text-danger-600">{error}</p>}
          <button onClick={handleBegin} disabled={starting} className="btn-primary w-full">
            <Zap size={16} /> {starting ? 'Starting...' : 'Begin Adaptive Assessment'}
          </button>
        </div>
      </div>
    );
  }

  if (!question) return null;

  return (
    <div className="max-w-2xl">
      <PageHeader
        eyebrow="AI Generated Assessment"
        title={`Question ${progress.answered + 1} of ${progress.total}`}
        action={
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs font-medium text-ink-500">
              <Timer size={13} /> {formatTime(elapsed)}
            </span>
            <Badge variant={difficulty}>{difficulty}</Badge>
          </div>
        }
      />

      <div className="mb-4">
        <ProgressBar value={progress.answered} max={progress.total} label="Assessment progress" />
        <p className="mt-1.5 text-xs text-ink-500">{progress.answered} of {progress.total} answered</p>
      </div>

      {error && <p role="alert" className="alert-error mb-3">{error}</p>}

      <div className="mb-3 flex items-center gap-1.5 text-xs font-medium text-primary-700">
        <BrainCircuit size={14} /> Evaluating: {question.competency || question.topic || 'General'}
      </div>

      <div className="card">
        <p className="mb-4 text-base font-medium leading-relaxed text-ink-900" id="question-text">{question.question}</p>
        <div className="space-y-2" role="radiogroup" aria-labelledby="question-text">
          {question.options.map((opt, i) => {
            const isSelected = selected === i;
            const isCorrectOpt = feedback && i === feedback.correctAnswer;
            const isWrongSelected = feedback && isSelected && !feedback.isCorrect;

            let classes = 'border-ink-200 hover:border-ink-300 hover:bg-surface-subtle';
            let marker = 'bg-ink-100 text-ink-600';
            if (isSelected && !feedback) { classes = 'border-primary-500 bg-primary-50'; marker = 'bg-primary-600 text-white'; }
            if (isCorrectOpt) { classes = 'border-success-500 bg-success-50'; marker = 'bg-success-600 text-white'; }
            if (isWrongSelected) { classes = 'border-danger-500 bg-danger-50'; marker = 'bg-danger-600 text-white'; }

            return (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={!!feedback}
                onClick={() => handleSelect(i)}
                className={`flex w-full items-center gap-3 rounded-md border px-3.5 py-3 text-left text-sm transition-colors ${classes}`}
              >
                <span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${marker}`}>{String.fromCharCode(65 + i)}</span>
                <span className="flex-1">{opt}</span>
                {isCorrectOpt && <CheckCircle2 size={16} className="text-success-600" />}
                {isWrongSelected && <XCircle size={16} className="text-danger-600" />}
              </button>
            );
          })}
        </div>

        {feedback && (
          <div role="status" aria-live="polite" className={`mt-4 animate-slide-up rounded-md border px-3.5 py-3 text-sm ${feedback.isCorrect ? 'border-success-200 bg-success-50 text-success-800' : 'border-danger-200 bg-danger-50 text-danger-800'}`}>
            <p className="flex items-center gap-1.5 font-medium">
              {feedback.isCorrect ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
              {feedback.isCorrect ? 'Correct!' : 'Not quite.'}
            </p>
            <p className="mt-1 text-xs opacity-90">{feedback.explanation}</p>
            {adaptiveNote && (
              <p className="mt-2 flex items-center gap-1.5 border-t border-current/10 pt-2 text-xs font-medium">
                {adaptiveNote.includes('upward') ? <TrendingUp size={13} /> : adaptiveNote.includes('reinforcement') ? <TrendingDown size={13} /> : null}
                {adaptiveNote}
              </p>
            )}
          </div>
        )}

        {!feedback && (
          <button onClick={handleNext} disabled={selected === null || submitting} className="btn-primary mt-5">
            {submitting ? 'Submitting...' : 'Submit answer'} <ArrowRight size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
