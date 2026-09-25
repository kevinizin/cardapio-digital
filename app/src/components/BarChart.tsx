import { useId, useState, type KeyboardEvent } from 'react';
import { t } from '../i18n';

export interface BarDatum {
  key: string;
  label: string;
  shortLabel?: string;
  value: number;
}

interface BarChartProps {
  title: string;
  description?: string;
  data: BarDatum[];
  tableHeaders: [string, string];
  valueText: (datum: BarDatum) => string;
  emptyText: string;
  wide?: boolean;
}

/** Escala com valores redondos (0, 5, 10…) e cerca de quatro divisões. */
function niceScale(max: number): { top: number; ticks: number[] } {
  if (max <= 0) return { top: 1, ticks: [0, 1] };
  const rough = max / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = Math.max(1, Math.round([1, 2, 5, 10].map((m) => m * power).find((s) => s >= rough) ?? rough));
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= top; value += step) ticks.push(value);
  return { top, ticks };
}

/**
 * Gráfico de barras de uma série, derivado dos registros. Valores também
 * ficam acessíveis pelo teclado (setas) e numa tabela equivalente.
 */
export function BarChart({ title, description, data, tableHeaders, valueText, emptyText, wide = false }: BarChartProps) {
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const id = useId();
  const max = data.reduce((highest, datum) => Math.max(highest, datum.value), 0);
  const { top, ticks } = niceScale(max);
  const labelEvery = Math.max(1, Math.ceil(data.length / 12));
  const peak = data.reduce<BarDatum | null>((best, datum) => (!best || datum.value > best.value ? datum : best), null);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = data.length - 1;
    const moves: Record<string, (current: number) => number> = {
      ArrowRight: (current) => Math.min(last, current + 1),
      ArrowLeft: (current) => Math.max(0, current - 1),
      Home: () => 0,
      End: () => last,
    };
    if (event.key === 'Escape') return setActive(null);
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    setActive((current) => (current === null ? (event.key === 'ArrowLeft' || event.key === 'End' ? last : 0) : move(current)));
  };

  const tooltipLeft = active === null ? 0 : Math.min(90, Math.max(10, ((active + 0.5) / data.length) * 100));

  return (
    <figure className={`chart${wide ? ' chart--wide' : ''}`}>
      <figcaption className="chart__head">
        <h3 className="chart__title" id={`${id}-title`}>
          {title}
        </h3>
        {description && <p className="chart__desc">{description}</p>}
      </figcaption>

      {max === 0 ? (
        <p className="chart__empty">{emptyText}</p>
      ) : (
        <div className="chart__frame">
          <div
            className="chart__plot"
            role="group"
            tabIndex={0}
            aria-labelledby={`${id}-title`}
            aria-describedby={`${id}-help`}
            onKeyDown={onKeyDown}
            onBlur={() => setActive(null)}
            onMouseLeave={() => setActive(null)}
          >
            <div className="chart__grid" aria-hidden="true">
              {ticks.map((tick) => (
                <div key={tick} className="chart__gridline" style={{ bottom: `${(tick / top) * 100}%` }}>
                  <span className="chart__tick num">{tick}</span>
                </div>
              ))}
            </div>
            <div className="chart__bars" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }} aria-hidden="true">
              {data.map((datum, index) => (
                <div key={datum.key} className={`chart__col${active === index ? ' is-active' : ''}`} onMouseEnter={() => setActive(index)}>
                  <span className="chart__bar" style={{ height: `${(datum.value / top) * 100}%` }} />
                </div>
              ))}
            </div>
            {active !== null && data[active] && (
              <div className="chart__tooltip" style={{ left: `${tooltipLeft}%` }} aria-hidden="true">
                {valueText(data[active])}
              </div>
            )}
          </div>
          <div className="chart__xaxis" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }} aria-hidden="true">
            {data.map((datum, index) => (
              <span key={datum.key} className="chart__xlabel">
                {index % labelEvery === 0 ? (datum.shortLabel ?? datum.label) : ''}
              </span>
            ))}
          </div>
          <p id={`${id}-help`} className="visually-hidden">
            {peak ? `${valueText(peak)} (maior valor). ` : ''}Use as setas para percorrer os valores ou abra a tabela.
          </p>
          <p className="visually-hidden" aria-live="polite">
            {active !== null && data[active] ? valueText(data[active]) : ''}
          </p>
        </div>
      )}

      <button
        type="button"
        className="btn btn--ghost btn--sm chart__toggle"
        aria-expanded={showTable}
        aria-controls={`${id}-table`}
        onClick={() => setShowTable((value) => !value)}
      >
        {showTable ? t.admin.monthly.hideTable : t.admin.monthly.showTable}
      </button>
      <div id={`${id}-table`} className="table-scroll" hidden={!showTable}>
        <table className="data-table">
          <caption className="visually-hidden">{title}</caption>
          <thead>
            <tr>
              <th scope="col">{tableHeaders[0]}</th>
              <th scope="col" className="num">
                {tableHeaders[1]}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((datum) => (
              <tr key={datum.key}>
                <td>{datum.label}</td>
                <td className="num">{datum.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
