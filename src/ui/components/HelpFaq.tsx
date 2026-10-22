import { MONTHLY_FEE_BY_LEVEL, PAYMENT_DELAY_DAYS, SERVICE_PRICE } from '../../data/finance';
import { useMoney, useT } from '../hooks';

/**
 * Two questions players asked: how many nurses and caregivers for how many residents, and when the
 * money comes in. The staffing table is the roster's own suggestion (sim/selectors roleNeeds) for a
 * typical mix of residents; the roster page works it out live for the home's real residents.
 */
const STAFF_ROWS: Array<{ n: number; rn: [number, number, number]; pn: [number, number, number]; cg: [number, number, number]; pt: number; ot: number }> = [
  { n: 10, rn: [1, 1, 0], pn: [1, 0, 0], cg: [3, 3, 1], pt: 1, ot: 1 },
  { n: 20, rn: [1, 1, 0], pn: [2, 2, 0], cg: [7, 6, 1], pt: 1, ot: 2 },
  { n: 30, rn: [1, 1, 0], pn: [3, 3, 0], cg: [10, 8, 2], pt: 2, ot: 3 },
];

function Faq({ q, children, open = false }: { q: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} className="rounded-xl border border-line bg-white px-3 py-2 group">
      <summary className="cursor-pointer text-sm font-semibold list-none flex items-center gap-2">
        <span aria-hidden>💡</span>
        <span className="flex-1">{q}</span>
        <span className="text-ink-soft text-xs group-open:rotate-180 transition-transform" aria-hidden>
          ▾
        </span>
      </summary>
      <div className="mt-2 flex flex-col gap-2 text-xs leading-relaxed">{children}</div>
    </details>
  );
}

export function StaffingHelp({ open }: { open?: boolean }) {
  const t = useT();
  const shifts = (x: [number, number, number]) => x.map((v) => (v ? String(v) : '–')).join(' / ');
  return (
    <Faq q={t('faq.staff.q')} open={open}>
      <p>{t('faq.staff.intro')}</p>
      <div className="overflow-x-auto">
        <table className="w-full tabular text-[11px]">
          <thead className="text-ink-soft">
            <tr>
              <th className="text-left font-semibold py-0.5">{t('faq.staff.residents')}</th>
              <th className="text-right font-semibold">RN</th>
              <th className="text-right font-semibold">PN</th>
              <th className="text-right font-semibold">CG</th>
              <th className="text-right font-semibold">PT</th>
              <th className="text-right font-semibold">OT</th>
            </tr>
          </thead>
          <tbody>
            {STAFF_ROWS.map((r) => (
              <tr key={r.n} className="border-t border-line">
                <td className="py-0.5">{t('faq.staff.n', { n: r.n })}</td>
                <td className="text-right">{shifts(r.rn)}</td>
                <td className="text-right">{shifts(r.pn)}</td>
                <td className="text-right">{shifts(r.cg)}</td>
                <td className="text-right">{r.pt}</td>
                <td className="text-right">{r.ot}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-ink-soft">{t('faq.staff.legend')}</p>
      <ul className="list-disc pl-4 flex flex-col gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <li key={i}>{t(`faq.staff.tip${i}`)}</li>
        ))}
      </ul>
    </Faq>
  );
}

export function MoneyHelp({ open }: { open?: boolean }) {
  const t = useT();
  const money = useMoney();
  return (
    <Faq q={t('faq.money.q')} open={open}>
      <ol className="list-decimal pl-4 flex flex-col gap-1">
        <li>{t('faq.money.admit', { a: PAYMENT_DELAY_DAYS[0], b: PAYMENT_DELAY_DAYS[1] })}</li>
        <li>{t('faq.money.monthly', { a: PAYMENT_DELAY_DAYS[0], b: PAYMENT_DELAY_DAYS[1] })}</li>
        <li>{t('faq.money.services', { therapy: money(SERVICE_PRICE.therapy), activity: money(SERVICE_PRICE.activity), special: money(SERVICE_PRICE.special) })}</li>
        <li>{t('faq.money.leave')}</li>
        <li>{t('faq.money.costs')}</li>
      </ol>
      <p className="text-ink-soft">
        {t('faq.money.fees', { l1: money(MONTHLY_FEE_BY_LEVEL[1]), l2: money(MONTHLY_FEE_BY_LEVEL[2]), l3: money(MONTHLY_FEE_BY_LEVEL[3]), l4: money(MONTHLY_FEE_BY_LEVEL[4]) })}
      </p>
      <p className="font-semibold">{t('faq.money.tip')}</p>
    </Faq>
  );
}
