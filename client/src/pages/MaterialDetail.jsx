import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  Sparkles,
  BrainCircuit,
  ArrowLeft,
  ListChecks,
  Quote,
  FileText,
  Lightbulb,
  Hash,
  BookOpen,
  Gauge,
  Target,
  CheckCircle2,
  Download,
  Trash2,
} from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Badge from '../components/Badge.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import ProcessingTimeline from '../components/ProcessingTimeline.jsx';
import CompetencyChainMap from '../components/CompetencyChainMap.jsx';
import { SkeletonCard } from '../components/Skeleton.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { getMaterial, analyzeMaterial, deleteMaterial, downloadMaterialFile } from '../services/materialService';
import { generateQuiz } from '../services/quizService';
import { getErrorMessage } from '../services/api';

const DIFFICULTY_COLOR = { EASY: 'bg-success-500', MEDIUM: 'bg-warning-500', HARD: 'bg-danger-500' };
const DIFFICULTY_ORDER = ['EASY', 'MEDIUM', 'HARD'];

const GENERATION_STEPS = [
  'Analyzing source material...',
  'Selecting relevant concepts...',
  'Mapping competencies...',
  'Creating questions...',
  'Validating questions...',
];

function formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.ceil(bytes / 1024)} KB`;
}

export default function MaterialDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [material, setMaterial] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [genCount, setGenCount] = useState(10);
  const [genDifficulty, setGenDifficulty] = useState('MIXED');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [lastQuiz, setLastQuiz] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const [genStepIndex, setGenStepIndex] = useState(0);
  const genTimer = useRef(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setMaterial(await getMaterial(id));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    return () => clearInterval(genTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setError('');
    try {
      await analyzeMaterial(id);
      const refreshed = await getMaterial(id);
      setMaterial(refreshed);
      toast.success('AI content analysis complete.');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setAnalyzing(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setGenError('');
    setGenStepIndex(0);
    genTimer.current = setInterval(() => {
      setGenStepIndex((i) => (i < GENERATION_STEPS.length - 1 ? i + 1 : i));
    }, 650);
    try {
      const data = await generateQuiz(id, genCount, genDifficulty);
      setLastQuiz(data);
      toast.success(`${data.questions.length} questions generated.`);
    } catch (err) {
      setGenError(getErrorMessage(err));
    } finally {
      clearInterval(genTimer.current);
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl space-y-6">
        <SkeletonCard lines={2} />
        <SkeletonCard lines={4} />
      </div>
    );
  }
  if (error && !material) return <ErrorState message={error} onRetry={load} />;

  const analysis = material.analysis;
  const hasQuiz = (material.quizzes || []).length > 0 || lastQuiz;

  const timelineSteps = [
    { label: 'Document uploaded', state: 'done' },
    { label: 'Text extracted', state: material.hasExtractedText ? 'done' : 'pending' },
    { label: 'Content analyzed', state: analysis ? 'done' : analyzing ? 'active' : 'pending' },
    { label: 'Topics identified', state: analysis ? 'done' : analyzing ? 'active' : 'pending' },
    { label: 'Competencies mapped', state: analysis ? 'done' : analyzing ? 'active' : 'pending' },
    { label: 'Learning objectives generated', state: analysis ? 'done' : analyzing ? 'active' : 'pending' },
    { label: 'Assessment prepared', state: hasQuiz ? 'done' : generating ? 'active' : 'pending' },
  ];

  const difficultyCounts = lastQuiz
    ? lastQuiz.questions.reduce((acc, q) => ({ ...acc, [q.difficulty]: (acc[q.difficulty] || 0) + 1 }), {})
    : null;
  const competencySet = lastQuiz ? [...new Set(lastQuiz.questions.map((q) => q.competency).filter(Boolean))] : [];

  const handleDownload = async () => {
    setFileBusy(true);
    try {
      const blob = await downloadMaterialFile(id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = material.originalName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setFileBusy(false);
    }
  };

  const handleDelete = async () => {
    setConfirmDelete(false);
    setFileBusy(true);
    try {
      await deleteMaterial(id);
      toast.success('Material deleted.');
      navigate('/materials');
    } catch (err) {
      toast.error(getErrorMessage(err));
      setFileBusy(false);
    }
  };

  const chains = (analysis?.competencyEvidence?.length ? analysis.competencyEvidence : (analysis?.competencies || []).map((c) => ({ competency: c, category: null })))
    .slice(0, 4);

  const topRelevance = analysis?.competencyEvidence?.[0];
  const primaryTopic = analysis?.topics?.[0];
  const mostRelevantCompetency = topRelevance?.competency || analysis?.competencies?.[0];

  return (
    <div className="max-w-3xl">
      <Link to="/materials" className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-ink-800">
        <ArrowLeft size={13} /> All materials
      </Link>
      <PageHeader
        eyebrow="AI Content Intelligence"
        title={material.originalName}
        action={
          <>
            {material.hasStoredFile && (
              <button onClick={handleDownload} disabled={fileBusy} className="btn-secondary">
                <Download size={14} /> Download
              </button>
            )}
            <button onClick={() => setConfirmDelete(true)} disabled={fileBusy} className="btn-secondary text-danger-600">
              <Trash2 size={14} /> Delete
            </button>
          </>
        }
      />
      <ConfirmDialog
        open={confirmDelete}
        tone="danger"
        title="Delete this material?"
        description="The stored file, its extracted text and its AI analysis will be permanently removed. Quizzes you already generated and your results are kept."
        confirmLabel="Delete"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
      />

      {/* Document intelligence card */}
      <div className="card mb-6">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary-700">
              <FileText size={20} />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink-900">{material.originalName}</p>
              <p className="text-xs text-ink-500">Uploaded {new Date(material.uploadedAt).toLocaleString()}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
            <div>
              <p className="text-ink-400">File type</p>
              <p className="font-semibold text-ink-800">{material.fileType}</p>
            </div>
            <div>
              <p className="text-ink-400">Size</p>
              <p className="font-semibold text-ink-800">{formatSize(material.fileSize)}</p>
            </div>
            <div>
              <p className="text-ink-400">Upload status</p>
              <p className="font-semibold text-success-700">Uploaded</p>
            </div>
            <div>
              <p className="text-ink-400">Processing status</p>
              <Badge variant={material.status === 'COMPLETED' ? 'STRONG' : material.status === 'FAILED' ? 'NEEDS_IMPROVEMENT' : 'MEDIUM'}>
                {material.status}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      <div className="card mb-6">
        <p className="section-eyebrow mb-3">Processing pipeline</p>
        <ProcessingTimeline steps={timelineSteps} />
        {!analysis && (
          <button onClick={handleAnalyze} disabled={analyzing} className="btn-primary mt-5 w-full">
            <Sparkles size={16} /> {analyzing ? 'Analyzing...' : 'Analyze document'}
          </button>
        )}
      </div>

      {error && <p className="mb-4 text-sm text-danger-600">{error}</p>}

      {analysis && (
        <>
          {/* AI Analysis dashboard */}
          <div className="card mb-6">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BrainCircuit size={16} className="text-primary-600" />
                <h2 className="font-display text-sm font-bold text-ink-900">AI Content Analysis</h2>
              </div>
            </div>

            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">Content summary</p>
            <p className="text-sm leading-relaxed text-ink-700">{analysis.summary}</p>

            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">Key topics</p>
                {analysis.topics.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.topics.map((t) => (
                      <Badge key={t} variant="default">{t}</Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-ink-500">No key topics extracted.</p>
                )}
              </div>
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">Detected competencies</p>
                {analysis.competencies.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.competencies.map((c) => (
                      <Badge key={c} variant="STATISTICAL">{c}</Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-ink-500">No competencies confidently matched.</p>
                )}
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">Key concepts</p>
                {analysis.concepts?.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.concepts.map((c) => (
                      <Badge key={c} variant="TECHNICAL">{c}</Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-ink-500">No distinct concepts identified.</p>
                )}
              </div>
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">Difficulty</p>
                <div className="flex items-center gap-1.5">
                  {DIFFICULTY_ORDER.map((d) => (
                    <span
                      key={d}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-bold ${
                        d === analysis.difficulty ? `${DIFFICULTY_COLOR[d]} text-white` : 'bg-ink-100 text-ink-400'
                      }`}
                    >
                      {d}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
                <ListChecks size={13} /> Learning objectives
              </p>
              <ul className="space-y-1.5 text-sm text-ink-700">
                {analysis.learningObjectives.map((o, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary-500" />
                    {o}
                  </li>
                ))}
              </ul>
            </div>

            {analysis.relevantSections?.length > 0 && (
              <div className="mt-5">
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
                  <Quote size={13} /> Source references
                </p>
                <ul className="space-y-1.5">
                  {analysis.relevantSections.slice(0, 4).map((s, i) => (
                    <li key={i} className="rounded-md bg-surface-subtle px-3 py-2 text-xs italic text-ink-600">
                      &ldquo;{s}&rdquo;
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Knowledge -> Competency map */}
          {chains.length > 0 && (
            <div className="card mb-6">
              <p className="section-eyebrow mb-1">Knowledge → Competency Map</p>
              <h2 className="mb-4 font-display text-sm font-bold text-ink-900">How this document maps to your competency framework</h2>
              <CompetencyChainMap chains={chains} />
            </div>
          )}

          {/* Why these competencies */}
          <div className="card mb-6">
            <h2 className="mb-1 font-display text-sm font-bold text-ink-900">Why were these competencies identified?</h2>
            <p className="mb-4 text-xs text-ink-500">Every competency below is grounded in text lifted directly from your uploaded document — nothing is invented.</p>
            {analysis.competencyEvidence?.length > 0 ? (
              <div className="space-y-3">
                {analysis.competencyEvidence.map((e) => (
                  <div key={e.competency} className="rounded-md border border-ink-200 p-3.5">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-sm font-semibold text-ink-900">{e.competency}</span>
                      <Badge variant={e.relevance}>{e.relevance} relevance</Badge>
                    </div>
                    {e.evidence && (
                      <p className="flex items-start gap-1.5 text-xs italic text-ink-600">
                        <Quote size={12} className="mt-0.5 shrink-0 text-ink-400" />
                        &ldquo;{e.evidence}&rdquo;
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-md bg-surface-subtle px-3.5 py-3 text-sm text-ink-600">
                No competencies confidently matched from this material.
              </p>
            )}
          </div>

          {/* AI insights */}
          <div className="card mb-6">
            <div className="mb-4 flex items-center gap-2">
              <Lightbulb size={16} className="text-accent-600" />
              <h2 className="font-display text-sm font-bold text-ink-900">AI Learning Insights</h2>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <InsightStat icon={Hash} label="Primary topic" value={primaryTopic || '—'} />
              <InsightStat icon={Target} label="Most relevant competency" value={mostRelevantCompetency || 'None detected'} />
              <InsightStat icon={Gauge} label="Estimated difficulty" value={analysis.difficulty} />
              <InsightStat icon={BookOpen} label="Assessment type" value="Adaptive MCQs" />
            </div>
          </div>

          {/* Assessment CTA + generation */}
          <div className="card">
            <p className="section-eyebrow mb-1">Ready to test your understanding?</p>
            <h2 className="mb-1 font-display text-sm font-bold text-ink-900">Generate an adaptive assessment from this material</h2>
            <p className="mb-4 text-xs text-ink-500">Questions are grounded in this document — every explanation cites the source sentence.</p>
            <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <label className="label">Questions</label>
                <select className="input" value={genCount} onChange={(e) => setGenCount(Number(e.target.value))} disabled={generating}>
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                </select>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="label">Difficulty</label>
                <select className="input" value={genDifficulty} onChange={(e) => setGenDifficulty(e.target.value)} disabled={generating}>
                  <option value="MIXED">Mixed (Adaptive)</option>
                  <option value="EASY">Easy</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HARD">Hard</option>
                </select>
              </div>
            </div>
            {genError && <p className="mb-3 text-sm text-danger-600">{genError}</p>}

            {!generating && (
              <button onClick={handleGenerate} className="btn-accent">
                <Sparkles size={16} /> Generate AI Assessment →
              </button>
            )}

            {generating && (
              <div className="rounded-lg border border-ink-200 bg-surface-subtle p-4 animate-fade-in">
                <p className="section-eyebrow mb-3">AI Assessment Generation</p>
                <ul className="space-y-2">
                  {GENERATION_STEPS.map((step, idx) => (
                    <li key={step} className="flex items-center gap-2 text-sm">
                      {idx < genStepIndex ? (
                        <CheckCircle2 size={15} className="shrink-0 text-success-600" />
                      ) : idx === genStepIndex ? (
                        <Sparkles size={15} className="shrink-0 animate-pulse text-primary-600" />
                      ) : (
                        <span className="h-[15px] w-[15px] shrink-0 rounded-full border border-ink-300" />
                      )}
                      <span className={idx <= genStepIndex ? 'text-ink-900' : 'text-ink-400'}>{step}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {lastQuiz && !generating && (
              <div className="mt-5 animate-slide-up rounded-lg border border-success-200 bg-success-50 p-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-success-700">
                  <CheckCircle2 size={14} /> Assessment Ready
                </p>
                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <p className="text-[11px] text-ink-500">Questions</p>
                    <p className="font-medium text-ink-900">{lastQuiz.questions.length}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-ink-500">Competencies</p>
                    <p className="truncate font-medium text-ink-900">{competencySet.slice(0, 2).join(' • ')}{competencySet.length > 2 ? '…' : ''}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-ink-500">Difficulty</p>
                    <p className="font-medium text-ink-900">Adaptive</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-ink-500">Source</p>
                    <p className="truncate font-medium text-ink-900">{material.originalName}</p>
                  </div>
                </div>

                {difficultyCounts && (
                  <div className="mt-3">
                    <p className="mb-1 text-[11px] text-ink-500">Difficulty distribution</p>
                    <div className="flex h-2 overflow-hidden rounded-full bg-ink-100">
                      {['EASY', 'MEDIUM', 'HARD'].map((d) =>
                        difficultyCounts[d] ? (
                          <div
                            key={d}
                            className={DIFFICULTY_COLOR[d]}
                            style={{ width: `${(difficultyCounts[d] / lastQuiz.questions.length) * 100}%` }}
                          />
                        ) : null
                      )}
                    </div>
                  </div>
                )}

                <button onClick={() => navigate(`/quizzes/${lastQuiz.quiz.id}/take`)} className="btn-primary mt-4 w-full">
                  Begin Adaptive Assessment
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function InsightStat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-md bg-surface-subtle p-3">
      <Icon size={14} className="mb-1.5 text-ink-400" />
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{label}</p>
      <p className="truncate text-sm font-semibold text-ink-900">{value}</p>
    </div>
  );
}
