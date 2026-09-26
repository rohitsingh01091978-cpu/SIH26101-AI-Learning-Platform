import React, { useRef, useState } from 'react';
import { ClipboardCheck, ArrowRight, CheckCircle2 } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import ProgressBar from '../components/ProgressBar.jsx';
import BeforeAfterChart from '../charts/BeforeAfterChart.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { startAssessment, submitAssessment } from '../services/assessmentService';
import { getErrorMessage } from '../services/api';

export default function CompetencyAssessment() {
  const toast = useToast();
  const [stage, setStage] = useState('intro'); // intro | taking | result
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attemptId, setAttemptId] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [startedAt, setStartedAt] = useState(null);
  const [result, setResult] = useState(null);
  const submitLock = useRef(false); // synchronous guard against a fast double-click submitting the attempt twice

  const handleStart = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await startAssessment();
      setAttemptId(data.attemptId);
      setQuestions(data.questions);
      setAnswers({});
      setStartedAt(Date.now());
      setStage('taking');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
      submitLock.current = false;
    }
  };

  const handleSelect = (questionId, optionIndex) => {
    setAnswers((a) => ({ ...a, [questionId]: optionIndex }));
  };

  const handleSubmit = async () => {
    if (submitLock.current) return;
    submitLock.current = true;
    setLoading(true);
    setError('');
    try {
      const responseTimeMs = Date.now() - startedAt;
      const responses = questions.map((q) => ({
        questionId: q.id,
        selectedAnswer: answers[q.id] ?? -1,
        responseTimeMs: Math.round(responseTimeMs / questions.length),
      }));
      const data = await submitAssessment(attemptId, responses);
      setResult(data);
      setStage('result');
      toast.success(`Assessment complete — ${Math.round(data.score)}% score.`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const allAnswered = questions.length > 0 && questions.every((q) => answers[q.id] !== undefined);

  if (stage === 'intro') {
    return (
      <div className="max-w-2xl">
        <PageHeader eyebrow="Adaptive Assessment" title="Competency Assessment" description="A short baseline assessment across your core competencies." />
        <div className="card text-center">
          <ClipboardCheck size={32} className="mx-auto mb-3 text-primary-600" />
          <p className="text-sm text-ink-700">
            This assessment covers statistical, technical, and applied competencies relevant to your role. Your
            answers will update your competency scores and skill-gap analysis immediately.
          </p>
          {error && <p className="mt-3 text-sm text-danger-600">{error}</p>}
          <button onClick={handleStart} disabled={loading} className="btn-primary mt-5">
            {loading ? 'Starting...' : 'Start assessment'} <ArrowRight size={16} />
          </button>
        </div>
      </div>
    );
  }

  if (stage === 'taking') {
    return (
      <div className="max-w-2xl">
        <PageHeader eyebrow="Adaptive Assessment" title="Competency Assessment" description={`${Object.keys(answers).length} of ${questions.length} answered`} />
        <div className="mb-4"><ProgressBar value={Object.keys(answers).length} max={questions.length} /></div>
        <div className="space-y-4">
          {questions.map((q, idx) => (
            <div key={q.id} className="card">
              <p className="mb-3 text-sm font-medium text-ink-900">
                {idx + 1}. {q.question}
              </p>
              <div className="space-y-2">
                {q.options.map((opt, i) => (
                  <label
                    key={i}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors ${
                      answers[q.id] === i ? 'border-primary-500 bg-primary-50' : 'border-ink-300 hover:bg-surface-subtle'
                    }`}
                  >
                    <input
                      type="radio"
                      name={q.id}
                      className="accent-primary-600"
                      checked={answers[q.id] === i}
                      onChange={() => handleSelect(q.id, i)}
                    />
                    {opt}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        {error && <p className="mt-3 text-sm text-danger-600">{error}</p>}

        <button onClick={handleSubmit} disabled={!allAnswered || loading} className="btn-primary mt-4">
          {loading ? 'Submitting...' : 'Submit assessment'} <ArrowRight size={16} />
        </button>
      </div>
    );
  }

  const chartData = result.competencyBreakdown.map((c) => ({ competency: c.competency, before: c.before, after: c.after }));

  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="Performance Analysis" title="Assessment complete" description="Your competency scores have been updated." />

      <div className="card mb-6 text-center">
        <CheckCircle2 size={32} className="mx-auto mb-2 text-success-600" />
        <p className="text-3xl font-semibold text-ink-900">{result.score}%</p>
        <p className="text-sm text-ink-500">
          {result.correctCount} of {result.totalQuestions} correct
        </p>
      </div>

      <div className="card">
        <h2 className="mb-4 text-sm font-semibold text-ink-900">Competency score changes</h2>
        <BeforeAfterChart data={chartData} />
      </div>
    </div>
  );
}
