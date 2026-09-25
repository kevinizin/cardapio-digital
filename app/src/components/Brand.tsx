import '@fontsource/great-vibes/latin-400.css';
import { Clock } from 'lucide-react';
import { useId } from 'react';
import { Link } from 'react-router';
import { formatParisOffset, formatTime, t } from '../i18n';
import { useNow } from '../state/store';

type LogoVariant = 'header' | 'hero' | 'footer' | 'sidebar';

/**
 * Arquivo do logo oficial do Aromas da Vivi (ainda pendente).
 *
 * Enquanto for `null`, o componente desenha um logotipo provisório em SVG:
 * "Aromas" com chapéu de chef e "da Vivi" em script dourado sobre bordô.
 * Quando o arquivo chegar, coloque-o em `public/brand/` e troque por
 * exemplo para `'/brand/logo-aromas-da-vivi.webp'` — o `<img>` passa a ser
 * usado em todas as variantes, sem outra mudança.
 */
export const LOGO_IMAGE: string | null = null;

/** Logo da marca nas variantes header, hero, footer e sidebar. */
export function Logo({ variant = 'header', eager = false }: { variant?: LogoVariant; eager?: boolean }) {
  if (LOGO_IMAGE) {
    return (
      <span className={`logo logo--image logo--${variant}`}>
        <img
          src={LOGO_IMAGE}
          alt={t.brand.logoAlt}
          decoding="async"
          loading={eager ? 'eager' : 'lazy'}
        />
      </span>
    );
  }
  return (
    <span className={`logo logo--wordmark logo--${variant}`} role="img" aria-label={t.brand.logoAlt}>
      <Wordmark />
    </span>
  );
}

/** Logotipo provisório: texto em Great Vibes com dourado metálico, chapéu de chef e brilho. */
function Wordmark() {
  // IDs únicos: há logos repetidos na página e alguns ficam ocultos (display: none).
  const id = useId().replace(/:/g, '');
  const gold = `gold-${id}`;
  const sheen = `sheen-${id}`;
  return (
    <svg viewBox="0 0 320 160" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gold} x1="0" y1="0" x2="0.18" y2="1">
          <stop offset="0" stopColor="#f7e2a3" />
          <stop offset="0.36" stopColor="#e0bf6c" />
          <stop offset="0.56" stopColor="#c9a24a" />
          <stop offset="0.8" stopColor="#a8822f" />
          <stop offset="1" stopColor="#e8cd82" />
        </linearGradient>
        <radialGradient id={sheen} cx="0.3" cy="0.2" r="0.95">
          <stop offset="0" stopColor="#9a1f3b" />
          <stop offset="0.65" stopColor="#841731" />
          <stop offset="1" stopColor="#6b1227" />
        </radialGradient>
      </defs>
      <rect width="320" height="160" rx="16" fill={`url(#${sheen})`} />
      <g fill={`url(#${gold})`}>
        <text
          className="logo__script"
          x="26"
          y="94"
          fontSize="92"
          textLength="262"
          lengthAdjust="spacingAndGlyphs"
        >
          Aromas
        </text>
        <text
          className="logo__script"
          x="150"
          y="140"
          fontSize="46"
          textLength="120"
          lengthAdjust="spacingAndGlyphs"
        >
          da Vivi
        </text>
        {/* Chapéu de chef sobre o "o" */}
        <g transform="translate(36 7) rotate(6 113 40)">
          <path d="M103 44c-7 0-11-5-11-10 0-6 5-10 10-9 1-5 6-8 11-8s10 3 11 8c5-1 10 3 10 9 0 5-4 10-11 10v6h-20z" />
          <rect x="102" y="51" width="22" height="4" rx="1.5" />
        </g>
        {/* Brilho */}
        <path d="M291 104l2.6 7.4 7.4 2.6-7.4 2.6-2.6 7.4-2.6-7.4-7.4-2.6 7.4-2.6z" />
        <path d="M279 97l1.2 3.3 3.3 1.2-3.3 1.2-1.2 3.3-1.2-3.3-3.3-1.2 3.3-1.2z" opacity="0.8" />
      </g>
    </svg>
  );
}

export function LogoLink({ to, variant = 'header' }: { to: string; variant?: LogoVariant }) {
  return (
    <Link to={to} className="logo-link" aria-label={`${t.brand.name} — início`}>
      <Logo variant={variant} eager />
    </Link>
  );
}

/** Relógio de Paris, para deixar claro o fuso de todos os horários. */
export function ParisClock({ compact = false }: { compact?: boolean }) {
  const now = useNow(15_000);
  return (
    <span className="paris-clock" title={t.demo.timezoneNote(formatParisOffset(now))}>
      <Clock aria-hidden="true" />
      {compact ? (
        <span>
          <span className="visually-hidden">{t.demo.parisNow}: </span>
          <span className="num">{formatTime(now)}</span> Paris
        </span>
      ) : (
        <span>
          {t.demo.parisNow} <strong className="num">{formatTime(now)}</strong>{' '}
          <span className="paris-clock__offset">({formatParisOffset(now)})</span>
        </span>
      )}
    </span>
  );
}
