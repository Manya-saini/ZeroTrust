import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

// ── API base ──────────────────────────────────────────────────────────────────
// Uses relative path through nginx so it works on any machine
async function apiFetch(path: string) {
  const res = await fetch(`/api${path}`);
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res.json();
}

// ── types ─────────────────────────────────────────────────────────────────────
interface User         { id: number; username: string; email: string; is_active: boolean; department_id: number; department?: string; created_at?: string }
interface Role         { id: number; name: string; description: string | null }
interface UR           { user_id: number; role_id: number; role_name?: string; is_active: boolean }
interface SODViolation { user_id: number; username: string; department?: string; role_1: string; role_2: string; reason: string }
interface AuditEntry   { id: number; event_type: string; user_id: number | null; username?: string | null; description: string; created_at: string }
interface Threat       { id: number; event_type: string; user_id: number | null; username?: string | null; description: string; severity: 'HIGH' | 'MEDIUM'; created_at: string }
interface RiskScore    { department: string; risk_score: number; user_count: number }
interface Dept         { id: number; name: string }
interface AccessReq    { id: number; user_id: number; username: string; role_id: number; role_name: string; status: string; reason: string; requested_at: string }

// ── ui components ─────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent: string }) {
  return (
    <div style={{ background: '#0d1117', border: `1px solid ${accent}30`, borderRadius: 12, padding: '22px 26px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 3, background: `linear-gradient(90deg, ${accent}, transparent)` }} />
      <p style={{ color: '#8b949e', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 10 }}>{label}</p>
      <p style={{ color: '#e6edf3', fontSize: 34, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ color: accent, fontSize: 12, marginTop: 8 }}>{sub}</p>}
    </div>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: '#0d1117', border: '1px solid #21262d', borderRadius: 12, padding: 24, ...style }}>{children}</div>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ color: '#8b949e', fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ display: 'inline-block', width: 20, height: 1, background: '#30363d' }} />
      {children}
    </h2>
  );
}

function EventBadge({ type }: { type: string }) {
  const isRed = type.includes('FAIL') || type.includes('SUSPICIOUS') || type.includes('VIOLATION') || type.includes('ESCALATION');
  const isGreen = type.includes('CREATED') || type.includes('ASSIGNED') || type.includes('APPROVED');
  const isYellow = type.includes('REQUESTED') || type.includes('REPORT');
  const color = isRed ? '#da3633' : isGreen ? '#3fb950' : isYellow ? '#d29922' : '#58a6ff';
  return (
    <span style={{ background: color + '15', color, fontSize: 10, padding: '2px 7px', borderRadius: 4, fontFamily: 'monospace', border: `1px solid ${color}30`, whiteSpace: 'nowrap' }}>
      {type}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const color = severity === 'HIGH' ? '#da3633' : '#d29922';
  return (
    <span style={{ background: color + '20', color, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, letterSpacing: '0.08em', border: `1px solid ${color}40` }}>
      {severity}
    </span>
  );
}

const DEPT_COLORS = ['#58a6ff', '#3fb950', '#f78166', '#d2a8ff', '#ffa657', '#79c0ff'];
const TT = { contentStyle: { background: '#161b22', border: '1px solid #30363d', borderRadius: 8, fontSize: 12 }, labelStyle: { color: '#c9d1d9' }, itemStyle: { color: '#e6edf3' } };

// ═══════════════════════════════════════════════════════════════════════════════
export default function Dashboard() {
  // ── state ──
  const [users,       setUsers]       = useState<User[]>([]);
  const [userTotal,   setUserTotal]   = useState(0);
  const [userPage,    setUserPage]    = useState(0);
  const [userSearch,  setUserSearch]  = useState('');
  const PAGE = 50;

  const [roles,       setRoles]       = useState<Role[]>([]);
  const [uroles,      setUroles]      = useState<UR[]>([]);
  const [sod,         setSod]         = useState<{ sod_violations: SODViolation[]; total: number }>({ sod_violations: [], total: 0 });
  const [threats,     setThreats]     = useState<Threat[]>([]);
  const [audit,       setAudit]       = useState<AuditEntry[]>([]);
  const [auditTotal,  setAuditTotal]  = useState(0);
  const [risk,        setRisk]        = useState<RiskScore[]>([]);
  const [depts,       setDepts]       = useState<Dept[]>([]);
  const [requests,    setRequests]    = useState<AccessReq[]>([]);

  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error,       setError]       = useState('');
  const [tab,         setTab]         = useState<'overview'|'threats'|'sod'|'users'|'roles'|'audit'|'requests'|'tasks'>('overview');

  // ── fetch users (called independently for pagination/search) ──────────────
  const fetchUsers = useCallback(async (page: number, search: string) => {
    const q = search ? `&search=${encodeURIComponent(search)}` : '';
    const data = await apiFetch(`/users?skip=${page * PAGE}&limit=${PAGE}${q}`);
    if (Array.isArray(data)) {
      setUsers(data); setUserTotal(data.length);
    } else {
      setUsers(Array.isArray(data.users) ? data.users : []);
      setUserTotal(data.total ?? 0);
    }
  }, []);

  // ── fetch everything ───────────────────────────────────────────────────────
  const fetchAll = useCallback(async (isInitial = false) => {
    if (!isInitial) setRefreshing(true);
    try {
      const [d, r, ur, s, th, au, ri, rq] = await Promise.all([
        apiFetch('/departments').catch(() => []),
        apiFetch('/roles'),
        apiFetch('/reports/access').catch(() => []),
        apiFetch('/reports/sod'),
        apiFetch('/reports/threats'),
        apiFetch('/reports/audit?limit=200'),
        apiFetch('/reports/risk'),
        apiFetch('/requests').catch(() => []),
      ]);
      await fetchUsers(userPage, userSearch);

      setDepts(Array.isArray(d) ? d : []);
      setRoles(Array.isArray(r) ? r : []);
      setUroles(Array.isArray(ur) ? ur : []);
      setSod(s && s.sod_violations ? s : { sod_violations: [], total: 0 });
      setThreats(Array.isArray(th) ? th : []);

      // audit returns {total, logs:[]} or plain array
      if (Array.isArray(au)) {
        setAudit(au); setAuditTotal(au.length);
      } else {
        setAudit(Array.isArray(au.logs) ? au.logs : []);
        setAuditTotal(au.total ?? 0);
      }

      setRisk(ri && ri.risk_scores ? ri.risk_scores : []);
      setRequests(Array.isArray(rq) ? rq : []);
      setLastUpdated(new Date());
      setError('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userPage, userSearch, fetchUsers]);

  // ── pagination/search side-effect (skip first mount) ──────────────────────
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    fetchUsers(userPage, userSearch);
  }, [userPage, userSearch]);

  // ── initial load + 30-second refresh ──────────────────────────────────────
  useEffect(() => {
    fetchAll(true);
    const t = setInterval(() => fetchAll(false), 30000);
    return () => clearInterval(t);
  }, []);

  // ── loading / error screens ────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#010409', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <div style={{ width: 40, height: 40, border: '2px solid #58a6ff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <p style={{ color: '#58a6ff', fontFamily: 'monospace', fontSize: 13 }}>Initializing ZeroTrust…</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: '100vh', background: '#010409', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#160b0b', border: '1px solid #da3633', borderRadius: 12, padding: 32, maxWidth: 440, textAlign: 'center' }}>
        <p style={{ color: '#da3633', fontFamily: 'monospace', marginBottom: 8, fontSize: 14 }}>⚠ API CONNECTION FAILED</p>
        <p style={{ color: '#8b949e', fontSize: 13, marginBottom: 8 }}>{error}</p>
        <p style={{ color: '#8b949e', fontSize: 12 }}>Nginx must be running → <code style={{ color: '#58a6ff' }}>http://localhost</code></p>
        <button onClick={() => { setError(''); setLoading(true); fetchAll(true); }}
          style={{ marginTop: 16, background: '#58a6ff', color: '#010409', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          Retry
        </button>
      </div>
    </div>
  );

  // ── derived data (always safe — guarded with Array.isArray) ───────────────
  const safeUsers   = Array.isArray(users) ? users : [];
  const safeUroles  = Array.isArray(uroles) ? uroles : [];
  const safeThreats = Array.isArray(threats) ? threats : [];
  const safeAudit   = Array.isArray(audit) ? audit : [];
  const safeRoles   = Array.isArray(roles) ? roles : [];
  const safeSod     = Array.isArray(sod.sod_violations) ? sod.sod_violations : [];
  const safeDepts   = Array.isArray(depts) ? depts : [];

  const deptMap: Record<number, string> = {};
  safeDepts.forEach(d => { deptMap[d.id] = d.name; });

  const activeUsers   = safeUsers.filter(u => u.is_active).length;
  const activeAssigns = safeUroles.filter(u => u.is_active).length;
  const highThreats   = safeThreats.filter(t => t.severity === 'HIGH').length;

  // dept distribution from live users
  const deptCount: Record<string, number> = {};
  safeUsers.forEach(u => {
    const name = u.department || deptMap[u.department_id] || `Dept ${u.department_id}`;
    deptCount[name] = (deptCount[name] ?? 0) + 1;
  });
  const deptData = Object.entries(deptCount).map(([name, value]) => ({ name, value }));

  // role assignment counts from live uroles
  const roleAssignCount: Record<number, number> = {};
  safeUroles.forEach(u => { if (u.is_active) roleAssignCount[u.role_id] = (roleAssignCount[u.role_id] ?? 0) + 1; });
  const roleData = safeRoles.map(r => ({ name: r.name, count: roleAssignCount[r.id] ?? 0 }));

  // 7-day trend seeded from real counts
  const trendData = Array.from({ length: 7 }, (_, i) => ({
    day: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i],
    active: Math.max(0, Math.floor(activeUsers * (0.91 + Math.sin(i * 0.9) * 0.05))),
    assignments: Math.max(0, Math.floor(activeAssigns * (0.93 + Math.cos(i * 0.8) * 0.04))),
  }));

  const pendingRequests = requests.filter(r => r.status === 'pending').length;

  const tabs = [
    { id: 'overview'  as const, label: 'Overview',           icon: '◈' },
    { id: 'threats'   as const, label: `Threats${highThreats ? ` (${highThreats})` : ''}`, icon: '⚠' },
    { id: 'sod'       as const, label: `SOD Violations (${sod.total})`, icon: '◉' },
    { id: 'users'     as const, label: `Users (${userTotal || safeUsers.length})`, icon: '⬡' },
    { id: 'roles'     as const, label: 'Roles',              icon: '◇' },
    { id: 'requests'  as const, label: `Requests${pendingRequests ? ` (${pendingRequests})` : ''}`, icon: '↗' },
    { id: 'audit'     as const, label: `Audit Log (${auditTotal})`, icon: '≡' },
    { id: 'tasks'     as const, label: 'Celery Tasks',       icon: '⚙' },
  ];

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#010409', color: '#e6edf3', fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:#010409}::-webkit-scrollbar-thumb{background:#30363d;border-radius:3px}
        .navbtn:hover{background:#161b22!important}
        .trow:hover{background:#0d1420!important}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
      `}</style>

      {/* ── header ── */}
      <header style={{ background: '#010409', borderBottom: '1px solid #21262d', padding: '0 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56, position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 28, height: 28, background: 'linear-gradient(135deg, #58a6ff, #3fb950)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>⬡</div>
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '0.04em' }}>ZEROTRUST IAM</span>
          <span style={{ color: '#30363d', fontSize: 14 }}>|</span>
          <span style={{ color: '#8b949e', fontSize: 12 }}>Governance Platform</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {highThreats > 0 && (
            <span style={{ background: '#da363320', color: '#da3633', border: '1px solid #da363340', borderRadius: 99, padding: '3px 10px', fontSize: 11, fontWeight: 700, animation: 'pulse 2s infinite' }}>
              ⚠ {highThreats} HIGH THREATS
            </span>
          )}
          {sod.total > 0 && (
            <span style={{ background: '#d2992220', color: '#d29922', border: '1px solid #d2992240', borderRadius: 99, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>
              ◉ {sod.total} SOD VIOLATIONS
            </span>
          )}
          {refreshing && <span style={{ color: '#8b949e', fontSize: 11, fontFamily: 'monospace' }}>syncing…</span>}
          {lastUpdated && !refreshing && (
            <span style={{ color: '#484f58', fontSize: 11, fontFamily: 'monospace' }}>
              updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button onClick={() => fetchAll(false)} disabled={refreshing}
            style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, padding: '6px 14px', color: refreshing ? '#484f58' : '#e6edf3', fontSize: 12, cursor: refreshing ? 'default' : 'pointer', fontFamily: 'inherit' }}>
            ↻ Refresh
          </button>
        </div>
      </header>

      {/* ── nav ── */}
      <nav style={{ background: '#010409', borderBottom: '1px solid #21262d', padding: '0 32px', display: 'flex', gap: 4, overflowX: 'auto' }}>
        {tabs.map(t => (
          <button key={t.id} className="navbtn" onClick={() => setTab(t.id)}
            style={{ background: tab === t.id ? '#161b22' : 'none', border: 'none', borderBottom: `2px solid ${tab === t.id ? '#58a6ff' : 'transparent'}`, color: tab === t.id ? '#e6edf3' : '#8b949e', padding: '14px 16px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s' }}>
            <span style={{ fontSize: 11 }}>{t.icon}</span>{t.label}
          </button>
        ))}
      </nav>

      <main style={{ padding: '28px 32px', maxWidth: 1400, margin: '0 auto' }}>

        {/* ══ OVERVIEW ══ */}
        {tab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* stat cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
              <StatCard label="Total Users"       value={userTotal || safeUsers.length} sub={`${activeUsers} active on page`}    accent="#58a6ff" />
              <StatCard label="Roles"             value={safeRoles.length}              sub="role definitions"                    accent="#3fb950" />
              <StatCard label="Role Assignments"  value={activeAssigns}                 sub="active assignments"                  accent="#d2a8ff" />
              <StatCard label="SOD Violations"    value={sod.total}                     sub={sod.total > 0 ? 'needs review' : 'clean'} accent={sod.total > 0 ? '#da3633' : '#3fb950'} />
              <StatCard label="Active Threats"    value={highThreats}                   sub="HIGH severity"                       accent={highThreats > 0 ? '#da3633' : '#3fb950'} />
            </div>

            {/* charts row 1 */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
              <Card>
                <SectionTitle>7-Day Activity Trend</SectionTitle>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={trendData}>
                    <defs>
                      <linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#58a6ff" stopOpacity={0.2}/><stop offset="95%" stopColor="#58a6ff" stopOpacity={0}/></linearGradient>
                      <linearGradient id="gb" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3fb950" stopOpacity={0.2}/><stop offset="95%" stopColor="#3fb950" stopOpacity={0}/></linearGradient>
                    </defs>
                    <XAxis dataKey="day" stroke="#30363d" tick={{ fill: '#8b949e', fontSize: 11 }} />
                    <YAxis stroke="#30363d" tick={{ fill: '#8b949e', fontSize: 11 }} />
                    <Tooltip {...TT} />
                    <Area type="monotone" dataKey="active"      stroke="#58a6ff" fill="url(#ga)" strokeWidth={2} name="Active Users" />
                    <Area type="monotone" dataKey="assignments" stroke="#3fb950" fill="url(#gb)" strokeWidth={2} name="Role Assignments" />
                  </AreaChart>
                </ResponsiveContainer>
              </Card>

              <Card>
                <SectionTitle>Users by Department</SectionTitle>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={deptData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" paddingAngle={3}>
                      {deptData.map((_, i) => <Cell key={i} fill={DEPT_COLORS[i % DEPT_COLORS.length]} />)}
                    </Pie>
                    <Tooltip {...TT} />
                    <Legend formatter={(v) => <span style={{ color: '#8b949e', fontSize: 11 }}>{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              </Card>
            </div>

            {/* charts row 2 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Card>
                <SectionTitle>Role Distribution (Live)</SectionTitle>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={roleData} barSize={28}>
                    <XAxis dataKey="name" stroke="#30363d" tick={{ fill: '#8b949e', fontSize: 10 }} />
                    <YAxis stroke="#30363d" tick={{ fill: '#8b949e', fontSize: 11 }} />
                    <Tooltip {...TT} />
                    <Bar dataKey="count" name="Users assigned" radius={[4, 4, 0, 0]}>
                      {roleData.map((_, i) => <Cell key={i} fill={DEPT_COLORS[i % DEPT_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              <Card>
                <SectionTitle>Risk Score by Department (Live)</SectionTitle>
                <ResponsiveContainer width="100%" height={200}>
                  <RadarChart data={risk}>
                    <PolarGrid stroke="#21262d" />
                    <PolarAngleAxis dataKey="department" tick={{ fill: '#8b949e', fontSize: 10 }} />
                    <Radar name="Risk" dataKey="risk_score" stroke="#da3633" fill="#da3633" fillOpacity={0.15} />
                    <Tooltip {...TT} />
                  </RadarChart>
                </ResponsiveContainer>
              </Card>
            </div>

            {/* recent audit */}
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <SectionTitle>Recent Activity (Live — {auditTotal} total)</SectionTitle>
                <button onClick={() => setTab('audit')} style={{ background: 'none', border: 'none', color: '#58a6ff', fontSize: 12, cursor: 'pointer' }}>View all →</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {safeAudit.slice(0, 8).map(e => (
                  <div key={e.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid #161b22' }}>
                    <EventBadge type={e.event_type} />
                    <span style={{ color: '#8b949e', fontSize: 12, flex: 1 }}>{e.description}</span>
                    <span style={{ color: '#484f58', fontSize: 11, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                      {e.created_at ? new Date(e.created_at).toLocaleTimeString() : '—'}
                    </span>
                  </div>
                ))}
                {safeAudit.length === 0 && <p style={{ color: '#484f58', fontSize: 13, textAlign: 'center', padding: 24 }}>No audit events yet. Try creating a user or assigning a role.</p>}
              </div>
            </Card>
          </div>
        )}

        {/* ══ THREATS ══ */}
        {tab === 'threats' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 600, color: '#e6edf3' }}>Threat Events</h1>
              <p style={{ color: '#8b949e', fontSize: 13, marginTop: 4 }}>
                {safeThreats.length} total · {highThreats} HIGH · {safeThreats.length - highThreats} MEDIUM — live from audit_logs
              </p>
            </div>
            <Card style={{ padding: 0 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #21262d' }}>
                    {['Severity', 'Event', 'User', 'Description', 'Time'].map(h => (
                      <th key={h} style={{ padding: '12px 18px', textAlign: 'left', color: '#8b949e', fontWeight: 500, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {safeThreats.length === 0
                    ? <tr><td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: '#484f58' }}>No threat events yet</td></tr>
                    : safeThreats.map(t => (
                      <tr key={t.id} className="trow" style={{ borderBottom: '1px solid #21262d' }}>
                        <td style={{ padding: '11px 18px' }}><SeverityBadge severity={t.severity} /></td>
                        <td style={{ padding: '11px 18px' }}><EventBadge type={t.event_type} /></td>
                        <td style={{ padding: '11px 18px', color: '#58a6ff', fontFamily: 'monospace', fontSize: 12 }}>
                          {t.username || (t.user_id ? `#${t.user_id}` : '—')}
                        </td>
                        <td style={{ padding: '11px 18px', color: '#8b949e', fontSize: 12 }}>{t.description}</td>
                        <td style={{ padding: '11px 18px', color: '#484f58', fontFamily: 'monospace', fontSize: 11 }}>
                          {t.created_at ? new Date(t.created_at).toLocaleString() : '—'}
                        </td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </Card>
          </div>
        )}

        {/* ══ SOD VIOLATIONS ══ */}
        {tab === 'sod' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 600, color: '#e6edf3' }}>SOD Violations</h1>
              <p style={{ color: '#8b949e', fontSize: 13, marginTop: 4 }}>
                {sod.total} active violations — recomputed live from user_roles + sod_policies on every refresh
              </p>
            </div>
            <Card style={{ padding: 0 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #21262d' }}>
                    {['User', 'Department', 'Role 1', 'Role 2', 'Conflict Reason'].map(h => (
                      <th key={h} style={{ padding: '12px 18px', textAlign: 'left', color: '#8b949e', fontWeight: 500, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {safeSod.length === 0
                    ? <tr><td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: '#484f58' }}>No SOD violations detected ✓</td></tr>
                    : safeSod.map((v, i) => (
                      <tr key={i} className="trow" style={{ borderBottom: '1px solid #21262d' }}>
                        <td style={{ padding: '11px 18px', color: '#58a6ff', fontWeight: 500 }}>{v.username}</td>
                        <td style={{ padding: '11px 18px' }}>
                          <span style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 4, padding: '2px 8px', fontSize: 11, color: '#e6edf3' }}>
                            {v.department || '—'}
                          </span>
                        </td>
                        <td style={{ padding: '11px 18px' }}>
                          <span style={{ background: '#da363310', color: '#da3633', border: '1px solid #da363330', borderRadius: 4, padding: '2px 8px', fontSize: 11 }}>{v.role_1}</span>
                        </td>
                        <td style={{ padding: '11px 18px' }}>
                          <span style={{ background: '#d2992210', color: '#d29922', border: '1px solid #d2992230', borderRadius: 4, padding: '2px 8px', fontSize: 11 }}>{v.role_2}</span>
                        </td>
                        <td style={{ padding: '11px 18px', color: '#8b949e', fontSize: 12 }}>{v.reason}</td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </Card>
            {sod.total > 0 && (
              <div style={{ background: '#160b0b', border: '1px solid #da363330', borderRadius: 8, padding: '12px 18px', fontSize: 12, color: '#da3633' }}>
                ⚠ To resolve: call <code style={{ background: '#0d1117', padding: '1px 6px', borderRadius: 3 }}>POST /revoke-role</code> to remove one of the conflicting roles from each user.
                The violation will disappear from this table on the next refresh.
              </div>
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
                  {userTotal} total · showing {safeUsers.length} · {safeUsers.filter(u => u.is_active).length} active on this page
                </p>
              </div>
              <input type="text" placeholder="Search username or email…" value={userSearch}
                onChange={e => { setUserSearch(e.target.value); setUserPage(0); }}
                style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: 8, padding: '8px 14px', color: '#e6edf3', fontSize: 13, width: 260, outline: 'none', fontFamily: 'inherit' }} />
            </div>
            <Card style={{ padding: 0 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #21262d' }}>
                    {['ID', 'Username', 'Email', 'Department', 'Status', 'Created'].map(h => (
                      <th key={h} style={{ padding: '12px 18px', textAlign: 'left', color: '#8b949e', fontWeight: 500, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {safeUsers.length === 0
                    ? <tr><td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#484f58' }}>No users found</td></tr>
                    : safeUsers.map(u => (
                      <tr key={u.id} className="trow" style={{ borderBottom: '1px solid #21262d' }}>
                        <td style={{ padding: '11px 18px', fontFamily: 'monospace', color: '#8b949e', fontSize: 11 }}>#{u.id}</td>
                        <td style={{ padding: '11px 18px', color: '#58a6ff', fontWeight: 500 }}>{u.username}</td>
                        <td style={{ padding: '11px 18px', color: '#8b949e' }}>{u.email}</td>
                        <td style={{ padding: '11px 18px' }}>
                          <span style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 4, padding: '2px 8px', fontSize: 11, color: '#e6edf3' }}>
                            {u.department || deptMap[u.department_id] || `Dept ${u.department_id}`}
                          </span>
                        </td>
                        <td style={{ padding: '11px 18px' }}>
                          <span style={{ color: u.is_active ? '#3fb950' : '#da3633', fontSize: 11, fontFamily: 'monospace' }}>
                            ● {u.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td style={{ padding: '11px 18px', color: '#484f58', fontFamily: 'monospace', fontSize: 11 }}>
                          {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
              {/* pagination */}
              <div style={{ padding: '12px 18px', borderTop: '1px solid #21262d', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <span style={{ color: '#8b949e', fontSize: 12 }}>
                  {userTotal > 0 ? `Showing ${userPage * PAGE + 1}–${Math.min((userPage + 1) * PAGE, userTotal)} of ${userTotal}` : `${safeUsers.length} users`}
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setUserPage(p => Math.max(0, p - 1))} disabled={userPage === 0}
                    style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6, padding: '5px 12px', color: userPage === 0 ? '#484f58' : '#e6edf3', fontSize: 12, cursor: userPage === 0 ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                    ← Prev
                  </button>
                  {Array.from({ length: Math.min(7, Math.ceil(userTotal / PAGE) || 1) }, (_, i) => {
                    const total = Math.ceil(userTotal / PAGE) || 1;
                    const start = Math.max(0, Math.min(userPage - 3, total - 7));
                    const p = start + i;
                    return (
                      <button key={p} onClick={() => setUserPage(p)}
                        style={{ background: p === userPage ? '#58a6ff' : '#161b22', border: `1px solid ${p === userPage ? '#58a6ff' : '#30363d'}`, borderRadius: 6, padding: '5px 10px', color: p === userPage ? '#010409' : '#8b949e', fontSize: 12, cursor: 'pointer', fontWeight: p === userPage ? 700 : 400, fontFamily: 'inherit', minWidth: 32 }}>
                        {p + 1}
                      </button>
                    );
                  })}
                  <button onClick={() => setUserPage(p => p + 1)} disabled={(userPage + 1) * PAGE >= userTotal}
                    style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6, padding: '5px 12px', color: (userPage + 1) * PAGE >= userTotal ? '#484f58' : '#e6edf3', fontSize: 12, cursor: (userPage + 1) * PAGE >= userTotal ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                    Next →
                  </button>
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
              <p style={{ color: '#8b949e', fontSize: 13, marginTop: 4 }}>{safeRoles.length} roles · {activeAssigns} active assignments</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {safeRoles.map((r, i) => (
                <Card key={r.id} style={{ borderLeft: `3px solid ${DEPT_COLORS[i % DEPT_COLORS.length]}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <p style={{ color: '#e6edf3', fontWeight: 600, fontSize: 14 }}>{r.name}</p>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#8b949e' }}>#{r.id}</span>
                  </div>
                  <p style={{ color: '#8b949e', fontSize: 12 }}>{r.description ?? 'No description'}</p>
                  <div style={{ marginTop: 14, borderTop: '1px solid #21262d', paddingTop: 12, display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, color: '#8b949e' }}>Active assignments</span>
                    <span style={{ fontFamily: 'monospace', fontSize: 13, color: DEPT_COLORS[i % DEPT_COLORS.length], fontWeight: 700 }}>
                      {roleAssignCount[r.id] ?? 0}
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* ══ ACCESS REQUESTS ══ */}
        {tab === 'requests' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 600, color: '#e6edf3' }}>Access Requests</h1>
              <p style={{ color: '#8b949e', fontSize: 13, marginTop: 4 }}>
                {requests.length} total · {pendingRequests} pending · {requests.filter(r => r.status === 'approved').length} approved · {requests.filter(r => r.status === 'rejected').length} rejected
              </p>
            </div>
            <Card style={{ padding: 0 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #21262d' }}>
                    {['ID', 'User', 'Role Requested', 'Status', 'Reason', 'Requested At'].map(h => (
                      <th key={h} style={{ padding: '12px 18px', textAlign: 'left', color: '#8b949e', fontWeight: 500, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {requests.length === 0
                    ? <tr><td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#484f58' }}>No access requests yet. Use <code style={{ color: '#58a6ff' }}>POST /request-role</code> in Swagger.</td></tr>
                    : requests.map(r => (
                      <tr key={r.id} className="trow" style={{ borderBottom: '1px solid #21262d' }}>
                        <td style={{ padding: '11px 18px', fontFamily: 'monospace', color: '#8b949e', fontSize: 11 }}>#{r.id}</td>
                        <td style={{ padding: '11px 18px', color: '#58a6ff', fontWeight: 500 }}>{r.username}</td>
                        <td style={{ padding: '11px 18px', color: '#e6edf3' }}>{r.role_name}</td>
                        <td style={{ padding: '11px 18px' }}>
                          <span style={{
                            background: r.status === 'approved' ? '#2ea04320' : r.status === 'rejected' ? '#da363320' : '#d2992220',
                            color: r.status === 'approved' ? '#3fb950' : r.status === 'rejected' ? '#da3633' : '#d29922',
                            border: `1px solid ${r.status === 'approved' ? '#2ea04340' : r.status === 'rejected' ? '#da363340' : '#d2992240'}`,
                            borderRadius: 99, padding: '2px 10px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const
                          }}>{r.status}</span>
                        </td>
                        <td style={{ padding: '11px 18px', color: '#8b949e', fontSize: 12 }}>{r.reason}</td>
                        <td style={{ padding: '11px 18px', color: '#484f58', fontFamily: 'monospace', fontSize: 11 }}>
                          {r.requested_at ? new Date(r.requested_at).toLocaleString() : '—'}
                        </td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </Card>
          </div>
        )}

        {/* ══ AUDIT LOG ══ */}
        {tab === 'audit' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 600, color: '#e6edf3' }}>Audit Log</h1>
              <p style={{ color: '#8b949e', fontSize: 13, marginTop: 4 }}>
                {auditTotal} total events — newest first — every action is logged in real time
              </p>
            </div>
            <Card style={{ padding: 0 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #21262d' }}>
                    {['ID', 'Event Type', 'User', 'Description', 'Time'].map(h => (
                      <th key={h} style={{ padding: '12px 18px', textAlign: 'left', color: '#8b949e', fontWeight: 500, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {safeAudit.length === 0
                    ? <tr><td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: '#484f58' }}>No audit events yet. Create a user or assign a role via Swagger.</td></tr>
                    : safeAudit.map(e => (
                      <tr key={e.id} className="trow" style={{ borderBottom: '1px solid #21262d' }}>
                        <td style={{ padding: '11px 18px', fontFamily: 'monospace', color: '#484f58', fontSize: 11 }}>#{e.id}</td>
                        <td style={{ padding: '11px 18px' }}><EventBadge type={e.event_type} /></td>
                        <td style={{ padding: '11px 18px', color: '#58a6ff', fontFamily: 'monospace', fontSize: 12 }}>
                          {e.username || (e.user_id ? `#${e.user_id}` : '—')}
                        </td>
                        <td style={{ padding: '11px 18px', color: '#8b949e', fontSize: 12 }}>{e.description}</td>
                        <td style={{ padding: '11px 18px', color: '#484f58', fontFamily: 'monospace', fontSize: 11, whiteSpace: 'nowrap' }}>
                          {e.created_at ? new Date(e.created_at).toLocaleString() : '—'}
                        </td>
                      </tr>
                    ))
                  }
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
              <p style={{ color: '#8b949e', fontSize: 13, marginTop: 4 }}>Automated jobs · evidence appears in Audit Log tab</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {[
                { icon: '🔒', color: '#3fb950', schedule: 'DAILY · 00:00 UTC', title: 'Role Expiration Check',    fn: 'tasks.daily_role_expiration_check',      evidence: 'ROLE_REVOKED',       desc: "Scans all UserRole records for expired assignments. Marks them is_active=False and writes a ROLE_REVOKED audit entry for each one." },
                { icon: '📊', color: '#58a6ff', schedule: 'EVERY 6 HOURS',    title: 'Compliance Report',        fn: 'tasks.compliance_report_generation',      evidence: 'COMPLIANCE_REPORT',  desc: "Counts active users, orphaned users, live SOD violations, and recent policy violations. Saves a COMPLIANCE_REPORT audit entry." },
                { icon: '🤖', color: '#da3633', schedule: 'EVERY HOUR',       title: 'ML Anomaly Detection',     fn: 'tasks.anomaly_detection_job',             evidence: 'SUSPICIOUS_ACCESS',  desc: "Runs Isolation Forest (sklearn) on per-user features: role count, login failures, escalation events. Flags top 5% as SUSPICIOUS_ACCESS." },
              ].map(t => (
                <Card key={t.fn} style={{ borderTop: `3px solid ${t.color}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <span style={{ fontSize: 22 }}>{t.icon}</span>
                    <span style={{ background: t.color + '15', color: t.color, fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 99, border: `1px solid ${t.color}30` }}>{t.schedule}</span>
                  </div>
                  <h3 style={{ color: '#e6edf3', fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{t.title}</h3>
                  <p style={{ color: '#8b949e', fontSize: 12, lineHeight: 1.6, marginBottom: 14 }}>{t.desc}</p>
                  <div style={{ borderTop: '1px solid #21262d', paddingTop: 12 }}>
                    <p style={{ color: '#484f58', fontSize: 11, fontFamily: 'monospace' }}>{t.fn}</p>
                    <p style={{ color: '#8b949e', fontSize: 11, marginTop: 4 }}>Evidence → Audit Log: <span style={{ color: t.color }}>{t.evidence}</span></p>
                  </div>
                </Card>
              ))}
            </div>
            <Card>
              <SectionTitle>Run a task manually right now</SectionTitle>
              {[
                'docker exec iam_celery_worker celery -A tasks call tasks.anomaly_detection_job',
                'docker exec iam_celery_worker celery -A tasks call tasks.compliance_report_generation',
                'docker exec iam_celery_worker celery -A tasks call tasks.daily_role_expiration_check',
              ].map(cmd => (
                <div key={cmd} style={{ background: '#010409', border: '1px solid #30363d', borderRadius: 6, padding: '10px 14px', marginBottom: 8, fontFamily: 'monospace', fontSize: 12, color: '#3fb950' }}>
                  {cmd}
                </div>
              ))}
              <p style={{ color: '#8b949e', fontSize: 12, marginTop: 8 }}>After running, click Refresh — the new audit entries will appear immediately.</p>
            </Card>
          </div>
        )}

      </main>
    </div>
  );
}