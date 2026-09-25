import { Armchair, ArrowRight, Clock, Hourglass, UtensilsCrossed } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { Notice } from '../../components/Feedback';
import { useDocumentTitle } from '../../components/PageLoading';
import { currentOrNextShift, currentWeeklyRules, getShiftsForDate, lastBookableDate } from '../../domain/schedule';
import { parisDate } from '../../domain/time';
import type { DayRule } from '../../domain/types';
import { formatDuration, formatLocalDateCompact, formatLocalDateShort, formatParisOffset, formatTime, t } from '../../i18n';
import { useData, useNow } from '../../state/store';

const h = t.public.home;

const plainWeekday = (index: number) => t.weekdays[index].replace('-feira', '');

function shiftsText(rule: DayRule): string[] {
  const parts: string[] = [];
  if (rule.lunch.enabled) parts.push(`${t.shift.lunch} ${rule.lunch.start}–${rule.lunch.end}`);
  if (rule.dinner.enabled) parts.push(`${t.shift.dinner} ${rule.dinner.start}–${rule.dinner.end}`);
  return parts;
}

/** Agrupa dias consecutivos com o mesmo funcionamento (ex.: "Terça a domingo"). */
function groupWeekdays(weekly: DayRule[]) {
  const groups: { days: number[]; lines: string[] }[] = [];
  weekly.forEach((rule, index) => {
    const lines = shiftsText(rule);
    const last = groups[groups.length - 1];
    if (last && last.lines.join('|') === lines.join('|') && last.days[last.days.length - 1] === index - 1) last.days.push(index);
    else groups.push({ days: [index], lines });
  });
  return groups.map((group) => ({
    label:
      group.days.length === 1
        ? t.weekdays[group.days[0]]
        : group.days.length === 2
          ? `${plainWeekday(group.days[0])} e ${plainWeekday(group.days[1]).toLowerCase()}`
          : `${plainWeekday(group.days[0])} a ${plainWeekday(group.days[group.days.length - 1]).toLowerCase()}`,
    lines: group.lines,
  }));
}

export function HomePage() {
  useDocumentTitle(h.documentTitle);
  const data = useData();
  const now = useNow(60_000);
  const { settings, tables } = data;
  const { rules } = settings;

  const hours = useMemo(() => groupWeekdays(currentWeeklyRules(settings)), [settings]);
  const today = parisDate(now);
  const todayShifts = getShiftsForDate(settings, today);
  const next = currentOrNextShift(settings, now);
  const lastDate = lastBookableDate(settings, now);
  const specials = settings.exceptions.filter((e) => e.date >= today && e.date <= lastDate).slice(0, 3);
  const activeTables = tables.filter((table) => table.active);
  const seats = activeTables.reduce((sum, table) => sum + table.capacity, 0);

  return (
    <>
      <section className="pub-hero">
        <div className="container pub-hero__grid">
          <div className="pub-hero__copy">
            <p className="eyebrow">{h.eyebrow}</p>
            <h1 className="pub-hero__title">{h.heading}</h1>
            <p className="pub-hero__lead">{h.lead}</p>
            <div className="cluster pub-hero__actions">
              <Link to="/reservar" className="btn btn--primary btn--lg">
                {h.ctaBook}
                <ArrowRight aria-hidden="true" />
              </Link>
              <Link to="/consultar" className="btn btn--lg">
                {h.ctaLookup}
              </Link>
            </div>
            <p className="pub-hero__note">
              <Clock aria-hidden="true" />
              {t.demo.timezoneNote(formatParisOffset(now))}
            </p>
          </div>

          <aside className="pub-arch" aria-labelledby="horarios-titulo">
            <div className="pub-arch__frame">
              <span className="pub-arch__mark" aria-hidden="true" />
              <h2 id="horarios-titulo" className="pub-arch__title">
                {h.hoursTitle}
              </h2>
              <p className="pub-arch__zone">{h.hoursZone(formatParisOffset(now))}</p>
              <dl className="pub-hours">
                {hours.map((group) => (
                  <div className="pub-hours__row" key={group.label}>
                    <dt className="pub-hours__days">{group.label}</dt>
                    <dd className="pub-hours__times num">
                      {group.lines.length ? group.lines.map((line) => <span key={line}>{line}</span>) : <span>{h.closed}</span>}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="pub-today">
                <span className={`badge ${todayShifts.length ? 'badge--free' : 'badge--cancelled'}`}>
                  {todayShifts.length
                    ? h.todayOpen(todayShifts.map((s) => `${s.start}–${s.end}`).join(' · '))
                    : h.todayClosed}
                </span>
              </p>
              {!todayShifts.length && next && (
                <p className="pub-arch__next">
                  {h.nextOpening(`${formatLocalDateCompact(next.shift.date)} às ${formatTime(next.shift.startMs)}`)}
                </p>
              )}
              {specials.length > 0 && (
                <ul className="pub-specials">
                  {specials.map((special) => (
                    <li key={special.id}>
                      <strong className="num">{formatLocalDateShort(special.date)}</strong> —{' '}
                      {special.closed ? h.closed : shiftsText({ lunch: special.lunch, dinner: special.dinner }).join(' · ')}
                      {special.note && <span className="subtle"> ({special.note})</span>}
                    </li>
                  ))}
                </ul>
              )}
              <p className="pub-arch__groups">{h.onlineGroups(rules.onlineMaxPartySize)}</p>
            </div>
          </aside>
        </div>
      </section>

      <section className="container pub-section" aria-labelledby="casa-titulo">
        <div className="pub-section-head">
          <p className="eyebrow">{h.houseEyebrow}</p>
          <h2 id="casa-titulo">{h.houseTitle}</h2>
        </div>
        <div className="pub-house">
          <article className="pub-feature">
            <span className="pub-feature__icon" aria-hidden="true">
              <UtensilsCrossed />
            </span>
            <h3>{h.kitchenTitle}</h3>
            <p className="muted">{h.kitchenText}</p>
          </article>
          <article className="pub-feature">
            <span className="pub-feature__icon" aria-hidden="true">
              <Armchair />
            </span>
            <h3>{h.roomTitle}</h3>
            <p className="muted">{h.roomText(activeTables.length, seats)}</p>
          </article>
          <article className="pub-feature">
            <span className="pub-feature__icon" aria-hidden="true">
              <Hourglass />
            </span>
            <h3>{h.timeTitle}</h3>
            <p className="muted">{h.timeText(formatDuration(rules.serviceMinutes), rules.arrivalToleranceMinutes)}</p>
          </article>
        </div>
      </section>

      <section className="pub-band" aria-labelledby="como-titulo">
        <div className="container pub-section">
          <div className="pub-section-head">
            <p className="eyebrow">{h.howEyebrow}</p>
            <h2 id="como-titulo">{h.howTitle}</h2>
          </div>
          <ol className="pub-steps">
            {h.howSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      </section>

      <section className="container pub-section" aria-labelledby="saber-titulo">
        <div className="pub-info-grid">
          <div className="card">
            <div className="card__body stack">
              <h2 id="saber-titulo" className="card__title">
                {h.policiesTitle}
              </h2>
              <ul className="pub-policies">
                <li>{h.policyWindow(rules.bookingWindowDays)}</li>
                <li>{h.policyAdvance(rules.minAdvanceMinutes)}</li>
                <li>{h.policyCancel(rules.customerCancelMinutes)}</li>
              </ul>
            </div>
          </div>
          <Notice tone="neutral" title={h.groupsTitle}>
            <p>{h.groupsText(rules.onlineMaxPartySize)}</p>
            <p className="subtle">{h.groupsDemo}</p>
          </Notice>
        </div>
        <div className="pub-cta">
          <p className="pub-cta__text">{h.heading}</p>
          <Link to="/reservar" className="btn btn--primary btn--lg">
            {h.ctaBook}
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </section>
    </>
  );
}
