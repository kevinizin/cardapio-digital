import { Clock } from 'lucide-react';
import { Link } from 'react-router';
import { formatParisOffset, formatTime, t } from '../i18n';
import { useNow } from '../state/store';

type LogoVariant = 'header' | 'hero' | 'footer' | 'sidebar';

/**
 * Logo oficial (imagem existente, proporção preservada). As margens de fundo
 * claro são recortadas só no enquadramento e o fundo se funde ao creme.
 */
export function Logo({ variant = 'header', eager = false }: { variant?: LogoVariant; eager?: boolean }) {
  return (
    <span className={`logo logo--${variant}`}>
      <img
        src="/brand/logo-maison-elise-480.webp"
        srcSet="/brand/logo-maison-elise-480.webp 480w, /brand/logo-maison-elise-960.webp 960w"
        sizes={variant === 'hero' ? '(max-width: 640px) 80vw, 520px' : '220px'}
        width={1536}
        height={1024}
        alt={t.brand.logoAlt}
        decoding="async"
        loading={eager ? 'eager' : 'lazy'}
      />
    </span>
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
