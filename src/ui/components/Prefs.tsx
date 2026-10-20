import { useT } from '../hooks';
import { useGame } from '../store';
import { playSfx } from '../sound';
import { useSaveStatus } from '../saveService';

/** Per-browser preferences: sound effects, music, anonymous statistics. */
export function PrefsList() {
  const t = useT();
  const { sfxOn, musicOn, statsOn, setSfxOn, setMusicOn, setStatsOn } = useGame();
  const row = (icon: string, label: string, desc: string, on: boolean, set: (v: boolean) => void) => (
    <label className="rounded-xl bg-white border border-line px-4 py-3 flex items-start gap-3 cursor-pointer text-left">
      <span className="text-xl leading-none mt-0.5" aria-hidden>
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-xs text-ink-soft leading-snug">{desc}</span>
      </span>
      <input type="checkbox" className="mt-1 size-5 accent-teal shrink-0" checked={on} onChange={(e) => set(e.target.checked)} />
    </label>
  );
  return (
    <>
      {row('🔊', t('prefs.sfx'), t('prefs.sfx.desc'), sfxOn, (v) => {
        setSfxOn(v);
        if (v) setTimeout(() => playSfx('chime'), 0);
      })}
      {row('🎵', t('prefs.music'), t('prefs.music.desc'), musicOn, setMusicOn)}
      {row('📊', t('prefs.stats'), t('prefs.stats.desc'), statsOn, setStatsOn)}
    </>
  );
}

/** Desktop top bar: one button that mutes and unmutes everything. */
export function MuteButton() {
  const t = useT();
  const { sfxOn, musicOn, setSfxOn, setMusicOn } = useGame();
  const on = sfxOn || musicOn;
  return (
    <button
      type="button"
      title={t(on ? 'prefs.mute' : 'prefs.unmute')}
      aria-label={t(on ? 'prefs.mute' : 'prefs.unmute')}
      aria-pressed={on}
      onClick={() => {
        setSfxOn(!on);
        if (!on) setTimeout(() => playSfx('chime'), 0);
        else setMusicOn(false);
      }}
      className="px-2.5 py-1 rounded-md bg-white/15 border border-white/30 text-sm hover:bg-white/25"
    >
      {on ? '🔊' : '🔇'}
    </button>
  );
}

/** Menu row: who is signed in, or a prompt to sign in for cloud saves (deployed site only). */
export function AccountRow() {
  const t = useT();
  const { account, provider } = useSaveStatus();
  if (provider !== 'supabase') return null;
  const signedIn = !!account && !account.anonymous && !!account.email;
  return (
    <button type="button" onClick={() => useGame.getState().setAccountOpen(true)} className="rounded-xl bg-white border border-line px-4 py-3 text-left flex items-center gap-3">
      <span className="text-xl" aria-hidden>
        👤
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold truncate">{signedIn ? account.name || account.email : t('auth.mode.signin')}</span>
        <span className="block text-xs text-ink-soft">{t(signedIn ? 'auth.synced_short' : 'auth.guest_short')}</span>
      </span>
    </button>
  );
}
