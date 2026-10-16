import { useMemo, useState } from 'react';
import { EVENT_DEFS, REFERRAL_COUNT } from '../../data/events';
import { freeBeds } from '../../domain/rules/beds';
import { choiceBlocker } from '../../sim/systems/events';
import { useMoney, useT } from '../hooks';
import { ROLE_PORTRAIT, residentPortrait } from '../portraits';
import { useGame } from '../store';
import { useName } from './people';

const TONE = {
  urgent: { bg: '#fdecec', fg: '#c8423b', icon: 'M12 3l9 16H3L12 3zm0 6v4m0 3v.5' },
  staff: { bg: '#fdf3e2', fg: '#b5741f', icon: 'M12 12a4 4 0 100-8 4 4 0 000 8zm-7 9a7 7 0 0114 0' },
  opportunity: { bg: '#e6f2fb', fg: '#2f6aa5', icon: 'M3 12l4-4 5 3 5-3 4 4-9 7-9-7z' },
  family: { bg: '#e9f6ee', fg: '#2b9a66', icon: 'M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z' },
} as const;

/** Event card (concept art step 9). The game auto-pauses while it is open. */
export function EventModal() {
  const t = useT();
  const money = useMoney();
  const name = useName();
  const game = useGame((s) => s.game);
  const dispatch = useGame((s) => s.dispatch);
  const lang = useGame((s) => s.lang);
  const [hiddenId, setHiddenId] = useState<string | null>(null);
  const active = game.events.active;
  const beds = useMemo(() => freeBeds(game).length, [game]);
  if (!active) return null;
  const def = EVENT_DEFS[active.defId];
  const tone = TONE[def.tone];
  const resident = game.residents.find((r) => r.id === active.residentId);
  const staff = game.employees.filter((e) => active.employeeIds?.includes(e.id));
  const params = {
    name: resident ? resident.name.th : '',
    nameEn: resident ? resident.name.en : '',
    names: staff.map((e) => name(e.name, true) + ` (${e.role.toUpperCase()})`).join(lang === 'th' ? ' และ ' : ' and '),
    beds,
    n: Math.min(REFERRAL_COUNT, beds),
  };
  const defaultLabel = t(`event.${def.id}.choice.${def.defaultChoice}`);

  if (hiddenId === active.id)
    return (
      <button
        type="button"
        onClick={() => setHiddenId(null)}
        className="fixed z-40 right-4 bottom-20 lg:bottom-4 rounded-xl px-4 py-2.5 shadow-lg text-sm font-semibold text-white animate-pulse"
        style={{ background: tone.fg, marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        ⚠ {t('event.pending')} · {t('event.open')}
      </button>
    );

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-ink/45 p-3" role="dialog" aria-modal="true" aria-labelledby="event-title">
      <div className="w-full max-w-lg max-h-[92dvh] overflow-y-auto rounded-2xl bg-paper shadow-2xl">
        <div className="flex items-start gap-3 p-4" style={{ background: tone.bg }}>
          <span className="grid place-items-center size-12 rounded-xl text-white shrink-0" style={{ background: tone.fg }} aria-hidden>
            <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d={tone.icon} />
            </svg>
          </span>
          <div className="min-w-0">
            <h2 id="event-title" className="font-bold text-lg leading-tight" style={{ color: tone.fg }}>
              {t(`event.${def.id}.title`)}
            </h2>
            <p className="text-sm mt-1 leading-relaxed">{t(`event.${def.id}.body`, params)}</p>
          </div>
          {(resident || staff[0]) && (
            <img
              src={resident ? residentPortrait(resident.name) : ROLE_PORTRAIT[staff[0].role]}
              alt=""
              className="size-14 rounded-full object-cover ml-auto shrink-0 border-2 border-white shadow"
            />
          )}
        </div>
        <div className="p-4 flex flex-col gap-2">
          {def.choices.map((c) => {
            const blocker = choiceBlocker(game, c.id);
            return (
              <button
                key={c.id}
                type="button"
                disabled={!!blocker}
                onClick={() => dispatch({ type: 'resolveEvent', choiceId: c.id })}
                className="text-left rounded-xl border border-line bg-white px-3 py-2.5 hover:border-teal hover:shadow-sm disabled:opacity-50 disabled:hover:border-line"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm flex-1">{t(`event.${def.id}.choice.${c.id}`)}</span>
                  <span className={`text-xs tabular font-semibold ${c.costSatang ? 'text-bad' : 'text-ink-soft'}`}>{c.costSatang ? `−${money(c.costSatang)}` : t('event.free')}</span>
                </div>
                <div className="text-xs text-ink-soft mt-0.5 leading-snug">{t(`event.${def.id}.desc.${c.id}`, params)}</div>
                {blocker && <div className="text-[11px] text-bad mt-1">{t(`reason.${blocker}`)}</div>}
              </button>
            );
          })}
          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-[11px] text-ink-soft leading-snug">
              {t('event.default_note', { choice: defaultLabel })}
              <br />
              {t('event.disclaimer')}
            </p>
            <button type="button" onClick={() => setHiddenId(active.id)} className="text-xs text-ink-soft hover:text-ink whitespace-nowrap underline underline-offset-2">
              {t('event.later')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
