import { CalendarX2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { closedDayInfo, getClosureNotices, type ClosureNotice } from '../../domain/closures';
import type { ResolvedShift } from '../../domain/schedule';
import { addDays, parisDate } from '../../domain/time';
import type { LocalDate } from '../../domain/types';
import { useI18n, type I18nBundle } from '../../i18n';
import { useData, useNow } from '../../state/store';
import './closures.css';

const DISMISS_KEY = 'aromas-da-vivi:closure-notice-dismissed';

function readDismissed(): string | null {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

function storeDismissed(value: string) {
  try {
    window.sessionStorage.setItem(DISMISS_KEY, value);
  } catch {
    // Sem armazenamento: o aviso some só até recarregar a página.
  }
}

/** Frase de reabertura ("Réouverture le mardi 30/09 à 12:00."). */
export function reopenText({ t, f }: Pick<I18nBundle, 't' | 'f'>, reopen: ResolvedShift | null, today: LocalDate): string | null {
  if (!reopen) return null;
  return t.public.notice.reopen(
    f.formatWeekdayLong(reopen.date),
    f.formatLocalDateShort(reopen.date),
    f.formatTime(reopen.startMs),
    reopen.date === addDays(today, 1),
  );
}

function noticeText(bundle: Pick<I18nBundle, 't' | 'f'>, notice: ClosureNotice, today: LocalDate): string {
  const { t, f } = bundle;
  const n = t.public.notice;
  const head =
    notice.kind === 'closed_today'
      ? n.closedToday(notice.message)
      : notice.from === notice.to
        ? n.upcomingDay(f.formatLocalDateCompact(notice.from), notice.message)
        : n.upcomingRange(f.formatLocalDateCompact(notice.from), f.formatLocalDateCompact(notice.to), notice.message);
  const reopen = reopenText(bundle, notice.reopen, today);
  return reopen ? `${head} ${reopen}` : head;
}

/**
 * Faixa de aviso no topo do site público: fechado hoje e/ou fechamento
 * próximo, com a data e a hora da reabertura. Não é modal; pode ser dispensada
 * durante a visita (volta a aparecer se o conteúdo do aviso mudar).
 */
export function ClosureBanner() {
  const bundle = useI18n();
  const { settings } = useData();
  const now = useNow(60_000);
  const today = parisDate(now);
  const lines = useMemo(
    () => getClosureNotices(settings, now, bundle.publicLocale).map((notice) => noticeText(bundle, notice, today)),
    // Recalcula a cada minuto; o texto muda no máximo quando o dia ou o expediente mudam.
    [settings, now, bundle, today],
  );
  const signature = lines.join('|');
  const [dismissed, setDismissed] = useState<string | null>(readDismissed);

  if (!lines.length || dismissed === signature) return null;

  return (
    <div className="closure-banner" role="status" aria-label={bundle.t.public.notice.label}>
      <div className="closure-banner__inner">
        <CalendarX2 className="closure-banner__icon" aria-hidden="true" />
        <div className="closure-banner__text">
          {lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
        <button
          type="button"
          className="closure-banner__close"
          aria-label={bundle.t.public.notice.dismiss}
          title={bundle.t.public.notice.dismiss}
          onClick={() => {
            storeDismissed(signature);
            setDismissed(signature);
          }}
        >
          <X aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/** Explicação de um dia fechado no calendário de reservas, com a reabertura. */
export function ClosedDayExplain({ date }: { date: LocalDate }) {
  const bundle = useI18n();
  const { t, f, publicLocale } = bundle;
  const { settings } = useData();
  const now = useNow(60_000);
  const info = closedDayInfo(settings, date, publicLocale);
  const weekday = f.formatWeekdayLong(date);
  const reason = info.message
    ? t.public.booking.dateExplain.closed(weekday, info.message)
    : info.byException
      ? t.public.notice.closedException
      : t.public.booking.dateExplain.closed(weekday);
  const reopen = reopenText(bundle, info.reopen, parisDate(now));
  return (
    <p>
      {/[.!?…]$/.test(reason) ? reason : `${reason}.`}
      {reopen && <> {reopen}</>}
    </p>
  );
}
