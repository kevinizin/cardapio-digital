import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { addDays, isValidLocalDate } from '../domain/time';
import type { LocalDate, LocalTime } from '../domain/types';
import { formatLocalDateLong, t } from '../i18n';

const toDisplay = (date: LocalDate | '') => (date ? `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}` : '');

function parseDisplay(text: string): LocalDate | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!match) return null;
  const date = `${match[3]}-${match[2]}-${match[1]}`;
  return isValidLocalDate(date) ? date : null;
}

function mask(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  let out = digits.slice(0, 2);
  if (digits.length > 2) out += `/${digits.slice(2, 4)}`;
  if (digits.length > 4) out += `/${digits.slice(4)}`;
  return out;
}

interface DateFieldProps {
  id: string;
  value: LocalDate | '';
  onChange: (value: LocalDate | '') => void;
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
  ariaLabel?: string;
}

/** Data sempre em dia/mês/ano, independentemente do idioma do navegador. */
export function DateField({ id, value, onChange, invalid, describedBy, disabled, ariaLabel }: DateFieldProps) {
  const [text, setText] = useState(toDisplay(value));

  useEffect(() => {
    setText((current) => (parseDisplay(current) === (value || null) ? current : toDisplay(value)));
  }, [value]);

  const incomplete = text.length > 0 && !parseDisplay(text);
  return (
    <input
      id={id}
      className="input num"
      inputMode="numeric"
      autoComplete="off"
      placeholder="dd/mm/aaaa"
      maxLength={10}
      value={text}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-invalid={invalid || (text.length === 10 && incomplete)}
      aria-describedby={describedBy}
      onChange={(event) => {
        const next = mask(event.target.value);
        setText(next);
        onChange(parseDisplay(next) ?? '');
      }}
    />
  );
}

/** Navegação de dia: anterior, hoje, próximo e campo de data. */
export function DayNavigator({ id, value, today, onChange }: { id: string; value: LocalDate; today: LocalDate; onChange: (date: LocalDate) => void }) {
  return (
    <div className="day-nav">
      <button type="button" className="btn btn--icon" onClick={() => onChange(addDays(value, -1))} aria-label="Dia anterior">
        <ChevronLeft aria-hidden="true" />
      </button>
      <label className="visually-hidden" htmlFor={id}>
        {t.admin.form.date}
      </label>
      <DateField id={id} value={value} onChange={(next) => next && onChange(next)} />
      <button type="button" className="btn btn--icon" onClick={() => onChange(addDays(value, 1))} aria-label="Próximo dia">
        <ChevronRight aria-hidden="true" />
      </button>
      <button type="button" className="btn" onClick={() => onChange(today)} disabled={value === today}>
        {t.common.today}
      </button>
      <span className="day-nav__label">{formatLocalDateLong(value)}</span>
    </div>
  );
}

export function timeOptions(startMinutes: number, endMinutes: number, step: number): LocalTime[] {
  const options: LocalTime[] = [];
  for (let minute = Math.ceil(startMinutes / step) * step; minute <= endMinutes; minute += step) {
    options.push(`${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`);
  }
  return options;
}

interface TimeSelectProps {
  id: string;
  value: LocalTime | '';
  onChange: (value: LocalTime | '') => void;
  options: LocalTime[];
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}

/** Horário em 24 horas por lista, evitando AM/PM do navegador. */
export function TimeSelect({ id, value, onChange, options, placeholder = 'Selecione', disabled, invalid, describedBy }: TimeSelectProps) {
  const list = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <select
      id={id}
      className="select num"
      value={value}
      disabled={disabled}
      aria-invalid={invalid}
      aria-describedby={describedBy}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{placeholder}</option>
      {list.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}
