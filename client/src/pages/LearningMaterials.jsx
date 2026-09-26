import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  UploadCloud,
  FileText,
  ChevronRight,
  FileType2,
  X,
  ArrowRight,
  Search,
  Braces,
  Map,
  ClipboardCheck,
  Target,
} from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Badge from '../components/Badge.jsx';
import { SkeletonList } from '../components/Skeleton.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { listMaterials, uploadMaterial } from '../services/materialService';
import { getErrorMessage } from '../services/api';

const STATUS_VARIANT = {
  UPLOADED: 'MEDIUM',
  EXTRACTING: 'MEDIUM',
  ANALYZING: 'MEDIUM',
  COMPLETED: 'STRONG',
  FAILED: 'NEEDS_IMPROVEMENT',
};

const ACCEPTED_TYPES = '.pdf,.docx,.txt';
const MAX_UPLOAD_MB = 10; // matches server MAX_UPLOAD_SIZE_MB in .env

const WORKFLOW_STEPS = [
  { label: 'Upload', icon: UploadCloud },
  { label: 'Analyze', icon: Search },
  { label: 'Map', icon: Map },
  { label: 'Assess', icon: ClipboardCheck },
  { label: 'Personalize', icon: Target },
];

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.ceil(bytes / 1024)} KB`;
}

export default function LearningMaterials() {
  const toast = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [materials, setMaterials] = useState([]);
  const [pendingFile, setPendingFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setMaterials(await listMaterials());
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const selectFile = useCallback((file) => {
    if (!file) return;
    setUploadError('');
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setUploadError(`This file is ${formatSize(file.size)} — the maximum supported size is ${MAX_UPLOAD_MB}MB.`);
      return;
    }
    setPendingFile(file);
  }, []);

  const clearPending = () => {
    setPendingFile(null);
    setUploadError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUpload = useCallback(async () => {
    if (!pendingFile) return;
    setUploadError('');
    setUploading(true);
    setUploadProgress(0);
    try {
      const material = await uploadMaterial(pendingFile, setUploadProgress);
      toast.success(`"${pendingFile.name}" uploaded — ready for AI analysis.`);
      navigate(`/materials/${material.id}`);
    } catch (err) {
      setUploadError(getErrorMessage(err));
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }, [pendingFile, toast, navigate]);

  const onDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    selectFile(e.dataTransfer.files?.[0]);
  };

  return (
    <div>
      <PageHeader
        eyebrow="AI Content Intelligence"
        title="Turn any learning material into personalized competency development."
        description="Upload official learning material and let the platform extract knowledge, identify relevant competencies, and prepare an adaptive assessment."
      />

      <div className="card mb-6">
        <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-2">
          {WORKFLOW_STEPS.map((step, idx) => (
            <React.Fragment key={step.label}>
              <div className="flex items-center gap-1.5 rounded-full bg-surface-subtle px-3 py-1.5">
                <step.icon size={13} className="text-primary-600" />
                <span className="text-xs font-semibold text-ink-700">{step.label}</span>
              </div>
              {idx < WORKFLOW_STEPS.length - 1 && <ArrowRight size={13} className="shrink-0 text-ink-300" />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {!pendingFile ? (
        <div
          onDrop={onDrop}
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          className={`relative mb-6 flex flex-col items-center justify-center gap-3 overflow-hidden rounded-lg border-2 border-dashed py-14 text-center transition-colors ${
            dragActive ? 'border-primary-500 bg-primary-50' : 'border-ink-300 bg-white'
          }`}
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-50 text-primary-600">
            <UploadCloud size={26} />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink-900">Upload Learning Material</p>
            <p className="mt-1 flex items-center justify-center gap-3 text-xs text-ink-500">
              <span className="flex items-center gap-1"><FileType2 size={12} /> PDF</span>
              <span className="flex items-center gap-1"><FileType2 size={12} /> DOCX</span>
              <span className="flex items-center gap-1"><FileType2 size={12} /> TXT</span>
            </p>
            <p className="mt-1 text-xs text-ink-400">Maximum supported file size: {MAX_UPLOAD_MB}MB</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            className="hidden"
            onChange={(e) => selectFile(e.target.files?.[0])}
          />
          <button onClick={() => fileInputRef.current?.click()} className="btn-primary">
            Browse Files
          </button>
          {uploadError && <p className="text-sm text-danger-600">{uploadError}</p>}
        </div>
      ) : (
        <div className="mb-6 rounded-lg border border-ink-200 bg-white p-5 animate-slide-up">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary-700">
                <FileText size={20} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink-900">{pendingFile.name}</p>
                <p className="text-xs text-ink-500">{formatSize(pendingFile.size)} • ready to upload</p>
              </div>
            </div>
            {!uploading && (
              <button onClick={clearPending} className="shrink-0 text-ink-400 hover:text-ink-700" aria-label="Remove selected file">
                <X size={18} />
              </button>
            )}
          </div>

          {uploading && (
            <div className="mt-4">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
                <div className="h-1.5 rounded-full bg-primary-600 transition-all" style={{ width: `${uploadProgress}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-ink-500">Uploading… {uploadProgress}%</p>
            </div>
          )}

          {uploadError && <p className="mt-3 text-sm text-danger-600">{uploadError}</p>}

          {!uploading && (
            <button onClick={handleUpload} className="btn-primary mt-4 w-full">
              <UploadCloud size={15} /> Upload Material
            </button>
          )}
        </div>
      )}

      {loading ? (
        <SkeletonList rows={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : materials.length === 0 ? (
        <EmptyState icon={Braces} title="No materials yet" description="Upload your first document to get started." />
      ) : (
        <div className="space-y-2">
          {materials.map((m) => (
            <Link
              key={m.id}
              to={`/materials/${m.id}`}
              className="card-interactive flex items-center justify-between"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary-700">
                  <FileText size={18} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-900">{m.originalName}</p>
                  <p className="text-xs text-ink-500">
                    {m.fileType} • {formatSize(m.fileSize)} • {new Date(m.uploadedAt).toLocaleDateString()}
                    {m.quizzes?.length > 0 && ` • ${m.quizzes.length} quiz${m.quizzes.length > 1 ? 'zes' : ''} generated`}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <Badge variant={STATUS_VARIANT[m.status]}>{m.status}</Badge>
                <ChevronRight size={16} className="text-ink-400" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
