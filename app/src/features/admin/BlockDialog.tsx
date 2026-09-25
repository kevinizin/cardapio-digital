import { useState } from 'react';
import { Dialog } from '../../components/Dialog';
import { InlineErrors, Notice, useToast } from '../../components/Feedback';
import { releaseBlock } from '../../domain/blocks';
import type { DomainError } from '../../domain/errors';
import { toMs } from '../../domain/time';
import { formatDateTime, t } from '../../i18n';
import { useData, useNow, useStore } from '../../state/store';
import { placeOf } from './adminFormat';

const ag = t.admin.agenda;

/** Detalhes de um bloqueio manual, com remoção (futuro) ou encerramento (em andamento). */
export function BlockDialog({ blockId, onClose }: { blockId: string; onClose: () => void }) {
  const data = useData();
  const store = useStore();
  const now = useNow(15_000);
  const notify = useToast();
  const [errors, setErrors] = useState<DomainError[]>([]);
  const block = data.blocks.find((b) => b.id === blockId);
  if (!block) return null;

  const start = toMs(block.startAt);
  const end = toMs(block.endAt);
  const state = end <= now ? 'past' : start > now ? 'future' : 'ongoing';

  const release = () => {
    const result = store.execute((fresh, nowMs) => releaseBlock(fresh, block.id, nowMs));
    if (!result.ok) return setErrors(result.errors);
    notify({ tone: 'success', title: result.value.outcome === 'removed' ? t.admin.toasts.blockRemoved : t.admin.toasts.blockEnded });
    onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={ag.blockDialogTitle(placeOf(data.tables, block.tableId))}
      description={`${formatDateTime(start)} – ${formatDateTime(end)}`}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            {t.common.back}
          </button>
          {state !== 'past' && (
            <button type="button" className="btn btn--danger-soft" onClick={release}>
              {state === 'future' ? ag.blockRemove : ag.blockEndNow}
            </button>
          )}
        </>
      }
    >
      <p>{block.reason}</p>
      {state === 'past' && <Notice tone="neutral">{ag.blockEnded}</Notice>}
      <InlineErrors errors={errors} />
    </Dialog>
  );
}
