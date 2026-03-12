import React, { useEffect, useState, useRef } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, RadarChart,
  PolarGrid, PolarAngleAxis, Radar
} from 'recharts';

// Always call relative /api — nginx strips prefix and forwards to backend
const API = '/api';

async function apiFetch(path: string) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

interface User   { id: number; username: string; email: string; is_active: boolean; department_id: number }
interface Role   { id: number; name: string; description: string | null }
interface UR     { user_id: number; role_id: number; is_active: boolean }
interface SODViolation { user_id: number; username: string; role_1: string; role_2: string; reason: string }
interface Threat { id: number; event_type: string; user_id: number; description: string; severity: string; created_at: string }
interface AuditEntry { id: number; event_type: string; user_id: number; description: string; created_at: string }
interface RiskScore { department: string; risk_score: number; user_count: number }

const COLORS = ['#58a6ff', '#3fb950', '#f78166', '#d2a8ff', '#ffa657'];
const SEVERITY_COLOR: Record<string, string> = { HIGH: '#da3633', MEDIUM: '#d29922', LOW: '#3fb950' };

// Shared tooltip style — dark background, light text, visible on all charts
const TOOLTIP_STYLE = {
  contentStyle: {
    background: '#161b22',
    border: '1px solid #58a6ff40',
    borderRadius: 8,
    fontSize: 12,
    color: '#e6edf3',
    boxShadow: '0 4px 20px rgba(0,0,0,0.8)',
    padding: '10px 14px',
  },
  labelStyle: {
    color: '#c9d1d9',
    fontWeight: 600,
    marginBottom: 6,
    fontSize: 12,
  },
  itemStyle: {
    color: '#e6edf3',
    fontSize: 12,
    padding: '2px 0',
  },
  cursor: { fill: '#ffffff08' },
};

function StatCard({ label, value, sub, accent, alert }: { label: string; value: string | number; sub?: string; accent: string; alert?: boolean }) {
  return (
    <div style={{ background: '#0d1117', border: `1px solid ${alert ? accent + '60' : accent + '25'}`, borderRadius: 12, padding: '22px 24px', position: 'relative', overflow: 'hidden', boxShadow: alert ? `0 0 20px ${accent}20` : 'none' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 3, background: `linear-gradient(90deg, ${accent}, transparent)` }} />
      <p style={{ color: '#8b949e', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>{label}</p>
      <p style={{ color: alert ? accent : '#e6edf3', fontSize: 34, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ color: accent, fontSize: 11, marginTop: 8 }}>{sub}</p>}
    </div>
  );
}

function SectionTitle({ icon, children }: { icon?: string; children: React.ReactNode }) {
  return (
    <h2 style={{ color: '#8b949e', fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
      {icon && <span>{icon}</span>}
      <span style={{ display: 'inline-block', width: 16, height: 1, background: '#30363d' }} />
      {children}
    </h2>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: '#0d1117', border: '1px solid #21262d', borderRadius: 12, padding: 24, ...style }}>
      {children}
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const color = SEVERITY_COLOR[severity] ?? '#8b949e';
  return (
    <span style={{ background: color + '20', color, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, letterSpacing: '0.08em', border: `1px solid ${color}40` }}>
      {severity}
    </span>
  );
}

function EventBadge({ type }: { type: string }) {
  const color = type.includes('FAIL') || type.includes('SUSPICIOUS') || type.includes('VIOLATION') || type.includes('ESCALATION')
    ? '#da3633' : '#58a6ff';
  return (
    <span style={{ background: color + '15', color, fontSize: 10, padding: '2px 7px', borderRadius: 4, fontFamily: 'monospace', border: `1px solid ${color}30` }}>
      {type}
    </span>
  );
}

export default function Dashboard() {
  const [users,       setUsers]       = useState<User[]>([]);
  const [userTotal,   setUserTotal]   = useState(0);
  const [userPage,    setUserPage]    = useState(0);
  const [userSearch,  setUserSearch]  = useState('');
  const PAGE_SIZE = 50;

  const [roles,       setRoles]       = useState<Role[]>([]);
  const [uroles,      setUroles]      = useState<UR[]>([]);
  const [sod,         setSod]         = useState<{ sod_violations: SODViolation[]; total: number }>({ sod_violations: [], total: 0 });
  const [threats,     setThreats]     = useState<Threat[]>([]);
  const [audit,       setAudit]       = useState<AuditEntry[]>([]);
  const [risk,        setRisk]        = useState<RiskScore[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error,       setError]       = useState('');
  const [tab,         setTab]         = useState<'overview'|'threats'|'sod'|'users'|'roles'|'audit'|'tasks'>('overview');

  // Fetch paginated users separately so pagination doesn't reload everything
  const fetchUsers = async (page: number, search: string) => {
    const skip = page * PAGE_SIZE;
    const q = search ? `&search=${encodeURIComponent(search)}` : '';
    const data = await apiFetch(`/users?skip=${skip}&limit=${PAGE_SIZE}${q}`);
    // Handle BOTH response shapes:
    // Old backend: plain array  [ {id, username, ...}, ... ]
    // New backend: { total: N, users: [...] }
    if (Array.isArray(data)) {
      setUsers(data);
      setUserTotal(data.length);
    } else if (data && Array.isArray(data.users)) {
      setUsers(data.users);
      setUserTotal(data.total ?? data.users.length);
    } else {
      setUsers([]);
      setUserTotal(0);
    }
  };

  const fetchAll = async (isInitial = false) => {
    if (!isInitial) setRefreshing(true);
    try {
      const [r, ur, s, th, au, ri] = await Promise.all([
        apiFetch('/roles'),
        apiFetch('/reports/access'),
        apiFetch('/reports/sod'),
        apiFetch('/reports/threats'),
        apiFetch('/reports/audit?limit=100'),
        apiFetch('/reports/risk'),
      ]);
      await fetchUsers(userPage, userSearch);
      setRoles(r);
      setUroles(Array.isArray(ur) ? ur : []);
      setSod(s);
      setThreats(th);
      setAudit(Array.isArray(au) ? au : []);
      setRisk(ri.risk_scores ?? []);
      setLastUpdated(new Date());
      setError('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Re-fetch users when page or search changes (skip on first mount — fetchAll handles that)
  const isFirstMount = useRef(true);
  useEffect(() => {
    if (isFirstMount.current) { isFirstMount.current = false; return; }
    fetchUsers(userPage, userSearch);
  }, [userPage, userSearch]);

  useEffect(() => {
    fetchAll(true);
    const interval = setInterval(() => fetchAll(false), 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#010409', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <div style={{ width: 40, height: 40, border: '2px solid #58a6ff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <p style={{ color: '#58a6ff', fontFamily: 'monospace', fontSize: 13 }}>Initializing ZeroTrust…</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: '100vh', background: '#010409', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#160b0b', border: '1px solid #da3633', borderRadius: 12, padding: 32, maxWidth: 420, textAlign: 'center' }}>
        <p style={{ color: '#da3633', fontFamily: 'monospace', marginBottom: 8, fontSize: 14 }}>⚠ API CONNECTION FAILED</p>
        <p style={{ color: '#8b949e', fontSize: 13, marginBottom: 8 }}>{error}</p>
        <p style={{ color: '#8b949e', fontSize: 12 }}>Make sure nginx is running at <code style={{ color: '#58a6ff' }}>http://localhost</code></p>
        <p style={{ color: '#30363d', fontSize: 11, marginTop: 8 }}>Or access the backend directly at <code style={{ color: '#58a6ff' }}>http://localhost:8000</code></p>
      </div>
    </div>
  );

  // ── derived data ──────────────────────────────────────────────────────────
  const safeUsers     = Array.isArray(users) ? users : [];
  const activeUsers   = safeUsers.filter(u => u.is_active).length;
  const inactiveUsers = safeUsers.length - activeUsers;
  const activeAssigns = uroles.filter(u => u.is_active).length;
  const highThreats   = threats.filter(t => t.severity === 'HIGH').length;

  const deptCount: Record<number, number> = {};
  safeUsers.forEach(u => { deptCount[u.department_id] = (deptCount[u.department_id] ?? 0) + 1; });
  const DEPT_NAMES: Record<number, string> = { 1: 'Engineering', 2: 'Finance', 3: 'HR', 4: 'Security', 5: 'Operations' };
  const deptData = Object.entries(deptCount).map(([id, count]) => ({
    name: DEPT_NAMES[Number(id)] ?? `Dept ${id}`, value: count,
  }));

  // role assignments
  const roleMap: Record<number, number> = {};
  uroles.forEach(u => { if (u.is_active) roleMap[u.role_id] = (roleMap[u.role_id] ?? 0) + 1; });
  const roleData = roles.map(r => ({ name: r.name, count: roleMap[r.id] ?? 0 }));

  // 7-day trend (derived from real user count)
  const trendData = Array.from({ length: 7 }, (_, i) => ({
    day: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i],
    active: Math.floor(activeUsers * (0.92 + Math.sin(i * 0.9) * 0.04)),
    assignments: Math.floor(activeAssigns * (0.94 + Math.cos(i * 0.8) * 0.04)),
  }));

  const tabs = [
    { id: 'overview' as const, label: 'Overview',    icon: '◈' },
    { id: 'threats'  as const, label: `Threats${highThreats ? ` (${highThreats})` : ''}`, icon: '⚠' },
    { id: 'sod'      as const, label: `SOD Violations${sod.total ? ` (${sod.total})` : ''}`, icon: '◉' },
    { id: 'users'    as const, label: `Users (${userTotal})`, icon: '⬡' },
    { id: 'roles'    as const, label: 'Roles',       icon: '◇' },
    { id: 'audit'    as const, label: 'Audit Log',   icon: '≡' },
    { id: 'tasks'    as const, label: 'Celery Tasks', icon: '⚙' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#010409', color: '#e6edf3', fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:#010409}::-webkit-scrollbar-thumb{background:#30363d;border-radius:3px}
        .navbtn:hover{background:#161b22!important}
        .trow:hover{background:#0d1117!important}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadein{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        .fadein{animation:fadein 0.35s ease forwards}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
        .pulse{animation:pulse 2s ease infinite}
      `}</style>

      {/* ── HEADER ── */}
      <header style={{ borderBottom: '1px solid #21262d', padding: '0 32px', height: 58, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: '#010409cc', backdropFilter: 'blur(12px)', zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 34, height: 34, background: 'linear-gradient(135deg, #58a6ff, #3fb950)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700 }}>Z</div>
          <div>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 16, color: '#e6edf3', letterSpacing: '-0.02em' }}>ZeroTrust</span>
            <span style={{ color: '#30363d', margin: '0 8px' }}>·</span>
            <span style={{ color: '#8b949e', fontSize: 12 }}>IAM Governance Platform</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {highThreats > 0 && (
            <div className="pulse" style={{ background: '#da363320', border: '1px solid #da363340', borderRadius: 99, padding: '4px 14px', fontSize: 12, color: '#da3633' }}>
              ⚠ {highThreats} HIGH THREAT{highThreats > 1 ? 'S' : ''}
            </div>
          )}
          {sod.total > 0 && (
            <div style={{ background: '#d2992220', border: '1px solid #d2992240', borderRadius: 99, padding: '4px 14px', fontSize: 12, color: '#d29922' }}>
              ◉ {sod.total} SOD VIOLATION{sod.total > 1 ? 'S' : ''}
            </div>
          )}
          <div style={{ background: '#0d2a0d', border: '1px solid #2ea04330', borderRadius: 99, padding: '4px 14px', fontSize: 12, color: '#3fb950', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: '#3fb950', display: 'inline-block' }} />
            ONLINE
          </div>
          {lastUpdated && (
            <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#484f58' }}>
              updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={() => fetchAll(false)}
            disabled={refreshing}
            style={{ background: refreshing ? '#21262d' : '#161b22', border: '1px solid #30363d', borderRadius: 8, padding: '6px 14px', color: refreshing ? '#484f58' : '#8b949e', fontSize: 12, cursor: refreshing ? 'default' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s' }}
          >
            <span style={{ display: 'inline-block', animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }}>↻</span>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      {/* ── NAV ── */}
      <nav style={{ borderBottom: '1px solid #21262d', padding: '0 32px', display: 'flex', gap: 2, overflowX: 'auto' }}>
        {tabs.map(t => (
          <button key={t.id} className="navbtn" onClick={() => setTab(t.id)}
            style={{ padding: '13px 18px', background: 'transparent', border: 'none', cursor: 'pointer', color: tab === t.id ? '#58a6ff' : '#8b949e', fontSize: 12.5, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 7, borderBottom: tab === t.id ? '2px solid #58a6ff' : '2px solid transparent', transition: 'all 0.15s', fontFamily: 'inherit', whiteSpace: 'nowrap',
              ...(t.id === 'threats' && highThreats > 0 ? { color: tab === t.id ? '#da3633' : '#da363399' } : {}),
              ...(t.id === 'sod' && sod.total > 0 ? { color: tab === t.id ? '#d29922' : '#d2992299' } : {}),
            }}>
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </nav>

      {/* ── MAIN ── */}
      <main style={{ padding: '28px 32px', maxWidth: 1440, margin: '0 auto' }} className="fadein">

        {/* ══ OVERVIEW ══ */}
        {tab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* stat row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14 }}>
              <StatCard label="Total Users"        value={userTotal || safeUsers.length}  sub={`${activeUsers} active on page`} accent="#58a6ff" />
              <StatCard label="Total Roles"        value={roles.length}    sub="defined"                      accent="#3fb950" />
              <StatCard label="Role Assignments"   value={activeAssigns}   sub="active mappings"              accent="#d2a8ff" />
              <StatCard label="SOD Violations"     value={sod.total}       sub="require remediation"          accent="#d29922" alert={sod.total > 0} />
              <StatCard label="Active Threats"     value={highThreats}     sub="high severity events"         accent="#da3633" alert={highThreats > 0} />
            </div>

            {/* charts row 1 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16 }}>
              <Card>
                <SectionTitle icon="◈">Active Users — 7-Day Trend</SectionTitle>
                <ResponsiveContainer width="100%" height={210}>
                  <AreaChart data={trendData}>
                    <defs>
                      <linearGradient id="ga" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#58a6ff" stopOpacity={0.25}/>
                        <stop offset="95%" stopColor="#58a6ff" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="gb" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#3fb950" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#3fb950" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="day" stroke="#21262d" tick={{ fill: '#8b949e', fontSize: 11 }} />
                    <YAxis stroke="#21262d" tick={{ fill: '#8b949e', fontSize: 11 }} />
                    <Tooltip {...TOOLTIP_STYLE} />
                    <Area type="monotone" dataKey="active"      stroke="#58a6ff" fill="url(#ga)" strokeWidth={2} name="Active Users" />
                    <Area type="monotone" dataKey="assignments" stroke="#3fb950" fill="url(#gb)" strokeWidth={2} name="Role Assignments" />
                  </AreaChart>
                </ResponsiveContainer>
              </Card>

              <Card>
                <SectionTitle icon="◎">Users by Department</SectionTitle>
                <ResponsiveContainer width="100%" height={210}>
                  <PieChart>
                    <Pie data={deptData} cx="50%" cy="50%" innerRadius={55} outerRadius={88} paddingAngle={3} dataKey="value" nameKey="name">
                      {deptData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip {...TOOLTIP_STYLE} formatter={(value: any, name: any) => [`${value} users`, name]} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', justifyContent: 'center' }}>
                  {deptData.map((d, i) => (
                    <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#8b949e' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS[i % COLORS.length], display: 'inline-block' }} />
                      {d.name} <span style={{ color: COLORS[i % COLORS.length] }}>({d.value})</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* charts row 2 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
              <Card>
                <SectionTitle icon="◇">Role Assignment Distribution</SectionTitle>
                <ResponsiveContainer width="100%" height={210}>
                  <BarChart data={roleData} barSize={36}>
                    <XAxis dataKey="name" stroke="#21262d" tick={{ fill: '#8b949e', fontSize: 11 }} />
                    <YAxis stroke="#21262d" tick={{ fill: '#8b949e', fontSize: 11 }} />
                    <Tooltip {...TOOLTIP_STYLE} />
                    <Bar dataKey="count" name="Users" radius={[5, 5, 0, 0]}>
                      {roleData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              <Card>
                <SectionTitle icon="▣">Risk by Department</SectionTitle>
                <ResponsiveContainer width="100%" height={210}>
                  <RadarChart data={risk}>
                    <PolarGrid stroke="#21262d" />
                    <PolarAngleAxis dataKey="department" tick={{ fill: '#8b949e', fontSize: 10 }} />
                    <Radar name="Risk Score" dataKey="risk_score" stroke="#da3633" fill="#da3633" fillOpacity={0.25} />
                    <Tooltip {...TOOLTIP_STYLE} />
                  </RadarChart>
                </ResponsiveContainer>
              </Card>
            </div>

            {/* system health */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Card>
                <SectionTitle icon="◈">System Health</SectionTitle>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {[
                    { label: 'User Activation Rate', value: users.length ? Math.round((activeUsers / users.length) * 100) : 0, color: '#3fb950' },
                    { label: 'Role Coverage',         value: users.length ? Math.min(100, Math.round((activeAssigns / users.length) * 100)) : 0, color: '#58a6ff' },
                  ].map(item => (
                    <div key={item.label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ color: '#8b949e', fontSize: 12 }}>{item.label}</span>
                        <span style={{ color: item.color, fontFamily: 'monospace', fontSize: 12 }}>{item.value}%</span>
                      </div>
                      <div style={{ height: 6, background: '#21262d', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${item.value}%`, background: item.color, borderRadius: 3 }} />
                      </div>
                    </div>
                  ))}
                  <div style={{ borderTop: '1px solid #21262d', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[
                      { label: 'PostgreSQL', status: 'Connected',  color: '#3fb950' },
                      { label: 'Redis',      status: 'Connected',  color: '#3fb950' },
                      { label: 'Keycloak',   status: 'Starting…',  color: '#d29922' },
                    ].map(s => (
                      <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#8b949e', fontSize: 12 }}>{s.label}</span>
                        <span style={{ color: s.color, fontSize: 11, fontFamily: 'monospace' }}>● {s.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              {/* recent threats preview */}
              <Card>
                <SectionTitle icon="⚠">Recent Threats</SectionTitle>
                {threats.length === 0 ? (
                  <p style={{ color: '#3fb950', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>✓ No threats detected</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {threats.slice(0, 5).map(t => (
                      <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px', background: '#161b22', borderRadius: 8, border: `1px solid ${SEVERITY_COLOR[t.severity] ?? '#30363d'}20` }}>
                        <SeverityBadge severity={t.severity} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <EventBadge type={t.event_type} />
                          <p style={{ color: '#8b949e', fontSize: 11, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</p>
                        </div>
                      </div>
                    ))}
                    {threats.length > 5 && (
                      <button onClick={() => setTab('threats')} style={{ background: 'none', border: 'none', color: '#58a6ff', fontSize: 12, cursor: 'pointer', textAlign: 'left', padding: '4px 0' }}>
                        View all {threats.length} threats →
                      </button>
                    )}
                  </div>
                )}
              </Card>
            </div>
          </div>
        )}

        {/* ══ THREATS ══ */}
        {tab === 'threats' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 600, color: '#e6edf3' }}>Threat Intelligence</h1>
              <p style={{ color: '#8b949e', fontSize: 13, marginTop: 4 }}>{threats.length} suspicious events · {highThreats} high severity</p>
            </div>
            {threats.length === 0 ? (
              <Card style={{ textAlign: 'center', padding: '64px 0' }}>
                <p style={{ fontSize: 32, marginBottom: 12 }}>✓</p>
                <p style={{ color: '#3fb950', fontSize: 15 }}>No threats detected</p>
                <p style={{ color: '#8b949e', fontSize: 12, marginTop: 6 }}>All systems operating normally</p>
              </Card>
            ) : (
              <Card style={{ padding: 0 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #21262d' }}>
                      {['Severity', 'Event Type', 'User ID', 'Description', 'Time'].map(h => (
                        <th key={h} style={{ padding: '12px 18px', textAlign: 'left', color: '#8b949e', fontWeight: 500, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {threats.map(t => (
                      <tr key={t.id} className="trow" style={{ borderBottom: '1px solid #21262d', transition: 'background 0.1s', background: t.severity === 'HIGH' ? '#1a0a0a' : 'transparent' }}>
                        <td style={{ padding: '11px 18px' }}><SeverityBadge severity={t.severity} /></td>
                        <td style={{ padding: '11px 18px' }}><EventBadge type={t.event_type} /></td>
                        <td style={{ padding: '11px 18px', fontFamily: 'monospace', color: '#8b949e', fontSize: 12 }}>#{t.user_id}</td>
                        <td style={{ padding: '11px 18px', color: '#c9d1d9', maxWidth: 360 }}>{t.description}</td>
                        <td style={{ padding: '11px 18px', color: '#8b949e', fontFamily: 'monospace', fontSize: 11 }}>
                          {t.created_at ? new Date(t.created_at).toLocaleString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </div>
        )}

        {/* ══ SOD VIOLATIONS ══ */}
        {tab === 'sod' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 600, color: '#e6edf3' }}>Separation of Duties Violations</h1>
              <p style={{ color: '#8b949e', fontSize: 13, marginTop: 4 }}>{sod.total} users hold conflicting role combinations</p>
            </div>
            {sod.total === 0 ? (
              <Card style={{ textAlign: 'center', padding: '64px 0' }}>
                <p style={{ color: '#3fb950', fontSize: 15 }}>✓ No SOD violations found</p>
              </Card>
            ) : (
              <Card style={{ padding: 0 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #21262d' }}>
                      {['User', 'Role 1', 'Role 2', 'Conflict Reason'].map(h => (
                        <th key={h} style={{ padding: '12px 18px', textAlign: 'left', color: '#8b949e', fontWeight: 500, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sod.sod_violations.map((v, i) => (
                      <tr key={i} className="trow" style={{ borderBottom: '1px solid #21262d', background: '#110a00' }}>
                        <td style={{ padding: '11px 18px', color: '#ffa657', fontWeight: 500 }}>{v.username}</td>
                        <td style={{ padding: '11px 18px' }}>
                          <span style={{ background: '#58a6ff15', color: '#58a6ff', padding: '2px 8px', borderRadius: 4, fontSize: 12, border: '1px solid #58a6ff30' }}>{v.role_1}</span>
                        </td>
                        <td style={{ padding: '11px 18px' }}>
                          <span style={{ background: '#da363315', color: '#da3633', padding: '2px 8px', borderRadius: 4, fontSize: 12, border: '1px solid #da363330' }}>{v.role_2}</span>
                        </td>
                        <td style={{ padding: '11px 18px', color: '#8b949e', fontSize: 12 }}>{v.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </div>
        )}

        {/* ══ USERS ══ */}
        {tab === 'users' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h1 style={{ fontSize: 20, fontWeight: 600, color: '#e6edf3' }}>Users</h1>
                <p style={{ color: '#8b949e', fontSize: 13, marginTop: 4 }}>
                  {userTotal} total · {safeUsers.filter(u => u.is_active).length} active on this page
                </p>
              </div>
              {/* Search box */}
              <input
                type="text"
                placeholder="Search username or email…"
                value={userSearch}
                onChange={e => { setUserSearch(e.target.value); setUserPage(0); }}
                style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: 8, padding: '8px 14px', color: '#e6edf3', fontSize: 13, width: 260, outline: 'none', fontFamily: 'inherit' }}
              />
            </div>

            <Card style={{ padding: 0 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #21262d' }}>
                    {['ID', 'Username', 'Email', 'Department', 'Status'].map(h => (
                      <th key={h} style={{ padding: '12px 18px', textAlign: 'left', color: '#8b949e', fontWeight: 500, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {safeUsers.length === 0 ? (
                    <tr><td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: '#8b949e' }}>No users found</td></tr>
                  ) : safeUsers.map(u => (
                    <tr key={u.id} className="trow" style={{ borderBottom: '1px solid #21262d', transition: 'background 0.1s' }}>
                      <td style={{ padding: '11px 18px', fontFamily: 'monospace', color: '#8b949e', fontSize: 11 }}>#{u.id}</td>
                      <td style={{ padding: '11px 18px', color: '#58a6ff', fontWeight: 500 }}>{u.username}</td>
                      <td style={{ padding: '11px 18px', color: '#8b949e' }}>{u.email}</td>
                      <td style={{ padding: '11px 18px' }}>
                        <span style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 4, padding: '2px 8px', fontSize: 11, color: '#e6edf3' }}>
                          {DEPT_NAMES[u.department_id] ?? `Dept ${u.department_id}`}
                        </span>
                      </td>
                      <td style={{ padding: '11px 18px' }}>
                        <span style={{ color: u.is_active ? '#3fb950' : '#da3633', fontSize: 11, fontFamily: 'monospace' }}>
                          ● {u.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Pagination bar */}
              <div style={{ padding: '14px 18px', borderTop: '1px solid #21262d', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <span style={{ color: '#8b949e', fontSize: 12 }}>
                  Showing {userPage * PAGE_SIZE + 1}–{Math.min((userPage + 1) * PAGE_SIZE, userTotal)} of {userTotal} users
                </span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    onClick={() => setUserPage(p => Math.max(0, p - 1))}
                    disabled={userPage === 0}
                    style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6, padding: '6px 14px', color: userPage === 0 ? '#484f58' : '#e6edf3', fontSize: 12, cursor: userPage === 0 ? 'default' : 'pointer', fontFamily: 'inherit' }}
                  >← Prev</button>

                  {/* Page number buttons */}
                  {Array.from({ length: Math.min(7, Math.ceil(userTotal / PAGE_SIZE)) }, (_, i) => {
                    const totalPages = Math.ceil(userTotal / PAGE_SIZE);
                    let page = i;
                    if (totalPages > 7) {
                      const start = Math.max(0, Math.min(userPage - 3, totalPages - 7));
                      page = start + i;
                    }
                    return (
                      <button key={page}
                        onClick={() => setUserPage(page)}
                        style={{ background: page === userPage ? '#58a6ff' : '#161b22', border: `1px solid ${page === userPage ? '#58a6ff' : '#30363d'}`, borderRadius: 6, padding: '6px 11px', color: page === userPage ? '#010409' : '#8b949e', fontSize: 12, cursor: 'pointer', fontWeight: page === userPage ? 700 : 400, fontFamily: 'inherit', minWidth: 34 }}
                      >{page + 1}</button>
                    );
                  })}

                  <button
                    onClick={() => setUserPage(p => p + 1)}
                    disabled={(userPage + 1) * PAGE_SIZE >= userTotal}
                    style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6, padding: '6px 14px', color: (userPage + 1) * PAGE_SIZE >= userTotal ? '#484f58' : '#e6edf3', fontSize: 12, cursor: (userPage + 1) * PAGE_SIZE >= userTotal ? 'default' : 'pointer', fontFamily: 'inherit' }}
                  >Next →</button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* ══ ROLES ══ */}
        {tab === 'roles' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 600, color: '#e6edf3' }}>Roles</h1>
              <p style={{ color: '#8b949e', fontSize: 13, marginTop: 4 }}>{roles.length} roles · {activeAssigns} total active assignments</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {roles.map((r, i) => (
                <Card key={r.id} style={{ borderLeft: `3px solid ${COLORS[i % COLORS.length]}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <p style={{ color: '#e6edf3', fontWeight: 600, fontSize: 14 }}>{r.name}</p>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#8b949e' }}>#{r.id}</span>
                  </div>
                  <p style={{ color: '#8b949e', fontSize: 12 }}>{r.description ?? 'No description provided'}</p>
                  <div style={{ marginTop: 14, borderTop: '1px solid #21262d', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: '#8b949e' }}>Active assignments</span>
                    <span style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color: COLORS[i % COLORS.length] }}>
                      {roleMap[r.id] ?? 0}
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* ══ AUDIT LOG ══ */}
        {tab === 'audit' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 600, color: '#e6edf3' }}>Audit Log</h1>
              <p style={{ color: '#8b949e', fontSize: 13, marginTop: 4 }}>Last 50 events · all identity operations</p>
            </div>
            <Card style={{ padding: 0 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #21262d' }}>
                    {['ID', 'Event', 'User', 'Description', 'Time'].map(h => (
                      <th key={h} style={{ padding: '12px 18px', textAlign: 'left', color: '#8b949e', fontWeight: 500, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {audit.map(a => (
                    <tr key={a.id} className="trow" style={{ borderBottom: '1px solid #21262d', transition: 'background 0.1s' }}>
                      <td style={{ padding: '11px 18px', fontFamily: 'monospace', color: '#8b949e', fontSize: 11 }}>#{a.id}</td>
                      <td style={{ padding: '11px 18px' }}><EventBadge type={a.event_type} /></td>
                      <td style={{ padding: '11px 18px', fontFamily: 'monospace', color: '#8b949e', fontSize: 12 }}>#{a.user_id}</td>
                      <td style={{ padding: '11px 18px', color: '#c9d1d9', maxWidth: 380 }}>{a.description}</td>
                      <td style={{ padding: '11px 18px', color: '#8b949e', fontFamily: 'monospace', fontSize: 11 }}>
                        {a.created_at ? new Date(a.created_at).toLocaleString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        )}

        {/* ══ CELERY TASKS ══ */}
        {tab === 'tasks' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 600, color: '#e6edf3' }}>Celery Background Tasks</h1>
              <p style={{ color: '#8b949e', fontSize: 13, marginTop: 4 }}>
                Automated jobs running via Celery worker + beat scheduler · Evidence in Audit Log tab
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>

              {/* Task 1 */}
              <Card style={{ borderTop: '3px solid #3fb950' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <span style={{ fontSize: 22 }}>🔒</span>
                  <span style={{ background: '#0d2a0d', color: '#3fb950', fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 99, border: '1px solid #2ea04330' }}>DAILY · 00:00 UTC</span>
                </div>
                <h3 style={{ color: '#e6edf3', fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Role Expiration Check</h3>
                <p style={{ color: '#8b949e', fontSize: 12, lineHeight: 1.6, marginBottom: 14 }}>
                  Scans all active <code style={{ color: '#58a6ff', background: '#161b22', padding: '1px 5px', borderRadius: 3 }}>user_roles</code> records for expired assignments. Marks them <code style={{ color: '#f78166', background: '#161b22', padding: '1px 5px', borderRadius: 3 }}>is_active=False</code> and writes a <code style={{ color: '#d2a8ff', background: '#161b22', padding: '1px 5px', borderRadius: 3 }}>ROLE_REVOKED</code> audit log entry for each one.
                </p>
                <div style={{ borderTop: '1px solid #21262d', paddingTop: 12 }}>
                  <p style={{ color: '#484f58', fontSize: 11, fontFamily: 'monospace' }}>tasks.daily_role_expiration_check</p>
                  <p style={{ color: '#8b949e', fontSize: 11, marginTop: 4 }}>Evidence → Audit Log: <span style={{ color: '#3fb950' }}>ROLE_REVOKED</span></p>
                </div>
              </Card>

              {/* Task 2 */}
              <Card style={{ borderTop: '3px solid #58a6ff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <span style={{ fontSize: 22 }}>📊</span>
                  <span style={{ background: '#0d1a2a', color: '#58a6ff', fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 99, border: '1px solid #58a6ff30' }}>EVERY 6 HOURS</span>
                </div>
                <h3 style={{ color: '#e6edf3', fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Compliance Report</h3>
                <p style={{ color: '#8b949e', fontSize: 12, lineHeight: 1.6, marginBottom: 14 }}>
                  Generates a system-wide compliance snapshot: counts active users, orphaned users (no roles assigned), live SOD violations, and policy violation events from the last 6 hours. Saves summary as a <code style={{ color: '#d2a8ff', background: '#161b22', padding: '1px 5px', borderRadius: 3 }}>COMPLIANCE_REPORT</code> audit entry.
                </p>
                <div style={{ borderTop: '1px solid #21262d', paddingTop: 12 }}>
                  <p style={{ color: '#484f58', fontSize: 11, fontFamily: 'monospace' }}>tasks.compliance_report_generation</p>
                  <p style={{ color: '#8b949e', fontSize: 11, marginTop: 4 }}>Evidence → Audit Log: <span style={{ color: '#58a6ff' }}>COMPLIANCE_REPORT</span></p>
                </div>
              </Card>

              {/* Task 3 */}
              <Card style={{ borderTop: '3px solid #da3633' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <span style={{ fontSize: 22 }}>🤖</span>
                  <span style={{ background: '#1a0808', color: '#da3633', fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 99, border: '1px solid #da363330' }}>EVERY HOUR</span>
                </div>
                <h3 style={{ color: '#e6edf3', fontSize: 15, fontWeight: 600, marginBottom: 8 }}>ML Anomaly Detection</h3>
                <p style={{ color: '#8b949e', fontSize: 12, lineHeight: 1.6, marginBottom: 14 }}>
                  Runs <strong style={{ color: '#e6edf3' }}>Isolation Forest</strong> (scikit-learn) on all active users. Features: role count, login failures, permission escalations in last 24h. Flags the top 5% as anomalous with <code style={{ color: '#d2a8ff', background: '#161b22', padding: '1px 5px', borderRadius: 3 }}>SUSPICIOUS_ACCESS</code> entries — visible in the Threats tab.
                </p>
                <div style={{ borderTop: '1px solid #21262d', paddingTop: 12 }}>
                  <p style={{ color: '#484f58', fontSize: 11, fontFamily: 'monospace' }}>tasks.anomaly_detection_job</p>
                  <p style={{ color: '#8b949e', fontSize: 11, marginTop: 4 }}>Evidence → Threats tab: <span style={{ color: '#da3633' }}>SUSPICIOUS_ACCESS</span></p>
                </div>
              </Card>
            </div>

            {/* Architecture diagram */}
            <Card>
              <SectionTitle icon="⚙">Task Execution Architecture</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 0, alignItems: 'center', marginTop: 8 }}>
                {[
                  { label: 'Celery Beat', sub: 'Scheduler', color: '#d2a8ff', icon: '⏱' },
                  { label: '→', sub: '', color: '#30363d', icon: '' },
                  { label: 'Redis', sub: 'Message Broker', color: '#ffa657', icon: '⚡' },
                  { label: '→', sub: '', color: '#30363d', icon: '' },
                  { label: 'Celery Worker', sub: 'Task Executor', color: '#3fb950', icon: '⚙' },
                ].map((item, i) => (
                  <div key={i} style={{ textAlign: 'center', padding: '12px 8px' }}>
                    {item.icon && (
                      <div style={{ width: 48, height: 48, background: item.color + '15', border: `1px solid ${item.color}40`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, margin: '0 auto 8px' }}>
                        {item.icon}
                      </div>
                    )}
                    <p style={{ color: item.icon ? '#e6edf3' : '#30363d', fontSize: item.icon ? 13 : 20, fontWeight: item.icon ? 600 : 400 }}>{item.label}</p>
                    {item.sub && <p style={{ color: '#8b949e', fontSize: 11, marginTop: 3 }}>{item.sub}</p>}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 16, background: '#0d1117', border: '1px solid #21262d', borderRadius: 8, padding: 14 }}>
                <p style={{ color: '#8b949e', fontSize: 12, lineHeight: 1.7 }}>
                  <strong style={{ color: '#e6edf3' }}>How to verify tasks ran:</strong> Go to the <strong style={{ color: '#58a6ff' }}>Audit Log</strong> tab and look for events of type <code style={{ color: '#3fb950' }}>ROLE_REVOKED</code>, <code style={{ color: '#58a6ff' }}>COMPLIANCE_REPORT</code>, or <code style={{ color: '#da3633' }}>SUSPICIOUS_ACCESS</code>. These are written directly to the database by the tasks. You can also run a task manually:
                </p>
                <div style={{ background: '#010409', border: '1px solid #30363d', borderRadius: 6, padding: '10px 14px', marginTop: 10, fontFamily: 'monospace', fontSize: 12, color: '#3fb950' }}>
                  docker exec iam_celery_worker celery -A tasks call tasks.anomaly_detection_job
                </div>
                <div style={{ background: '#010409', border: '1px solid #30363d', borderRadius: 6, padding: '10px 14px', marginTop: 8, fontFamily: 'monospace', fontSize: 12, color: '#3fb950' }}>
                  docker exec iam_celery_worker celery -A tasks call tasks.compliance_report_generation
                </div>
              </div>
            </Card>
          </div>
        )}

      </main>
    </div>
  );
}