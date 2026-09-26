import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  UserCircle,
  ClipboardCheck,
  TrendingDown,
  FileText,
  BrainCircuit,
  Route as RouteIcon,
  GraduationCap,
  LineChart,
  LogOut,
  Menu,
  Shield,
  Bell,
  ChevronsLeft,
  ChevronsRight,
  Settings,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import AIAssistant from '../components/AIAssistant.jsx';
import { getSkillGaps } from '../services/skillGapService';

const LEARNER_NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/competency-intelligence', label: 'Competency Intelligence', icon: BrainCircuit },
  { to: '/assessment', label: 'Assessment', icon: ClipboardCheck },
  { to: '/skill-gaps', label: 'Skill Gaps', icon: TrendingDown },
  { to: '/materials', label: 'AI Content Intelligence', icon: FileText },
  { to: '/learning-path', label: 'Learning Path', icon: RouteIcon },
  { to: '/igot-courses', label: 'iGOT Courses', icon: GraduationCap },
  { to: '/progress', label: 'Progress', icon: LineChart },
];

const ADMIN_NAV = [{ to: '/admin', label: 'Admin Dashboard', icon: Shield }];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sih_sidebar_collapsed') === '1';
    } catch {
      return false;
    }
  });
  const [highPriorityCount, setHighPriorityCount] = useState(0);

  const navItems = user?.role === 'ADMIN' ? ADMIN_NAV : LEARNER_NAV;

  useEffect(() => {
    if (user?.role !== 'LEARNER') return;
    getSkillGaps()
      .then((gaps) => setHighPriorityCount(gaps.filter((g) => g.priority === 'HIGH').length))
      .catch(() => setHighPriorityCount(0));
  }, [user]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem('sih_sidebar_collapsed', !c ? '1' : '0');
      } catch {
        /* ignore */
      }
      return !c;
    });
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="h-screen flex overflow-hidden bg-surface-subtle">
      <aside className={`hidden md:flex md:flex-col md:h-screen md:shrink-0 border-r border-ink-200 bg-white transition-all duration-200 ${collapsed ? 'md:w-[72px]' : 'md:w-64'}`}>
        <SidebarContent
          navItems={navItems}
          user={user}
          onLogout={handleLogout}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapsed}
          highPriorityCount={highPriorityCount}
        />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-ink-950/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 bg-white shadow-popover animate-slide-in-right">
            <SidebarContent
              navItems={navItems}
              user={user}
              onLogout={handleLogout}
              onNavigate={() => setMobileOpen(false)}
              highPriorityCount={highPriorityCount}
            />
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-ink-200 bg-white px-4 py-3 md:hidden">
          <button onClick={() => setMobileOpen(true)} className="text-ink-700">
            <Menu size={22} />
          </button>
          <span className="font-display text-sm font-bold text-ink-900">AI Learning Platform</span>
          <div className="w-6" />
        </header>

        <main className="flex-1 p-4 md:p-8 max-w-[1400px] w-full mx-auto">
          <Outlet />
        </main>
      </div>

      {user?.role === 'LEARNER' && <AIAssistant />}
    </div>
  );
}

function SidebarContent({ navItems, user, onLogout, onNavigate, collapsed = false, onToggleCollapse, highPriorityCount = 0 }) {
  return (
    <div className="flex h-full flex-col">
      <div className={`flex items-center gap-2.5 border-b border-ink-200 px-4 py-5 ${collapsed ? 'justify-center px-2' : ''}`}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary-600 to-primary-800 text-white shadow-sm">
          <BrainCircuit size={18} />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-bold leading-tight text-ink-900">AI Learning Platform</p>
            <p className="truncate text-[11px] leading-tight text-ink-500">Competency Intelligence · SIH26101</p>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4 scrollbar-thin">
        {navItems.map(({ to, label, icon: Icon }) => {
          const showBadge = to === '/skill-gaps' && highPriorityCount > 0;
          return (
            <NavLink
              key={to}
              to={to}
              onClick={onNavigate}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  collapsed ? 'justify-center' : ''
                } ${isActive ? 'bg-primary-50 text-primary-700' : 'text-ink-600 hover:bg-surface-muted hover:text-ink-900'}`
              }
            >
              <Icon size={18} className="shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
              {showBadge && (
                <span
                  className={`flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-600 px-1 text-[10px] font-bold text-white ${
                    collapsed ? 'absolute -right-0.5 -top-0.5' : 'ml-auto'
                  }`}
                >
                  {highPriorityCount}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {onToggleCollapse && (
        <button
          onClick={onToggleCollapse}
          className="mx-3 mb-2 flex items-center justify-center gap-2 rounded-md border border-ink-200 py-1.5 text-xs font-medium text-ink-500 hover:bg-surface-muted"
        >
          {collapsed ? <ChevronsRight size={14} /> : (<><ChevronsLeft size={14} /> Collapse</>)}
        </button>
      )}

      <div className={`border-t border-ink-200 px-3 py-4 ${collapsed ? 'px-2' : ''}`}>
        {!collapsed && (
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Account</span>
            <button className="relative text-ink-400 hover:text-ink-700" title="Notifications">
              <Bell size={15} />
              {highPriorityCount > 0 && <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-danger-500" />}
            </button>
          </div>
        )}
        <div className={`mb-3 flex items-center gap-2 ${collapsed ? 'justify-center' : ''}`}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-900 text-xs font-semibold text-white">
            {(user?.name || '?').slice(0, 1).toUpperCase()}
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink-900">{user?.name}</p>
              <p className="truncate text-xs text-ink-500">{user?.email}</p>
            </div>
          )}
        </div>
        {!collapsed ? (
          <div className="space-y-1">
            <NavLink to="/profile" onClick={onNavigate} className="btn-ghost w-full justify-start">
              <Settings size={14} /> Profile &amp; Settings
            </NavLink>
            <button onClick={onLogout} className="btn-secondary w-full">
              <LogOut size={14} /> Sign out
            </button>
          </div>
        ) : (
          <button onClick={onLogout} title="Sign out" className="btn-secondary w-full !px-0">
            <LogOut size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
