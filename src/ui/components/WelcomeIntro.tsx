import { useState } from 'react';
import { useT } from '../hooks';
import { useGame } from '../store';

/** The welcome shows once per browser, on a fresh campaign game (day 1 of chapter 1, nobody admitted). */
export function useShowIntro(): boolean {
  return useGame((s) => s.started && !s.introSeen && s.game.chapter.id === 1 && (s.game.mode ?? 'campaign') === 'campaign' && s.game.minute < 1440 && s.game.residents.length === 0);
}

const SLIDES = [
  { id: 'goal', icon: '🎯' },
  { id: 'build', icon: '🏗️' },
  { id: 'team', icon: '👩‍⚕️' },
  { id: 'care', icon: '👵' },
] as const;

/**
 * First game in this browser: how to play in four cards, then either follow the step-by-step guide
 * or let the autopilot set the home up while the player watches (and switch it off any time).
 */
export function WelcomeIntro() {
  const t = useT();
  const [i, setI] = useState(0);
  const done = () => useGame.getState().setIntroSeen(true);
  const watch = () => {
    const st = useGame.getState();
    st.dispatch({ type: 'setAuto', settings: { events: true, admit: true, carePlan: true, staff: true, build: true } });
    st.dispatch({ type: 'setSpeed', speed: 1 });
    st.notify('intro.watching', 'ok');
    done();
  };
  const last = i === SLIDES.length - 1;
  const s = SLIDES[i];
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/60 p-3" role="dialog" aria-modal="true" aria-label={t('intro.title')} data-testid="intro">
      <div className="w-full max-w-sm rounded-2xl bg-paper shadow-2xl p-5 flex flex-col gap-3 text-center">
        <div className="text-[11px] font-bold text-teal tracking-wide">{t('intro.title')}</div>
        <div className="text-6xl leading-none" aria-hidden>
          {s.icon}
        </div>
        <h2 className="text-lg font-bold">{t(`intro.${s.id}.h`)}</h2>
        <p className="text-sm leading-relaxed text-ink-soft">{t(`intro.${s.id}`)}</p>
        <div className="flex justify-center gap-1.5" aria-hidden>
          {SLIDES.map((x, k) => (
            <span key={x.id} className={`h-2 rounded-full ${k === i ? 'w-5 bg-teal' : 'w-2 bg-line'}`} />
          ))}
        </div>
        {last ? (
          <div className="flex flex-col gap-2">
            <button type="button" autoFocus onClick={done} className="rounded-xl bg-coral text-white font-bold py-2.5">
              ▶ {t('intro.start')}
            </button>
            <button type="button" onClick={watch} className="rounded-xl bg-white border border-line font-semibold py-2.5 text-sm">
              🤖 {t('intro.watch')}
            </button>
            <p className="text-[11px] text-ink-soft">{t('intro.watch_hint')}</p>
          </div>
        ) : (
          <div className="flex gap-2">
            <button type="button" onClick={done} className="flex-1 rounded-xl bg-white border border-line text-sm py-2.5 text-ink-soft">
              {t('intro.skip')}
            </button>
            <button type="button" autoFocus onClick={() => setI(i + 1)} className="flex-1 rounded-xl bg-teal text-white font-bold py-2.5">
              {t('intro.next')} →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
