import { useEffect } from 'react';
import { UPGRADES, UPGRADE_ORDER, hasUpgrade } from '../../data/shop';
import { useMoney, useT } from '../hooks';
import { useGame } from '../store';

const ICON: Record<string, string> = { online_marketing: '📣', staff_welfare: '💝', central_kitchen: '🍲', family_app: '📱', laundry_supply: '📦', smart_call: '🔔' };

/** The shop list. `browse` shows it without buy buttons (the title screen, before a game is running). */
export function ShopList({ browse = false }: { browse?: boolean }) {
  const t = useT();
  const money = useMoney();
  const game = useGame((s) => s.game);
  const dispatch = useGame((s) => s.dispatch);
  return (
    <ul className="flex flex-col gap-2">
      {UPGRADE_ORDER.map((id) => {
        const def = UPGRADES[id];
        const owned = !browse && hasUpgrade(game, id);
        const locked = !browse && game.mode !== 'sandbox' && game.chapter.id < def.unlockChapter;
        const short = !browse && game.organization.cashSatang < def.costSatang;
        return (
          <li key={id} className={`rounded-xl border p-2.5 flex items-start gap-2.5 ${owned ? 'border-ok/50 bg-ok/5' : 'border-line bg-white'}`}>
            <span className="text-2xl leading-none mt-0.5" aria-hidden>
              {ICON[id]}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold">{t(`shop.${id}`)}</div>
              <div className="text-xs text-ink-soft leading-snug">{t(`shop.${id}.desc`)}</div>
              <div className="text-[11px] text-ink-soft mt-0.5 tabular">
                {money(def.costSatang)} · {t('shop.once')}
                {def.unlockChapter > 1 ? ` · ${t('shop.from', { c: def.unlockChapter })}` : ''}
              </div>
            </div>
            {!browse &&
              (owned ? (
                <span className="shrink-0 text-xs font-bold text-ok">✓ {t('shop.owned')}</span>
              ) : (
                <button
                  type="button"
                  disabled={locked || short}
                  title={locked ? t('shop.from', { c: def.unlockChapter }) : short ? t('reason.insufficient_funds') : undefined}
                  onClick={() => dispatch({ type: 'buyUpgrade', upgrade: id })}
                  className="shrink-0 px-3 py-1 rounded-lg bg-teal text-white text-sm font-semibold disabled:opacity-35"
                >
                  {locked ? '🔒' : t('shop.buy')}
                </button>
              ))}
          </li>
        );
      })}
    </ul>
  );
}

export function ShopModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const owned = useGame((s) => s.game.upgrades?.length ?? 0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/55 p-3" role="dialog" aria-modal="true" aria-label={t('shop.title')} onClick={onClose}>
      <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl bg-paper shadow-2xl p-4 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <h2 className="font-bold text-lg flex-1">
            🛒 {t('shop.title')} <span className="text-xs font-normal text-ink-soft tabular">{t('shop.count', { n: owned, total: UPGRADE_ORDER.length })}</span>
          </h2>
          <button type="button" onClick={onClose} className="px-3 py-1 rounded-lg bg-white border border-line text-sm" aria-label={t('save.close')}>
            ✕
          </button>
        </div>
        <p className="text-xs text-ink-soft leading-relaxed">{t('shop.intro')}</p>
        <ShopList />
      </div>
    </div>
  );
}
