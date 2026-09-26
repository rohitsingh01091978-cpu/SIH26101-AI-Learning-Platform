import React, { useEffect, useState } from 'react';
import { Users, UserCheck, Target, ClipboardCheck, RefreshCcw, ShieldAlert, Building2 } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import KPICard from '../components/KPICard.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Badge from '../components/Badge.jsx';
import { SkeletonKPIRow, SkeletonChart } from '../components/Skeleton.jsx';
import CompetencyBarChart from '../charts/CompetencyBarChart.jsx';
import { CHART } from '../charts/theme.jsx';
import { getAdminDashboard } from '../services/adminService';
import { getErrorMessage } from '../services/api';

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setData(await getAdminDashboard());
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
        <SkeletonKPIRow />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SkeletonChart />
          <SkeletonChart />
        </div>
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;

  const distChartData = data.competencyDistribution.map((d) => ({ name: d.category.replace(/_/g, ' '), currentLevel: d.averageLevel }));
  const criticalGaps = data.topSkillGaps.filter((g) => g.averageGap > 30).slice(0, 5);

  return (
    <div>
      <div className="mb-6 flex items-center gap-2.5 rounded-lg bg-gradient-to-r from-ink-900 to-ink-800 px-5 py-4 text-white">
        <ShieldAlert size={20} className="text-accent-400" />
        <div>
          <p className="font-display text-sm font-bold">Administrator Console</p>
          <p className="text-xs text-ink-300">Organization-wide competency intelligence — every figure below is a live database query.</p>
        </div>
      </div>

      <PageHeader
        title="Admin Dashboard"
        action={
          <button onClick={load} className="btn-secondary">
            <RefreshCcw size={14} /> Refresh
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KPICard icon={Users} label="Total learners" value={data.totalLearners} tone="primary" />
        <KPICard icon={UserCheck} label="Active learners (30d)" value={data.activeLearners} tone="success" />
        <KPICard icon={Target} label="Average competency" value={`${data.averageCompetency}%`} tone="primary" />
        <KPICard icon={ClipboardCheck} label="Assessments completed" value={data.completedAssessments} sub={`${data.assessmentCompletionRate}% of learners`} tone="warning" />
        <KPICard icon={Building2} label="Materials uploaded" value={data.totalUploadedMaterials} tone="accent" />
      </div>

      {criticalGaps.length > 0 && (
        <div className="card mt-6 border-l-4 !border-l-danger-500">
          <div className="mb-4 flex items-center gap-2">
            <ShieldAlert size={16} className="text-danger-600" />
            <h2 className="font-display text-sm font-bold text-ink-900">Critical Competency Gaps</h2>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {criticalGaps.map((g) => (
              <div key={g.competency}>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-sm font-semibold text-ink-900">{g.competency}</span>
                  <span className="text-xs text-ink-500">{g.learnersAffected} learner{g.learnersAffected === 1 ? '' : 's'} affected</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100">
                    <div className="h-2 rounded-full bg-danger-500" style={{ width: `${Math.min(100, g.averageGap)}%` }} />
                  </div>
                  <span className="w-24 shrink-0 text-right text-xs font-semibold text-danger-700">Avg gap {g.averageGap}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <p className="section-eyebrow mb-1">Organization-wide</p>
          <h2 className="mb-4 font-display text-sm font-bold text-ink-900">Top skill gaps (avg. across learners)</h2>
          {data.topSkillGaps.length ? (
            <CompetencyBarChart data={data.topSkillGaps.map((g) => ({ name: g.competency, currentLevel: g.averageGap }))} color={CHART.warning} />
          ) : (
            <p className="text-sm text-ink-500">No data yet.</p>
          )}
        </div>
        <div className="card">
          <p className="section-eyebrow mb-1">By category</p>
          <h2 className="mb-4 font-display text-sm font-bold text-ink-900">Competency distribution</h2>
          {distChartData.length ? <CompetencyBarChart data={distChartData} color={CHART.current} /> : <p className="text-sm text-ink-500">No data yet.</p>}
        </div>
      </div>

      <div className="card mt-6">
        <p className="section-eyebrow mb-1">Departments</p>
        <h2 className="mb-4 font-display text-sm font-bold text-ink-900">Department comparison</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-ink-200 text-xs uppercase tracking-wide text-ink-500">
                <th className="pb-2">Department</th>
                <th className="pb-2">Learners</th>
                <th className="pb-2">Avg. competency</th>
              </tr>
            </thead>
            <tbody>
              {data.departmentStatistics.map((d) => (
                <tr key={d.department} className="border-b border-ink-100">
                  <td className="py-2.5 text-ink-900">{d.department}</td>
                  <td className="py-2.5 text-ink-700">{d.learnerCount}</td>
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-8 text-ink-700">{d.averageCompetency}%</span>
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-ink-100">
                        <div className="h-1.5 rounded-full bg-primary-600" style={{ width: `${d.averageCompetency}%` }} />
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card mt-6">
        <p className="section-eyebrow mb-1">Engagement</p>
        <h2 className="mb-4 font-display text-sm font-bold text-ink-900">Learning progress</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-md bg-surface-subtle p-3.5 text-center">
            <p className="font-display text-2xl font-bold text-ink-900">{data.learningProgress.inProgress}</p>
            <p className="text-xs text-ink-500">Courses in progress</p>
          </div>
          <div className="rounded-md bg-surface-subtle p-3.5 text-center">
            <p className="font-display text-2xl font-bold text-ink-900">{data.learningProgress.completed}</p>
            <p className="text-xs text-ink-500">Courses completed</p>
          </div>
        </div>
      </div>
    </div>
  );
}
