import React, { useEffect, useMemo, useState } from 'react';
import { Search, Clock, GraduationCap, Info, SlidersHorizontal, Sparkles } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Badge from '../components/Badge.jsx';
import { SkeletonList } from '../components/Skeleton.jsx';
import { getCourses, searchCourses } from '../services/igotService';
import { catalogLabel } from '../utils/display';
import { getSkillGaps } from '../services/skillGapService';
import { getErrorMessage } from '../services/api';

const LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];

function CourseCard({ c, recommended }) {
  return (
    <div className={`card flex flex-col ${recommended ? 'ring-1 ring-accent-300' : ''}`}>
      {recommended && (
        <span className="mb-2 inline-flex w-fit items-center gap-1 rounded-md bg-accent-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-700">
          <Sparkles size={10} /> Recommended for you
        </span>
      )}
      <div className="mb-2 flex items-center justify-between">
        <Badge variant={c.competency?.category}>{c.competency?.name}</Badge>
        <Badge variant={c.level}>{c.level}</Badge>
      </div>
      <p className="text-sm font-semibold text-ink-900">{c.title}</p>
      <p className="mt-1 flex-1 text-xs text-ink-500">{c.description}</p>
      <div className="mt-3 flex items-center justify-between text-xs text-ink-500">
        <span className="flex items-center gap-1">
          <Clock size={12} /> {c.durationHrs}h
        </span>
        <span className="truncate">{catalogLabel(c.source)}</span>
      </div>
    </div>
  );
}

export default function IgotCourses() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [courses, setCourses] = useState([]);
  const [source, setSource] = useState('');
  const [query, setQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState('ALL');
  const [maxDuration, setMaxDuration] = useState(12);
  const [relevantOnly, setRelevantOnly] = useState(false);
  const [gapCompetencyIds, setGapCompetencyIds] = useState(new Set());
  const [showFilters, setShowFilters] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [data, gaps] = await Promise.all([getCourses(), getSkillGaps()]);
      setCourses(data.courses);
      setSource(data.source);
      setGapCompetencyIds(new Set(gaps.filter((g) => g.gap > 0).map((g) => g.competencyId)));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return load();
    setLoading(true);
    setError('');
    try {
      const data = await searchCourses(query);
      setCourses(data.courses);
      setSource(data.source);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const recommended = useMemo(
    () => courses.filter((c) => gapCompetencyIds.has(c.competencyId)).slice(0, 3),
    [courses, gapCompetencyIds]
  );

  const filtered = courses.filter((c) => {
    if (levelFilter !== 'ALL' && c.level !== levelFilter) return false;
    if (c.durationHrs > maxDuration) return false;
    if (relevantOnly && !gapCompetencyIds.has(c.competencyId)) return false;
    return true;
  });

  return (
    <div>
      <PageHeader
        eyebrow="iGOT-aligned Learning Recommendations"
        title="Training Catalog"
        description="Courses mapped to the competency framework and structured for integration with the iGOT Karmayogi platform."
      />

      <div className="mb-4 flex items-start gap-2 rounded-md bg-primary-50 px-3 py-2.5 text-xs text-primary-800">
        <Info size={14} className="mt-0.5 shrink-0" />
        <span>
          Source: <strong>{catalogLabel(source)}</strong> — recommendations use the platform&apos;s built-in, iGOT-aligned catalog.
          A live iGOT Karmayogi connection is not enabled.
        </span>
      </div>

      {recommended.length > 0 && (
        <div className="mb-6">
          <p className="section-eyebrow mb-2">Based on your skill gaps</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recommended.map((c) => <CourseCard key={c.id} c={c} recommended />)}
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form onSubmit={handleSearch} className="flex flex-1 gap-2">
          <input
            className="input"
            placeholder="Search by title, description, or competency..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" className="btn-primary shrink-0">
            <Search size={16} /> Search
          </button>
        </form>
        <button onClick={() => setShowFilters((s) => !s)} className="btn-secondary shrink-0">
          <SlidersHorizontal size={14} /> Filters
        </button>
      </div>

      {showFilters && (
        <div className="card mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3 animate-slide-up">
          <div>
            <label className="label">Difficulty</label>
            <select className="input" value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}>
              <option value="ALL">All levels</option>
              {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Max duration: {maxDuration}h</label>
            <input type="range" min={1} max={12} value={maxDuration} onChange={(e) => setMaxDuration(Number(e.target.value))} className="w-full accent-primary-600" />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input type="checkbox" checked={relevantOnly} onChange={(e) => setRelevantOnly(e.target.checked)} className="h-3.5 w-3.5 rounded border-ink-300 accent-primary-600" />
              Relevant to my gaps only
            </label>
          </div>
        </div>
      )}

      {loading ? (
        <SkeletonList rows={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={GraduationCap} title="No courses found" description="Try a different search term or adjust your filters." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => <CourseCard key={c.id} c={c} />)}
        </div>
      )}
    </div>
  );
}
