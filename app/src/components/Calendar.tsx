import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { addDays, addMonths, daysOfMonth, monthOfDate, weekdayIndex } from '../domain/time';
import type { LocalDate, MonthKey } from '../domain/types';
import { useI18n } from '../i18n';

export type CalendarDayStatus = 'available' | 'full' | 'unavailable';

interface CalendarProps {
  month: MonthKey;
  onMonthChange: (month: MonthKey) => void;
  minMonth: MonthKey;
  maxMonth: MonthKey;
  selected: LocalDate | null;
  today: LocalDate;
  onSelect: (date: LocalDate) => void;
  dayInfo: (date: LocalDate) => { status: CalendarDayStatus; description: string };
  labelledBy: string;
}

/**
 * Calendário mensal acessível: grade com navegação por setas, Home/End e
 * PageUp/PageDown. Dias indisponíveis continuam focáveis para explicar o motivo.
 */
export function Calendar({ month, onMonthChange, minMonth, maxMonth, selected, today, onSelect, dayInfo, labelledBy }: CalendarProps) {
  const { t, f } = useI18n();
  const { formatDayNumber, formatLocalDateSpoken, formatMonth } = f;
  const [focusDate, setFocusDate] = useState<LocalDate>(selected ?? today);
  const buttons = useRef(new Map<LocalDate, HTMLButtonElement>());
  const shouldFocus = useRef(false);

  const weeks = useMemo(() => {
    const days = daysOfMonth(month);
    const cells: (LocalDate | null)[] = [...Array(weekdayIndex(days[0])).fill(null), ...days];
    while (cells.length % 7) cells.push(null);
    return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  }, [month]);

  const activeDate = monthOfDate(focusDate) === month ? focusDate : (selected && monthOfDate(selected) === month ? selected : `${month}-01`);

  useEffect(() => {
    if (!shouldFocus.current) return;
    shouldFocus.current = false;
    buttons.current.get(activeDate)?.focus();
  }, [activeDate, month]);

  const moveTo = (date: LocalDate) => {
    const target = monthOfDate(date);
    if (target < minMonth || target > maxMonth) return;
    shouldFocus.current = true;
    setFocusDate(date);
    if (target !== month) onMonthChange(target);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, date: LocalDate) => {
    const weekday = weekdayIndex(date);
    const moves: Record<string, () => LocalDate> = {
      ArrowLeft: () => addDays(date, -1),
      ArrowRight: () => addDays(date, 1),
      ArrowUp: () => addDays(date, -7),
      ArrowDown: () => addDays(date, 7),
      Home: () => addDays(date, -weekday),
      End: () => addDays(date, 6 - weekday),
      PageUp: () => `${addMonths(monthOfDate(date), -1)}-${date.slice(8)}`,
      PageDown: () => `${addMonths(monthOfDate(date), 1)}-${date.slice(8)}`,
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    let next = move();
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      const days = daysOfMonth(monthOfDate(`${next.slice(0, 7)}-01`));
      if (!days.includes(next)) next = days[days.length - 1];
    }
    moveTo(next);
  };

  return (
    <div className="calendar">
      <div className="calendar__header">
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          onClick={() => onMonthChange(addMonths(month, -1))}
          disabled={month <= minMonth}
          aria-label={t.public.booking.prevMonth}
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        <p className="calendar__title" aria-live="polite">
          {formatMonth(month)}
        </p>
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          onClick={() => onMonthChange(addMonths(month, 1))}
          disabled={month >= maxMonth}
          aria-label={t.public.booking.nextMonth}
        >
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
      <table className="calendar__grid" role="grid" aria-labelledby={labelledBy}>
        <thead>
          <tr>
            {t.weekdaysShort.map((day, index) => (
              <th key={day} scope="col" className="calendar__weekday">
                <abbr title={t.weekdays[index]}>{day}</abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, row) => (
            <tr key={row}>
              {week.map((date, column) => {
                if (!date) return <td key={`empty-${row}-${column}`} />;
                const info = dayInfo(date);
                const isSelected = date === selected;
                return (
                  <td key={date} role="gridcell" aria-selected={isSelected}>
                    <button
                      ref={(element) => {
                        if (element) buttons.current.set(date, element);
                        else buttons.current.delete(date);
                      }}
                      type="button"
                      tabIndex={date === activeDate ? 0 : -1}
                      className={`calendar__day calendar__day--${info.status}${date === today ? ' calendar__day--today' : ''}`}
                      aria-pressed={isSelected}
                      aria-disabled={info.status === 'unavailable'}
                      aria-current={date === today ? 'date' : undefined}
                      aria-label={`${formatLocalDateSpoken(date)}: ${info.description}`}
                      onClick={() => {
                        setFocusDate(date);
                        onSelect(date);
                      }}
                      onKeyDown={(event) => onKeyDown(event, date)}
                    >
                      <span className="num">{formatDayNumber(date)}</span>
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="calendar__legend" aria-label="Legenda do calendário">
        <li>
          <span className="calendar__swatch calendar__swatch--available" aria-hidden="true" />
          {t.public.booking.legendAvailable}
        </li>
        <li>
          <span className="calendar__swatch calendar__swatch--full" aria-hidden="true" />
          {t.public.booking.legendFull}
        </li>
        <li>
          <span className="calendar__swatch calendar__swatch--unavailable" aria-hidden="true" />
          {t.public.booking.legendUnavailable}
        </li>
      </ul>
      <p className="field__hint">{t.public.booking.calendarHint}</p>
    </div>
  );
}
