'use client';

// <KmCellEditorDialog> — the modal km-cell editor for the weryfikator board
// (docs/14-design-system.md §7.7.4, REWORK 2026-06-12 #4). Supersedes the old
// inline in-cell editor. One cell, one modal, one explicit Save:
//
//   • header: vehicle identity (plate · bok {side}) + carrier · weekday, date.
//   • body (RHF + SetVehicleDailyKmSchema): a Jechał / Nie jeździ toggle, a km
//     <Input> shown ONLY for `drove` (idle sends km:null), an optional notes
//     <Textarea>.
//   • footer: «Zapisz» (PUT upsert via the caller's onSave) + «Anuluj»/close
//     (ZERO network calls), and — only when the cell already has a state —
//     a destructive «Wyczyść ten dzień» that routes through <ConfirmDialog>.
//
// Save follows the modal-mutation flow: await onSave(); spinner + disabled while
// saving; close on resolve; stay OPEN on reject with a destructive banner at the
// top of the body (the typed km/notes are NOT lost). Cancel/dismiss = pure no-op.

import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import {
  isPastBusinessDay,
  type SetVehicleDailyKmDto,
  type VehicleDayState,
  type VehicleKmCellDto,
} from '@magguarantee/shared';

import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { FormField } from '@/components/forms/Form';
import { cn } from '@/lib/utils';

/** The vehicle + day context the grid hands to the editor. */
export interface KmEditorTarget {
  vehicleId: string;
  plateNumber: string;
  sideNumber: string | null;
  carrierName: string | null;
  /** The day's cell (state/km/notes or empty). */
  cell: VehicleKmCellDto;
  /** Localised weekday abbrev (e.g. «Pn») for the header + clear copy. */
  weekday: string;
  /** Human date (e.g. «09.06.2026») for the header + clear copy. */
  dateLabel: string;
}

interface Props {
  /** The cell being edited; `null` keeps the dialog closed. */
  target: KmEditorTarget | null;
  onOpenChange: (open: boolean) => void;
  /** Upsert. Resolves → dialog closes; rejects → dialog stays open + banner. */
  onSave: (id: string, body: SetVehicleDailyKmDto) => Promise<void>;
  /** Clear/delete the day. Resolves → dialog closes; rejects → confirm stays. */
  onClear: (id: string, date: string) => Promise<void>;
}

export function KmCellEditorDialog({
  target,
  onOpenChange,
  onSave,
  onClear,
}: Props) {
  const t = useTranslations('weryfikator.km.modal');
  const tClear = useTranslations('weryfikator.km.clear');

  const open = target != null;

  // Local form state. (Hand-rolled rather than RHF: the form is two fields with
  // a state-dependent shape — the conditional km + the zero-hint are clearer as
  // plain state, and validation maps 1:1 onto SetVehicleDailyKmSchema's refine.)
  const [state, setState] = useState<VehicleDayState>('drove');
  const [kmText, setKmText] = useState('');
  const [notes, setNotes] = useState('');
  const [kmError, setKmError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  // Re-seed the form whenever a new cell opens the dialog.
  useEffect(() => {
    if (!target) return;
    const { cell } = target;
    setState(cell.state ?? 'drove');
    setKmText(cell.state === 'drove' && cell.km != null ? String(cell.km) : '');
    setNotes(cell.notes ?? '');
    setKmError(false);
    setSaveFailed(false);
    setSaving(false);
  }, [target]);

  if (!open) return null;

  const { vehicleId, plateNumber, sideNumber, carrierName, cell, weekday, dateLabel } =
    target;

  // §7.7.1a DEFENSIVE — the grid never opens the editor on a locked (today /
  // future) cell (those cells are non-button), but if one somehow reaches here
  // we block Save/Clear so we never fire a mutation the server's 422 guard would
  // reject. The grid/cell is the primary gate; this is belt-and-braces.
  const isLockedDay = !isPastBusinessDay(cell.date);

  const kmNum = Number(kmText);
  const kmValid = state === 'idle' || (kmText.trim() !== '' && !Number.isNaN(kmNum));
  // `drove` requires km>0 (SetVehicleDailyKmSchema). The soft 0-km hint nudges
  // the user toward «nie jeździ»; Save stays blocked while km<=0.
  const showZeroHint = state === 'drove' && kmText.trim() !== '' && kmNum === 0;
  const canSave =
    !saving && !isLockedDay && (state === 'idle' || (kmValid && kmNum > 0));

  const handleSave = async () => {
    if (isLockedDay) {
      setSaveFailed(true);
      return;
    }
    if (state === 'drove' && !(kmValid && kmNum > 0)) {
      setKmError(true);
      return;
    }
    setKmError(false);
    setSaveFailed(false);
    setSaving(true);
    const body: SetVehicleDailyKmDto =
      state === 'drove'
        ? {
            date: cell.date,
            state: 'drove',
            km: kmNum,
            notes: notes.trim() || undefined,
          }
        : {
            date: cell.date,
            state: 'idle',
            notes: notes.trim() || undefined,
          };
    try {
      await onSave(vehicleId, body);
      onOpenChange(false);
    } catch {
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-mono">
              {t('title', { plate: plateNumber, side: sideNumber ?? '—' })}
            </DialogTitle>
            <DialogDescription>
              {t('desc', {
                carrier: carrierName ?? '—',
                weekday,
                date: dateLabel,
              })}
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSave();
            }}
            className="space-y-4"
          >
            {saveFailed ? (
              <div
                role="alert"
                className="rounded-[10px] border border-danger bg-danger-bg px-3 py-2 text-sm text-danger-dark dark:bg-danger/10 dark:text-danger"
              >
                {t('saveError')}
              </div>
            ) : null}

            {/* State toggle — Jechał / Nie jeździ */}
            <div>
              <p className="mb-1.5 block text-sm font-medium text-text">
                {t('stateLabel')}
              </p>
              <div
                role="group"
                aria-label={t('stateLabel')}
                className="grid grid-cols-2 gap-2"
              >
                <button
                  type="button"
                  aria-pressed={state === 'drove'}
                  onClick={() => {
                    setState('drove');
                  }}
                  className={cn(
                    'h-10 rounded-[10px] border text-sm font-semibold transition-colors',
                    'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40',
                    state === 'drove'
                      ? 'border-success bg-success/10 text-success'
                      : 'border-border bg-input text-text-sub hover:text-text',
                  )}
                >
                  {t('stateDrove')}
                </button>
                <button
                  type="button"
                  aria-pressed={state === 'idle'}
                  onClick={() => {
                    setState('idle');
                    setKmError(false);
                  }}
                  className={cn(
                    'h-10 rounded-[10px] border text-sm font-semibold transition-colors',
                    'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40',
                    state === 'idle'
                      ? 'border-text-sub bg-text-sub/10 text-text'
                      : 'border-border bg-input text-text-sub hover:text-text',
                  )}
                >
                  {t('stateIdle')}
                </button>
              </div>
            </div>

            {/* Km — drove only */}
            {state === 'drove' ? (
              <FormField
                label={t('kmLabel')}
                required
                htmlFor="km-cell-editor-km"
                description={showZeroHint ? t('kmZeroHint') : undefined}
                error={kmError ? t('kmRequired') : undefined}
              >
                <Input
                  id="km-cell-editor-km"
                  inputMode="numeric"
                  autoFocus
                  value={kmText}
                  onChange={(e) => {
                    setKmText(e.target.value.replace(/[^\d]/g, ''));
                    if (kmError) setKmError(false);
                  }}
                  aria-invalid={kmError}
                  className={cn(
                    'text-center font-mono tabular-nums',
                    kmError && 'border-danger focus:border-danger focus:ring-danger/20',
                  )}
                />
              </FormField>
            ) : null}

            {/* Notes — both states */}
            <FormField label={t('notesLabel')} htmlFor="km-cell-editor-notes">
              <Textarea
                id="km-cell-editor-notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('notesPlaceholder')}
              />
            </FormField>

            <DialogFooter className="justify-between">
              {/* Left slot — destructive clear, only when a record exists */}
              {cell.state != null ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-danger hover:bg-danger/10"
                  onClick={() => setConfirmClear(true)}
                  disabled={saving || isLockedDay}
                >
                  <Trash2 size={14} aria-hidden="true" />
                  {tClear('action')}
                </Button>
              ) : (
                <span />
              )}

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                  disabled={saving}
                >
                  {t('cancel')}
                </Button>
                <Button type="submit" size="sm" disabled={!canSave}>
                  {t('save')}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Destructive confirm — clear this day */}
      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title={tClear('confirmTitle')}
        body={tClear('confirmBody', {
          plate: plateNumber,
          weekday,
          date: dateLabel,
        })}
        confirmLabel={tClear('confirm')}
        cancelLabel={tClear('cancel')}
        onConfirm={async () => {
          await onClear(vehicleId, cell.date);
          // Clear succeeded — close the editor too.
          onOpenChange(false);
        }}
      />
    </>
  );
}
