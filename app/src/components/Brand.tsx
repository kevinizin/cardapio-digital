import { Clock } from 'lucide-react';
import { Link } from 'react-router';
import { useI18n, useT } from '../i18n';
import { useNow } from '../state/store';

type LogoVariant = 'header' | 'hero' | 'footer' | 'sidebar';

/** Logo oficial do Aromas da Vivi (letreiro dourado com fundo transparente). */
export const LOGO_IMAGE = '/brand/logo-aromas-da-vivi.webp';

/** Logo da marca nas variantes header, hero, footer e sidebar: letreiro dourado sobre placa bordô. */
export function Logo({ variant = 'header', eager = false }: { variant?: LogoVariant; eager?: boolean }) {
  const t = useT();
  return (
    <span className={`logo logo--${variant}`}>
      <img
        src={LOGO_IMAGE}
        width={640}
        height={247}
        alt={t.brand.logoAlt}
        decoding="async"
        loading={eager ? 'eager' : 'lazy'}
      />
    </span>
  );
}

export function LogoLink({ to, variant = 'header' }: { to: string; variant?: LogoVariant }) {
  const t = useT();
  return (
    <Link to={to} className="logo-link" aria-label={t.brand.homeLink}>
      <Logo variant={variant} eager />
    </Link>
  );
}

/** Relógio de Paris, para deixar claro o fuso de todos os horários. */
export function ParisClock({ compact = false }: { compact?: boolean }) {
  const now = useNow(15_000);
  const { t, f } = useI18n();
  const { formatParisOffset, formatTime } = f;
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
