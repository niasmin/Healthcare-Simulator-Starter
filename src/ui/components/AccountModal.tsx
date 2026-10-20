import { useEffect, useState } from 'react';
import type { AuthResult, OAuthProvider } from '../../storage/supabaseStore';
import { useT } from '../hooks';
import { saveTo, supabase, useSaveStatus } from '../saveService';
import { useGame } from '../store';

type Mode = 'signin' | 'signup' | 'forgot' | 'newpass';

/**
 * Player accounts (deployed site): sign in or sign up with an email and password, reset a forgotten
 * password, or play as a guest (saves stay in this browser). Signed-in players' saves follow them
 * to every device through Supabase.
 */
export function AccountModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { account, recovering } = useSaveStatus();
  const notify = useGame((s) => s.notify);
  const [mode, setMode] = useState<Mode>(recovering ? 'newpass' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  useEffect(() => {
    if (recovering) setMode('newpass');
  }, [recovering]);
  // Only the providers the project has switched on get a button.
  const [providers, setProviders] = useState<Record<OAuthProvider, boolean>>({ google: false });
  useEffect(() => {
    let alive = true;
    void supabase?.providers().then((p) => alive && setProviders(p));
    return () => {
      alive = false;
    };
  }, []);
  const social = async (provider: OAuthProvider) => {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    // The page leaves for Google and comes back signed in: keep the game first.
    if (useGame.getState().started) await saveTo('auto').catch(() => undefined);
    const r = await supabase.signInWith(provider);
    if (!r.ok) {
      setBusy(false);
      setError(t(`auth.err.${r.reason}`));
    }
  };

  const signedIn = !!account && !account.anonymous && !!account.email;
  const run = async (fn: () => Promise<AuthResult>, onOk: (r: Extract<AuthResult, { ok: true }>) => void) => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const r = await fn();
      if (r.ok) onOk(r);
      else setError(t(`auth.err.${r.reason}`));
    } catch {
      setError(t('auth.err.network'));
    } finally {
      setBusy(false);
    }
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return setError(t('auth.err.offline'));
    const sb = supabase;
    if (mode === 'signin')
      void run(
        () => sb.signIn(email.trim(), password),
        () => {
          notify('auth.signed_in', 'ok');
          onClose();
        },
      );
    else if (mode === 'signup')
      void run(
        () => sb.signUp(email.trim(), password, name.trim()),
        (r) => {
          if (r.needsConfirm) {
            setInfo(t('auth.confirm_sent', { email: email.trim() }));
            setMode('signin');
          } else {
            notify('auth.signed_up', 'ok');
            onClose();
          }
        },
      );
    else if (mode === 'forgot') void run(() => sb.resetPassword(email.trim()), () => setInfo(t('auth.reset_sent', { email: email.trim() })));
    else
      void run(
        () => sb.updatePassword(password),
        () => {
          useSaveStatus.setState({ recovering: false });
          notify('auth.password_set', 'ok');
          onClose();
        },
      );
  };

  const field = 'w-full rounded-lg border border-line px-3 py-2 text-sm bg-white';
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/55 p-3" role="dialog" aria-modal="true" aria-label={t('auth.title')} onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-paper shadow-2xl p-4 flex flex-col gap-3 text-ink" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <h2 className="font-bold text-lg flex-1">👤 {t(signedIn && mode !== 'newpass' ? 'auth.account' : `auth.mode.${mode}`)}</h2>
          <button type="button" onClick={onClose} className="px-3 py-1 rounded-lg bg-white border border-line text-sm" aria-label={t('save.close')}>
            ✕
          </button>
        </div>
        {!supabase ? (
          <p className="text-sm text-ink-soft">{t('auth.err.offline')}</p>
        ) : signedIn && mode !== 'newpass' ? (
          <>
            <p className="text-sm">{t('auth.signed_in_as', { name: account.name || account.email! })}</p>
            <p className="text-xs text-ink-soft">{account.email}</p>
            <p className="text-xs text-ink-soft leading-relaxed">{t('auth.synced')}</p>
            <button type="button" className="rounded-xl border border-line bg-white px-3 py-2 text-sm" onClick={() => setMode('newpass')}>
              🔑 {t('auth.change_password')}
            </button>
            <button
              type="button"
              className="rounded-xl bg-coral text-white px-3 py-2 text-sm font-semibold"
              onClick={async () => {
                await supabase?.signOut();
                notify('auth.signed_out', 'ok');
                onClose();
              }}
            >
              {t('auth.sign_out')}
            </button>
          </>
        ) : (
          <form className="flex flex-col gap-2" onSubmit={submit}>
            {mode !== 'newpass' && (
              <div className="flex rounded-xl bg-sand p-1 text-sm font-semibold">
                {(['signin', 'signup'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setMode(m);
                      setError(null);
                    }}
                    className={`flex-1 rounded-lg py-1.5 ${mode === m ? 'bg-white shadow' : 'text-ink-soft'}`}
                  >
                    {t(`auth.mode.${m}`)}
                  </button>
                ))}
              </div>
            )}
            {(mode === 'signin' || mode === 'signup') && providers.google && (
              <div className="flex flex-col gap-2">
                {providers.google && (
                  <button type="button" disabled={busy} onClick={() => void social('google')} className="rounded-xl border border-line bg-white px-3 py-2 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
                    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
                      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
                    </svg>
                    {t('auth.with_google')}
                  </button>
                )}
                <div className="flex items-center gap-2 text-[11px] text-ink-soft">
                  <span className="h-px flex-1 bg-line" />
                  {t('auth.or_email')}
                  <span className="h-px flex-1 bg-line" />
                </div>
              </div>
            )}
            {mode === 'signup' && <input className={field} required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('auth.name')} autoComplete="nickname" />}
            {mode !== 'newpass' && (
              <input className={field} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('auth.email')} autoComplete="email" />
            )}
            {mode !== 'forgot' && (
              <input
                className={field}
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t(mode === 'newpass' ? 'auth.new_password' : 'auth.password')}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              />
            )}
            {error && <p className="text-xs text-bad">{error}</p>}
            {info && <p className="text-xs text-ok">{info}</p>}
            <button type="submit" disabled={busy} className="rounded-xl bg-teal text-white px-3 py-2 text-sm font-bold disabled:opacity-60">
              {busy ? '…' : t(`auth.submit.${mode}`)}
            </button>
            {mode === 'signin' && (
              <button type="button" className="text-xs text-teal underline self-start" onClick={() => setMode('forgot')}>
                {t('auth.forgot')}
              </button>
            )}
            {mode === 'forgot' && (
              <button type="button" className="text-xs text-teal underline self-start" onClick={() => setMode('signin')}>
                {t('auth.back')}
              </button>
            )}
            {mode !== 'newpass' && (
              <button type="button" className="rounded-xl border border-line bg-white px-3 py-2 text-sm" onClick={onClose}>
                {t('auth.guest')}
              </button>
            )}
            <p className="text-[11px] text-ink-soft leading-relaxed">{t('auth.note')}</p>
          </form>
        )}
      </div>
    </div>
  );
}

/** A small "sign in" / player-name chip for the title screen and menus. */
export function AccountChip({ className = '' }: { className?: string }) {
  const t = useT();
  const { account, provider } = useSaveStatus();
  if (provider !== 'supabase') return null;
  const signedIn = !!account && !account.anonymous && !!account.email;
  return (
    <button
      type="button"
      onClick={() => useGame.getState().setAccountOpen(true)}
      className={`rounded-full border-2 border-white/85 shadow px-2.5 h-8 text-xs font-bold flex items-center gap-1 ${signedIn ? 'bg-[#2b9a66] text-white' : 'bg-[#f2b631] text-ink'} ${className}`}
    >
      👤 <span className="max-w-[7rem] truncate">{signedIn ? account.name || account.email : t('auth.sign_in_short')}</span>
    </button>
  );
}
