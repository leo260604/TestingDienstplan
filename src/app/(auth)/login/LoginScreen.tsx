'use client';
import { useMemo, useState, useTransition, type CSSProperties } from 'react';
import { loginDemo, loginMicrosoft, loginPassword } from '@/server/actions/auth';
import { initials } from '@/lib/demo-data';

interface LoginUser {
  id: string;
  name: string;
  email: string;
  role: string;
  photo: string;
  team: string;
  color: string;
}

const Ic = ({ name, className = '' }: { name: string; className?: string }) => (
  <svg className={`ic ${className}`} aria-hidden="true">
    <use href={`#i-${name}`} />
  </svg>
);
const Av = ({ u, size }: { u: LoginUser; size: number }) => (
  <span className="av" style={{ '--c': u.color, width: size, height: size, fontSize: Math.round(size * 0.36) } as CSSProperties}>
    {u.photo ? <img src={u.photo} alt="" /> : initials(u.name)}
  </span>
);

export function LoginScreen({ demo, sso, error, stats, heroDuty, heroStandby, users }: { demo: boolean; sso: boolean; error: string; stats: string; heroDuty: { title: string; sub: string } | null; heroStandby: { title: string; sub: string } | null; users: LoginUser[] }) {
  const [sel, setSel] = useState(users[0]?.id || '');
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState(error);
  const [pending, start] = useTransition();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const list = useMemo(() => users.filter((u) => !q || `${u.name} ${u.role} ${u.team}`.toLowerCase().includes(q.toLowerCase())), [users, q]);
  const current = users.find((u) => u.id === sel);
  const submitDemo = (id = sel) =>
    start(async () => {
      const r = await loginDemo(id);
      if (r) setMsg(r);
    });

  return (
    <div className="login-screen">
      <div className="login-hero">
        <div className="login-hero-brand">
          <span className="login-hero-logo">
            <Ic name="logo" />
          </span>
          <b>DienstPlan Pro</b>
        </div>
        <div className="login-hero-copy">
          <h1>
            Dienste &amp; Bereitschaft.
            <br />
            Klar geplant.
          </h1>
          <p>{stats}</p>
          <div className="login-hero-card">
            {heroDuty && (
              <div>
                <i />
                <span>
                  <b>{heroDuty.title}</b>
                  <small>{heroDuty.sub}</small>
                </span>
              </div>
            )}
            {heroStandby && (
              <div>
                <i />
                <span>
                  <b>{heroStandby.title}</b>
                  <small>{heroStandby.sub}</small>
                </span>
              </div>
            )}
          </div>
        </div>
        <span className="login-hero-circle" aria-hidden="true" />
      </div>
      <div className="login-panel">
        <section className="login-dialog" aria-labelledby="login-title">
          <div className="eyebrow">ANMELDUNG</div>
          <h2 id="login-title">Willkommen zurück</h2>
          <p>Melde dich mit deinem Firmenkonto an.</p>
          {msg && (
            <div className="info-box warn" role="alert">
              <Ic name="alert" />
              {msg}
            </div>
          )}
          {sso && (
            <div className="sso-block">
              <button className={`sso-btn ${pending ? 'busy' : ''}`} type="button" disabled={pending} onClick={() => start(() => loginMicrosoft())}>
                <span className="ms-logo" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
                <span className="sso-label">Mit Microsoft anmelden</span>
              </button>
            </div>
          )}
          <form
            className="login-password"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await loginPassword(email, password);
                if (r) setMsg(r);
              });
            }}
          >
            <label className="field">
              E-Mail
              <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label className="field">
              Passwort
              <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            <button className="btn primary login-submit" type="submit" disabled={pending}>
              Anmelden
            </button>
          </form>
          {demo && (
            <>
              <div className="login-divider">
                <span>oder</span>
              </div>
              <details className="login-demo" open={!sso}>
                <summary>
                  <span>
                    <Ic name="users" />
                    Demo: Benutzer wählen
                  </span>
                  <Ic name="down" className="login-demo-chev" />
                </summary>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitDemo();
                  }}
                >
                  <label className="login-search">
                    <Ic name="search" />
                    <input type="search" placeholder="Name suchen …" autoComplete="off" aria-label="Name suchen" value={q} onChange={(e) => setQ(e.target.value)} />
                  </label>
                  <div className="login-user-list" role="listbox" aria-label="Benutzer">
                    {list.map((u) => (
                      <button key={u.id} type="button" role="option" aria-selected={u.id === sel} className={`login-user ${u.id === sel ? 'selected' : ''}`} onClick={() => setSel(u.id)} onDoubleClick={() => submitDemo(u.id)}>
                        <Av u={u} size={38} />
                        <span>
                          <b>{u.name}</b>
                          <small>{u.team}</small>
                        </span>
                        <em className={u.role === 'Admin' ? 'admin' : ''}>{u.role}</em>
                      </button>
                    ))}
                    {!list.length && <div className="empty-note">Kein Benutzer gefunden.</div>}
                  </div>
                  <button className="btn primary login-submit" type="submit" disabled={pending || !current}>
                    {current ? `Als ${current.name} anmelden` : 'Anmelden'}
                  </button>
                </form>
              </details>
              <small className="login-note">
                <Ic name="lock" />
                Demo-Modus: Die Anmeldung „Benutzer wählen“ prüft kein Passwort (AUTH_DEMO_LOGIN=true). Im Echtbetrieb deaktivieren.
              </small>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
