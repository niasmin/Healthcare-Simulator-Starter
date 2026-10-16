import { buildObjectives, careKpis } from '../../sim/selectors';
import { useMoney, useSummary, useT } from '../hooks';
import { useGame } from '../store';

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'bad' | 'muted' }) {
  return (
    <div className="rounded-xl bg-white border border-line px-3 py-1.5 min-w-0">
      <div className="text-[11px] text-ink-soft truncate">{label}</div>
      <div className={`text-base xl:text-lg font-bold tabular leading-tight truncate ${tone === 'bad' ? 'text-bad' : tone === 'muted' ? 'text-ink-soft/60' : ''}`}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-ink-soft/80 truncate">{sub}</div>}
    </div>
  );
}

export function Dashboard() {
  const t = useT();
  const money = useMoney();
  const game = useGame((s) => s.game);
  const summary = useSummary();
  const goals = buildObjectives(game, summary);
  const kpi = careKpis(game, summary);
  const invested = -(summary.spentByCategory.construction + summary.spentByCategory.equipment + summary.spentByCategory.refund);
  const recent = [...game.ledger].reverse().slice(0, 4);

  return (
    <footer className="panel p-3 grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(260px,1fr)_minmax(240px,0.9fr)]">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 content-start">
        <Kpi label={t('dash.cash')} value={money(game.organization.cashSatang)} tone={game.organization.cashSatang < 0 ? 'bad' : undefined} />
        <Kpi label={t('dash.invested')} value={money(invested)} />
        <Kpi label={t('dash.upkeep')} value={money(summary.dailyUpkeepSatang)} />
        <Kpi label={t('dash.payroll')} value={money(kpi.payrollPerDaySatang)} />
        <Kpi
          label={t('dash.occupancy')}
          value={kpi.occupancy === null ? '—' : `${Math.round(kpi.occupancy * 100)}%`}
          sub={t('dash.occ_sub', { n: kpi.residents, beds: kpi.bedsOperational })}
          tone={kpi.occupancy === null ? 'muted' : undefined}
        />
        <Kpi
          label={t('dash.quality')}
          value={kpi.quality === null ? '—' : String(kpi.quality)}
          sub={kpi.completion === null ? t('dash.wellbeing') + (kpi.wellbeing === null ? '' : ` ${Math.round(kpi.wellbeing)}`) : t('dash.quality_sub', { pct: Math.round(kpi.completion * 100) })}
          tone={kpi.quality === null ? 'muted' : kpi.quality < 50 ? 'bad' : undefined}
        />
        <Kpi label={t('dash.rooms')} value={`${summary.roomsOperational}/${summary.roomsTotal}`} sub={`${t('dash.beds')} ${summary.bedsOperational}`} />
      </div>

      <div>
        <h2 className="text-xs font-semibold text-ink-soft uppercase tracking-wide mb-1.5 flex items-center gap-2">
          <span>
            {t('dash.goals')} <span className="tabular font-normal">{goals.filter((g) => g.done).length}/{goals.length}</span>
          </span>
          <button type="button" onClick={() => useGame.getState().setChaptersOpen(true)} className="ml-auto normal-case tracking-normal text-teal hover:underline font-semibold">
            {t('chapters.open')} →
          </button>
        </h2>
        <ul className="flex flex-col gap-1">
          {[...goals.filter((g) => !g.done), ...goals.filter((g) => g.done)].slice(0, 6).map((g) => (
            <li key={g.id} className={`flex items-center gap-2 text-xs ${g.done ? 'text-ok' : ''}`}>
              <span className={`grid place-items-center size-4 rounded-full border text-[10px] shrink-0 ${g.done ? 'bg-ok border-ok text-white' : 'border-ink-soft/40'}`}>
                {g.done ? '✓' : ''}
              </span>
              <span className={g.done ? 'line-through decoration-ok/50' : ''}>{t(g.key, g.params)}</span>
              {g.progress && !g.done && (
                <span className="ml-auto tabular text-ink-soft">
                  {g.progress.have}/{g.progress.need}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="min-w-0">
        <ul className="flex flex-col gap-1">
          {recent.map((e) => (
            <li key={e.id} className="flex justify-between gap-2 text-xs">
              <span className="truncate">{t(e.memo, e.memoParams)}</span>
              <span className={`tabular shrink-0 font-semibold ${e.amountSatang < 0 ? 'text-bad' : 'text-ok'}`}>
                {e.amountSatang > 0 ? '+' : ''}
                {money(e.amountSatang)}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-[10px] text-ink-soft/70 mt-2 leading-snug">{t('disclaimer')}</p>
      </div>
    </footer>
  );
}
