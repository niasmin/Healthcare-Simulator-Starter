import { useEffect, useState } from 'react';
import { formatTHB } from '../../domain/money';
import type { SlotId } from '../../storage/format';
import type { SlotInfo } from '../../storage/saves';
import { formatClock } from '../../sim/systems/time';
import { localeOf } from '../i18n';
import { useT } from '../hooks';
import { saves, saveTo, useSaveStatus } from '../saveService';
import { useGame } from '../store';

function useAgo() {
  const lang = useGame((s) => s.lang);
  return (ms: number) => {
    const rtf = new Intl.RelativeTimeFormat(localeOf(lang), { numeric: 'auto' });
    const sec = Math.round((ms - Date.now()) / 1000);
    if (Math.abs(sec) < 60) return rtf.format(sec, 'second');
    const min = Math.round(sec / 60);
    if (Math.abs(min) < 60) return rtf.format(min, 'minute');
    const hr = Math.round(min / 60);
    if (Math.abs(hr) < 24) return rtf.format(hr, 'hour');
    return rtf.format(Math.round(hr / 24), 'day');
  };
}

/** On the deployed site: who the saves belong to, and sign-in to keep them in the cloud. */
function SupabaseAccountBox() {
  const t = useT();
  const { provider, account } = useSaveStatus();
  if (provider !== 'supabase') return null;
  const signedIn = account && !account.anonymous && account.email;
  return (
    <div className="rounded-xl border border-line bg-white p-3 flex items-center gap-3 text-sm">
      <span className="text-xl" aria-hidden>
        {signedIn ? '☁️' : '👤'}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-semibold truncate">{signedIn ? t('auth.signed_in_as', { name: account.name || account.email! }) : t('save.sb.guest')}</span>
        <span className="block text-xs text-ink-soft leading-snug">{t(signedIn ? 'auth.synced' : 'save.sb.sign_in_hint')}</span>
      </span>
      <button type="button" onClick={() => useGame.getState().setAccountOpen(true)} className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-semibold ${signedIn ? 'border border-line' : 'bg-teal text-white'}`}>
        {t(signedIn ? 'auth.account' : 'auth.mode.signin')}
      </button>
    </div>
  );
}

/** Save / load slots. In "title" mode only loading is offered (no game is running yet). */
export function SaveModal({ mode, onClose }: { mode: 'game' | 'title'; onClose: () => void }) {
  const t = useT();
  const ago = useAgo();
  const lang = useGame((s) => s.lang);
  const loadGame = useGame((s) => s.loadGame);
  const notify = useGame((s) => s.notify);
  const { cloud, version, lastAutoAt } = useSaveStatus();
  const [slots, setSlots] = useState<SlotInfo[] | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    saves.list().then((l) => alive && setSlots(l));
    return () => {
      alive = false;
    };
  }, [version]);

  const twoStep = (key: string, fn: () => Promise<void>) => async () => {
    if (armed !== key) return setArmed(key);
    setArmed(null);
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const doSave = (slot: SlotId) => async () => {
    setBusy(true);
    try {
      const r = await saveTo(slot);
      notify(r.local && (r.cloud || cloud !== 'on') ? 'save.done' : r.local ? 'save.done_local' : 'save.failed', r.local ? 'ok' : 'error');
    } finally {
      setBusy(false);
      setArmed(null);
    }
  };

  const doLoad = (slot: SlotId) => async () => {
    const r = await saves.load(slot);
    if (!r.ok) return notify(`save.err.${r.error}`, 'error');
    loadGame(r.state);
    notify('save.loaded', 'ok', { day: Math.floor(r.state.minute / 1440) + 1 });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center bg-ink/45 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="save-title" onClick={onClose}>
      <div
        className="w-full sm:max-w-md max-h-[90dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-paper shadow-2xl p-4 flex flex-col gap-3"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <h2 id="save-title" className="font-bold text-lg flex-1">
            {t('save.title')}
          </h2>
          <button type="button" onClick={onClose} className="px-3 py-1 rounded-lg bg-white border border-line text-sm" aria-label={t('save.close')}>
            ✕
          </button>
        </div>
        <p className={`text-xs rounded-lg px-2.5 py-2 leading-relaxed ${cloud === 'on' ? 'bg-ok/10 text-ok' : cloud === 'error' ? 'bg-bad/10 text-bad' : 'bg-sand text-ink-soft'}`}>
          {t(`save.cloud.${cloud}`)}
        </p>
        <SupabaseAccountBox />
        {!slots && <p className="text-sm text-ink-soft">{t('save.loading')}</p>}
        <ul className="flex flex-col gap-2">
          {slots?.map((s) => {
            const m = s.meta;
            return (
              <li key={s.slot} className="rounded-xl bg-white border border-line p-3 flex flex-col gap-2">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-sm flex-1">{t(`save.slot.${s.slot}`)}</span>
                  {s.source && <span className="text-[10px] px-1.5 rounded-full bg-sand text-ink-soft">{t(`save.src.${s.source}`)}</span>}
                </div>
                {m ? (
                  <div className="text-xs text-ink-soft tabular leading-relaxed">
                    <div>{t('save.meta', { day: m.day, time: formatClock(m.minute), cash: formatTHB(m.cashSatang, localeOf(lang)) })}</div>
                    <div>{t('save.meta2', { res: m.residents, staff: m.staff, rep: m.reputation })}</div>
                    <div>{ago(m.savedAt)}</div>
                  </div>
                ) : (
                  <div className="text-xs text-ink-soft/70">{t('save.empty')}</div>
                )}
                <div className="flex gap-2 flex-wrap">
                  {mode === 'game' && s.slot !== 'auto' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={m ? twoStep(`save-${s.slot}`, doSave(s.slot)) : doSave(s.slot)}
                      className={`flex-1 min-w-24 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50 ${armed === `save-${s.slot}` ? 'bg-coral text-white' : 'bg-teal text-white'}`}
                    >
                      {armed === `save-${s.slot}` ? t('save.overwrite') : t('save.here')}
                    </button>
                  )}
                  {m && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={mode === 'game' ? twoStep(`load-${s.slot}`, doLoad(s.slot)) : doLoad(s.slot)}
                      className={`flex-1 min-w-24 rounded-lg px-3 py-2 text-sm font-semibold border disabled:opacity-50 ${armed === `load-${s.slot}` ? 'bg-coral text-white border-coral' : 'border-teal text-teal'}`}
                    >
                      {armed === `load-${s.slot}` ? t('save.load_sure') : t('save.load')}
                    </button>
                  )}
                  {m && mode === 'game' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={twoStep(`del-${s.slot}`, async () => {
                        await saves.remove(s.slot);
                        useSaveStatus.setState((x) => ({ version: x.version + 1 }));
                      })}
                      className={`rounded-lg px-3 py-2 text-xs disabled:opacity-50 ${armed === `del-${s.slot}` ? 'bg-bad text-white' : 'text-ink-soft hover:text-bad'}`}
                    >
                      {armed === `del-${s.slot}` ? t('save.delete_sure') : t('save.delete')}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="text-[11px] text-ink-soft leading-relaxed">
          {t('save.auto_note')}
          {lastAutoAt ? ` · ${t('save.last_auto', { ago: ago(lastAutoAt) })}` : ''}
        </p>
      </div>
    </div>
  );
}
