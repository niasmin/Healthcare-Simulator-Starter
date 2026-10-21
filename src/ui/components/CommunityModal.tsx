import { useEffect, useState } from 'react';
import { COMMUNITY_URL, CONTACT_EMAIL, GAME_URL, SUPPORT } from '../../config/community';
import { dayOf } from '../../sim/systems/time';
import { useT } from '../hooks';
import { promptpayPayload } from '../promptpay';
import { supabase, useSaveStatus } from '../saveService';
import { useGame } from '../store';

type Tab = 'support' | 'feedback' | 'legal';

/** Support the creator, send feedback, and the privacy policy and terms. */
export function CommunityModal({ tab: initial, onClose }: { tab: Tab; onClose: () => void }) {
  const t = useT();
  const [tab, setTab] = useState<Tab>(initial);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/55 p-3" role="dialog" aria-modal="true" aria-label={t('comm.title')} onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-2xl bg-paper shadow-2xl p-4 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <h2 className="font-bold text-lg flex-1">{t('comm.title')}</h2>
          <button type="button" onClick={onClose} className="px-3 py-1 rounded-lg bg-white border border-line text-sm" aria-label={t('save.close')}>
            ✕
          </button>
        </div>
        <div className="flex gap-1 rounded-xl bg-sand p-1" role="tablist">
          {(['support', 'feedback', 'legal'] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`flex-1 rounded-lg py-1.5 text-sm font-semibold ${tab === id ? 'bg-white shadow text-ink' : 'text-ink-soft'}`}
            >
              {t(`comm.tab.${id}`)}
            </button>
          ))}
        </div>
        {tab === 'support' ? <Support /> : tab === 'feedback' ? <Feedback /> : <Legal />}
      </div>
    </div>
  );
}

function Support() {
  const t = useT();
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const payload = SUPPORT.promptpay ? promptpayPayload(SUPPORT.promptpay) : null;
  useEffect(() => {
    if (!payload) return;
    let alive = true;
    void import('qrcode').then((QR) => QR.toDataURL(payload, { margin: 1, width: 220, color: { dark: '#113566', light: '#ffffff' } })).then((url) => alive && setQr(url));
    return () => {
      alive = false;
    };
  }, [payload]);
  const links = [
    { href: SUPPORT.kofi, label: 'Ko-fi', icon: '☕' },
    { href: SUPPORT.bmc, label: 'Buy Me a Coffee', icon: '🧋' },
    { href: SUPPORT.patreon, label: 'Patreon', icon: '🎗️' },
  ].filter((l) => l.href);
  const share = async () => {
    const data = { title: t('app.title'), text: t('comm.share_text'), url: GAME_URL };
    try {
      if (navigator.share) await navigator.share(data);
      else {
        await navigator.clipboard.writeText(`${data.text} ${data.url}`);
        setCopied(true);
      }
    } catch {
      // The player closed the share sheet; nothing to do.
    }
  };
  const nothing = !links.length && !payload && !COMMUNITY_URL;
  return (
    <div className="flex flex-col gap-3" data-testid="support">
      <p className="text-sm leading-relaxed">{t('comm.support_intro')}</p>
      {links.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {links.map((l) => (
            <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-[#f2b631] text-ink font-bold text-sm px-3 py-2.5 text-center hover:brightness-105">
              {l.icon} {l.label}
            </a>
          ))}
        </div>
      )}
      {payload && (
        <div className="rounded-xl border border-line bg-white p-3 flex flex-col items-center gap-1.5">
          <div className="text-sm font-bold text-[#113566]">{t('comm.promptpay')}</div>
          {qr ? <img src={qr} alt={t('comm.promptpay')} width={220} height={220} className="rounded-lg" /> : <div className="size-[220px] grid place-items-center text-ink-soft">…</div>}
          {SUPPORT.promptpayName && <div className="text-xs text-ink-soft">{SUPPORT.promptpayName}</div>}
          <div className="text-[11px] text-ink-soft text-center">{t('comm.promptpay_hint')}</div>
        </div>
      )}
      {nothing && <p className="text-[11px] text-ink-soft rounded-lg bg-sand/70 px-2.5 py-2">{t('comm.no_links')}</p>}
      <div className="rounded-xl border border-line bg-white p-3 flex flex-col gap-2">
        <div className="text-sm font-bold">{t('comm.free_ways')}</div>
        <button type="button" onClick={() => void share()} className="rounded-lg bg-teal text-white text-sm font-semibold px-3 py-2">
          📤 {copied ? t('comm.copied') : t('comm.share')}
        </button>
        {COMMUNITY_URL && (
          <a href={COMMUNITY_URL} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-white border border-line text-sm font-semibold px-3 py-2 text-center">
            💬 {t('comm.join')}
          </a>
        )}
        <p className="text-[11px] text-ink-soft">{t('comm.free_ways_hint')}</p>
      </div>
    </div>
  );
}

function Feedback() {
  const t = useT();
  const provider = useSaveStatus((s) => s.provider);
  const [kind, setKind] = useState<'bug' | 'idea' | 'other'>('idea');
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const send = async () => {
    if (!supabase || message.trim().length < 3) return;
    setState('sending');
    const { game, lang } = useGame.getState();
    const ok = await supabase.sendFeedback({
      kind,
      message: message.trim().slice(0, 2000),
      contact: contact.trim().slice(0, 200) || undefined,
      context: { lang, chapter: game.chapter.id, day: dayOf(game.minute), mode: game.mode ?? 'campaign', width: window.innerWidth },
    });
    setState(ok ? 'sent' : 'failed');
    if (ok) setMessage('');
  };
  if (provider !== 'supabase')
    return (
      <div className="flex flex-col gap-2 text-sm">
        <p>{t('comm.feedback_site_only')}</p>
        {CONTACT_EMAIL && (
          <a href={`mailto:${CONTACT_EMAIL}`} className="rounded-lg bg-teal text-white font-semibold px-3 py-2 text-center">
            ✉️ {CONTACT_EMAIL}
          </a>
        )}
      </div>
    );
  return (
    <div className="flex flex-col gap-2" data-testid="feedback">
      <p className="text-sm">{t('comm.feedback_intro')}</p>
      <div className="flex gap-1">
        {(['bug', 'idea', 'other'] as const).map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k} className={`flex-1 rounded-lg border px-2 py-1.5 text-sm font-semibold ${kind === k ? 'bg-teal text-white border-teal' : 'bg-white border-line'}`}>
            {t(`comm.kind.${k}`)}
          </button>
        ))}
      </div>
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} rows={5} placeholder={t('comm.message_ph')} className="rounded-xl border border-line bg-white p-2.5 text-sm" />
      <input value={contact} onChange={(e) => setContact(e.target.value)} maxLength={200} placeholder={t('comm.contact_ph')} className="rounded-xl border border-line bg-white px-2.5 py-2 text-sm" />
      <button type="button" disabled={state === 'sending' || message.trim().length < 3} onClick={() => void send()} className="rounded-lg bg-teal text-white text-sm font-semibold px-3 py-2 disabled:opacity-40">
        {state === 'sending' ? t('comm.sending') : t('comm.send')}
      </button>
      {state === 'sent' && <p className="text-sm text-ok font-semibold">✓ {t('comm.sent')}</p>}
      {state === 'failed' && <p className="text-sm text-bad">{t('comm.failed')}</p>}
      <p className="text-[11px] text-ink-soft">{t('comm.feedback_note')}</p>
    </div>
  );
}

const LEGAL_SECTIONS = ['about', 'collect', 'use', 'share', 'keep', 'rights', 'kids', 'terms', 'changes'] as const;

function Legal() {
  const t = useT();
  return (
    <div className="flex flex-col gap-2.5 text-sm leading-relaxed" data-testid="legal">
      <p className="text-[11px] text-ink-soft">{t('legal.updated')}</p>
      {LEGAL_SECTIONS.map((k) => (
        <section key={k}>
          <h3 className="font-bold">{t(`legal.${k}.h`)}</h3>
          <p className="whitespace-pre-line text-ink-soft">{t(`legal.${k}`, { email: CONTACT_EMAIL ?? t('legal.no_email') })}</p>
        </section>
      ))}
    </div>
  );
}
