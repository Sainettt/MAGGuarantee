'use client';

// Phase 3 — carrier-side trailer create/edit sheet. Mirrors the employee
// version but the carrier doesn't pick a carrier — it's auto-injected from
// the session. List/edit access is API-scoped.

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  CreateTrailerSchema,
  UpdateTrailerSchema,
  type CreateTrailerDto,
  type TrailerDto,
  type UpdateTrailerDto,
} from '@magguarantee/shared';

import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/Sheet';
import { Textarea } from '@/components/ui/Textarea';
import { FormField, FormSection } from '@/components/forms/Form';
import { useFormDraft } from '@/lib/hooks/useFormDraft';
import { useTrailerTypes } from '@/lib/hooks/useTrailerTypes';
import { useCreateTrailer, useUpdateTrailer } from '@/lib/hooks/useTrailers';

const DRAFT_KEY = 'draft:carrier:trailers:new';

interface Props {
  open: boolean;
  trailer: TrailerDto | null;
  carrierId: string | null;
  onClose: () => void;
}

type FormValues = CreateTrailerDto;

const NUMERIC_FIELDS = [
  'year',
  'innerLength',
  'innerWidth',
  'innerHeight',
  'capacity',
] as const;

export function TrailerSheetCarrier({
  open,
  trailer,
  carrierId,
  onClose,
}: Props) {
  const isEdit = trailer !== null;

  const form = useForm<FormValues>({
    resolver: zodResolver(
      isEdit ? UpdateTrailerSchema.passthrough() : CreateTrailerSchema,
    ),
    defaultValues: getDefaults(),
  });

  const typesQ = useTrailerTypes({ active: true });

  const draft = useFormDraft(form, DRAFT_KEY, { enabled: !isEdit });

  useEffect(() => {
    if (!open) return;
    if (isEdit && trailer) {
      form.reset({
        carrierId: trailer.carrierId,
        plateNumber: trailer.plateNumber,
        active: trailer.active,
        trailerTypeId: trailer.trailerTypeId ?? undefined,
        brand: trailer.brand ?? '',
        model: trailer.model ?? '',
        year: trailer.year ?? undefined,
        equipment: trailer.equipment ?? '',
        nextInspectionDate: trailer.nextInspectionDate ?? undefined,
        belts: trailer.belts ?? false,
        mats: trailer.mats ?? false,
        innerLength: trailer.innerLength ?? undefined,
        innerWidth: trailer.innerWidth ?? undefined,
        innerHeight: trailer.innerHeight ?? undefined,
        capacity: trailer.capacity ?? undefined,
        airSuspension: trailer.airSuspension ?? false,
        loadFromBack: trailer.loadFromBack ?? false,
        loadFromSide: trailer.loadFromSide ?? false,
        loadFromTop: trailer.loadFromTop ?? false,
        slidingRoof: trailer.slidingRoof ?? false,
        edschaSlidingRoof: trailer.edschaSlidingRoof ?? false,
        notes: trailer.notes ?? '',
      });
    } else {
      form.reset({
        ...getDefaults(),
        carrierId: carrierId ?? (undefined as unknown as string),
      });
      draft.hydrate();
    }
  }, [open, isEdit, trailer, carrierId, form, draft]);

  const createM = useCreateTrailer({
    onSuccess: () => {
      draft.clear();
      form.reset(getDefaults());
      toast.success('Zapisano');
      onClose();
    },
    onError: () => toast.error('Coś poszło nie tak. Spróbuj ponownie.'),
  });
  const updateM = useUpdateTrailer({
    onSuccess: () => {
      toast.success('Zapisano');
      onClose();
    },
    onError: () => toast.error('Coś poszło nie tak. Spróbuj ponownie.'),
  });

  const onSubmit = form.handleSubmit((values) => {
    const cleaned = cleanForm(values);
    if (isEdit && trailer) {
      const { carrierId: _carrierId, ...rest } = cleaned;
      void _carrierId;
      updateM.mutate({ id: trailer.id, body: rest as UpdateTrailerDto });
    } else {
      cleaned.carrierId = carrierId;
      createM.mutate(cleaned as CreateTrailerDto);
    }
  });

  const submitting = createM.isPending || updateM.isPending;
  const errs = form.formState.errors;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent size="wide">
        <form onSubmit={onSubmit} className="flex h-full flex-col">
          <SheetHeader>
            <SheetTitle>
              {isEdit ? 'Edytuj naczepę' : 'Nowa naczepa'}
            </SheetTitle>
            <SheetDescription>
              {isEdit && trailer ? trailer.plateNumber : null}
            </SheetDescription>
          </SheetHeader>

          <SheetBody>
            <div className="space-y-6">
              <FormSection title="Identyfikacja">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    label="Numer rejestracyjny"
                    required
                    error={errs.plateNumber?.message}
                    htmlFor="ctrailer-plateNumber"
                  >
                    <Input
                      id="ctrailer-plateNumber"
                      className="h-10"
                      {...form.register('plateNumber')}
                    />
                  </FormField>
                  <FormField
                    label="Typ naczepy"
                    required
                    error={errs.trailerTypeId?.message}
                    htmlFor="ctrailer-typeId"
                  >
                    <Select
                      id="ctrailer-typeId"
                      {...form.register('trailerTypeId')}
                    >
                      <option value="">—</option>
                      {(typesQ.data ?? []).map((tt) => (
                        <option key={tt.id} value={tt.id}>
                          {tt.shortCode ? `[${tt.shortCode}] ` : ''}
                          {tt.name}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                  <FormField
                    label="Marka"
                    error={errs.brand?.message}
                    htmlFor="ctrailer-brand"
                  >
                    <Input
                      id="ctrailer-brand"
                      className="h-10"
                      {...form.register('brand')}
                    />
                  </FormField>
                  <FormField
                    label="Model"
                    error={errs.model?.message}
                    htmlFor="ctrailer-model"
                  >
                    <Input
                      id="ctrailer-model"
                      className="h-10"
                      {...form.register('model')}
                    />
                  </FormField>
                  <FormField
                    label="Rok"
                    error={errs.year?.message}
                    htmlFor="ctrailer-year"
                  >
                    <Input
                      id="ctrailer-year"
                      type="number"
                      className="h-10"
                      {...form.register('year', {
                        setValueAs: (v) =>
                          v === '' || v === null ? undefined : Number(v),
                      })}
                    />
                  </FormField>
                  <FormField
                    label="Następny przegląd"
                    error={errs.nextInspectionDate?.message}
                    htmlFor="ctrailer-nextInspectionDate"
                  >
                    <Input
                      id="ctrailer-nextInspectionDate"
                      type="date"
                      className="h-10"
                      {...form.register('nextInspectionDate')}
                    />
                  </FormField>
                </div>
              </FormSection>

              <FormSection title="Wymiary">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <FormField
                    label="Długość wewn. (m)"
                    error={errs.innerLength?.message}
                    htmlFor="ctrailer-innerLength"
                  >
                    <Input
                      id="ctrailer-innerLength"
                      type="number"
                      step="0.01"
                      className="h-10"
                      {...form.register('innerLength', {
                        setValueAs: (v) =>
                          v === '' || v === null ? undefined : Number(v),
                      })}
                    />
                  </FormField>
                  <FormField
                    label="Szerokość wewn. (m)"
                    error={errs.innerWidth?.message}
                    htmlFor="ctrailer-innerWidth"
                  >
                    <Input
                      id="ctrailer-innerWidth"
                      type="number"
                      step="0.01"
                      className="h-10"
                      {...form.register('innerWidth', {
                        setValueAs: (v) =>
                          v === '' || v === null ? undefined : Number(v),
                      })}
                    />
                  </FormField>
                  <FormField
                    label="Wysokość wewn. (m)"
                    error={errs.innerHeight?.message}
                    htmlFor="ctrailer-innerHeight"
                  >
                    <Input
                      id="ctrailer-innerHeight"
                      type="number"
                      step="0.01"
                      className="h-10"
                      {...form.register('innerHeight', {
                        setValueAs: (v) =>
                          v === '' || v === null ? undefined : Number(v),
                      })}
                    />
                  </FormField>
                  <FormField
                    label="Ładowność (t)"
                    error={errs.capacity?.message}
                    htmlFor="ctrailer-capacity"
                  >
                    <Input
                      id="ctrailer-capacity"
                      type="number"
                      step="0.01"
                      className="h-10"
                      {...form.register('capacity', {
                        setValueAs: (v) =>
                          v === '' || v === null ? undefined : Number(v),
                      })}
                    />
                  </FormField>
                </div>
              </FormSection>

              <FormSection title="Wyposażenie">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                  {(
                    [
                      'belts',
                      'mats',
                      'airSuspension',
                      'loadFromBack',
                      'loadFromSide',
                      'loadFromTop',
                      'slidingRoof',
                      'edschaSlidingRoof',
                    ] as const
                  ).map((key) => (
                    <label
                      key={key}
                      className="flex items-center gap-2 text-text"
                    >
                      <Checkbox {...form.register(key)} />
                      {labelFor(key)}
                    </label>
                  ))}
                </div>
                <FormField
                  label="Wyposażenie (opis)"
                  error={errs.equipment?.message}
                  htmlFor="ctrailer-equipment"
                >
                  <Textarea
                    id="ctrailer-equipment"
                    rows={2}
                    {...form.register('equipment')}
                  />
                </FormField>
                <FormField
                  label="Notatki"
                  error={errs.notes?.message}
                  htmlFor="ctrailer-notes"
                >
                  <Textarea
                    id="ctrailer-notes"
                    rows={2}
                    {...form.register('notes')}
                  />
                </FormField>
                <label className="flex items-center gap-2 text-sm text-text">
                  <Checkbox {...form.register('active')} />
                  Aktywny
                </label>
              </FormSection>
            </div>
          </SheetBody>

          <SheetFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={submitting}
            >
              Anuluj
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={submitting || (!isEdit && !carrierId)}
            >
              {submitting ? 'Zapisywanie…' : 'Zapisz'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function getDefaults(): FormValues {
  return {
    carrierId: undefined as unknown as string,
    plateNumber: '',
    active: true,
    trailerTypeId: '' as unknown as string,
    brand: '',
    model: '',
    year: undefined,
    equipment: '',
    nextInspectionDate: undefined,
    belts: false,
    mats: false,
    innerLength: undefined,
    innerWidth: undefined,
    innerHeight: undefined,
    capacity: undefined,
    airSuspension: false,
    loadFromBack: false,
    loadFromSide: false,
    loadFromTop: false,
    slidingRoof: false,
    edschaSlidingRoof: false,
    notes: '',
  };
}

function cleanForm(values: FormValues): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (v === '' || v === undefined || v === null) continue;
    if ((NUMERIC_FIELDS as readonly string[]).includes(k)) {
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(n)) continue;
      out[k] = n;
    } else {
      out[k] = v;
    }
  }
  return out;
}

function labelFor(key: string): string {
  switch (key) {
    case 'belts':
      return 'Pasy';
    case 'mats':
      return 'Maty';
    case 'airSuspension':
      return 'Zawieszenie pneum.';
    case 'loadFromBack':
      return 'Załadunek tył';
    case 'loadFromSide':
      return 'Załadunek bok';
    case 'loadFromTop':
      return 'Załadunek góra';
    case 'slidingRoof':
      return 'Dach przesuwany';
    case 'edschaSlidingRoof':
      return 'Dach Edscha';
    default:
      return key;
  }
}
