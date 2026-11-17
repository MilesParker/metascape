// SPDX-License-Identifier: EPL-2.0
import type { Parameter } from '@metascape/engine';
import {
  formatNumber,
  groupParameters,
  humanize,
  rangePairs,
  type ParameterController,
  type ParameterInput,
} from '@metascape/react';
import { RotateCcw, Search } from 'lucide-react';
import { useId, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Button } from '../ui/button';
import { Input, Segmented, Slider, Switch, Tip } from '../ui/primitives';

const labelOf = (name: string, parameter: Parameter): string => parameter.label ?? humanize(name);

/** A tidy slider step for a real range: 1, 2 or 5 times a power of ten, about a hundredth of it. */
function niceStep(span: number): number {
  const raw = span / 100;
  if (!(raw > 0)) return 0.01;
  const power = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / power;
  return (unit < 2 ? 1 : unit < 5 ? 2 : 5) * power;
}

function stepOf(parameter: Parameter): number {
  if (parameter.type !== 'int' && parameter.type !== 'real') return 1;
  if (parameter.step !== undefined) return parameter.step;
  if (parameter.type === 'int') return 1;
  return parameter.min !== undefined && parameter.max !== undefined
    ? niceStep(parameter.max - parameter.min)
    : 0.01;
}

/** Characters the widest value of a numeric parameter takes. */
function digits(parameter: Parameter): number | undefined {
  if (parameter.type !== 'int' && parameter.type !== 'real') return undefined;
  const ends = [parameter.min, parameter.max, parameter.default].filter(
    (v): v is number => typeof v === 'number',
  );
  return ends.length > 0 ? Math.max(...ends.map((v) => String(v).length)) : undefined;
}

const RANGE_WORDS =
  /\b(min(imum)?|max(imum)?|lowest|highest|smallest|largest|least|most|lower|upper)\b/gi;

/**
 * One description for a minimum and maximum shown as a range: a shared
 * description once; otherwise the lower end's, when the two differ only in
 * which end they describe; otherwise none, since the label says enough.
 */
export function rangeDescription(
  low: string | undefined,
  high: string | undefined,
): string | undefined {
  if (!low || !high) return low ?? high;
  if (low.trim() === high.trim()) return low;
  const core = (text: string): string =>
    text.replace(RANGE_WORDS, '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (core(low) === core(high)) return core(low).split(' ').length > 3 ? low : undefined;
  return undefined;
}

/** A number field that commits on Enter or leaving it, and shows the engine's complaint. */
function NumberField({
  id,
  value,
  integer,
  label,
  onCommit,
  invalid,
  describedBy,
  className,
  chars,
}: {
  readonly id?: string;
  readonly value: number;
  readonly integer: boolean;
  readonly label?: string;
  readonly onCommit: (value: number) => void;
  readonly invalid: boolean;
  readonly describedBy?: string | undefined;
  readonly className?: string;
  /** Characters the box must hold, such as the longest value the parameter allows. */
  readonly chars?: number | undefined;
}): ReactElement {
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const shown = draft ?? String(value);
  const width = Math.max(chars ?? 0, shown.length, 3) + 2.5;
  const commit = (): void => {
    if (draft === undefined) return;
    const parsed = draft.trim() === '' ? Number.NaN : Number(draft);
    if (Number.isFinite(parsed)) onCommit(parsed);
    setDraft(undefined);
  };
  return (
    <Input
      id={id}
      aria-label={label}
      inputMode={integer ? 'numeric' : 'decimal'}
      value={shown}
      style={{ width: `${width}ch` }}
      aria-invalid={invalid || (draft !== undefined && !Number.isFinite(Number(draft)))}
      aria-describedby={describedBy}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit();
        if (event.key === 'Escape') setDraft(undefined);
      }}
      className={cn('h-6 px-1.5 text-right font-mono text-xs tnum', className)}
    />
  );
}

function FieldShell({
  id,
  label,
  changed,
  onReset,
  defaultText,
  description,
  error,
  control,
  value,
  unit,
}: {
  readonly id: string;
  readonly label: string;
  readonly changed: boolean;
  readonly onReset: () => void;
  readonly defaultText: string;
  readonly description: string | undefined;
  readonly error: string | undefined;
  readonly control?: ReactNode;
  readonly value: ReactNode;
  readonly unit?: string | undefined;
}): ReactElement {
  const hint = [description, changed ? `Default ${defaultText}.` : undefined]
    .filter(Boolean)
    .join(' ');
  const name = (
    <label htmlFor={id} className="min-w-0 flex-1 truncate text-[13px]">
      {label}
    </label>
  );
  return (
    <div className="group/field py-1.5" data-changed={changed || undefined}>
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className={cn('size-1.5 shrink-0 rounded-full', changed ? 'bg-accent' : 'bg-transparent')}
        />
        {hint ? (
          <Tip label={hint} side="left">
            {name}
          </Tip>
        ) : (
          name
        )}
        {changed && (
          <Tip label={`Reset to ${defaultText}`}>
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-6"
              aria-label={`Reset ${label} to ${defaultText}`}
              onClick={onReset}
            >
              <RotateCcw className="!size-3" />
            </Button>
          </Tip>
        )}
        {value}
        {unit && <span className="text-2xs text-faint">{unit}</span>}
      </div>
      {control && <div className="mt-1 pl-3">{control}</div>}
      {error ? (
        <p id={`${id}-hint`} className="mt-1 pl-3 text-2xs leading-snug text-danger">
          {error}
        </p>
      ) : (
        hint && (
          // Shown while the field has focus, for those not using a mouse.
          <p
            id={`${id}-hint`}
            className="mt-1 hidden pl-3 text-2xs leading-snug text-faint group-focus-within/field:block"
          >
            {hint}
          </p>
        )
      )}
    </div>
  );
}

function ParameterField({
  name,
  controller,
}: {
  readonly name: string;
  readonly controller: ParameterController;
}): ReactElement {
  const id = useId();
  const parameter = controller.schema[name]!;
  const value = controller.values[name]!;
  const fallback = controller.defaults[name]!;
  const label = labelOf(name, parameter);
  const changed = controller.changed.includes(name);
  const error = controller.errors[name];
  const set = (next: ParameterInput): void => void controller.set(name, next);
  const shell = {
    id,
    label,
    changed,
    onReset: () => controller.reset(name),
    defaultText: typeof fallback === 'number' ? formatNumber(fallback) : String(fallback),
    description: parameter.description,
    error,
    unit: parameter.unit,
  };

  if (parameter.type === 'boolean') {
    return (
      <FieldShell
        {...shell}
        defaultText={fallback ? 'on' : 'off'}
        value={
          <Switch
            id={id}
            checked={value === true}
            onCheckedChange={(on) => set(on)}
            aria-describedby={`${id}-hint`}
          />
        }
      />
    );
  }
  if (parameter.type === 'choice') {
    const short = parameter.options.length <= 4 && parameter.options.every((o) => o.length <= 12);
    return (
      <FieldShell
        {...shell}
        value={
          short ? null : (
            <select
              id={id}
              value={String(value)}
              onChange={(event) => set(event.target.value)}
              className="h-7 max-w-[55%] rounded-md border border-line bg-surface px-1.5 text-xs"
            >
              {parameter.options.map((option) => (
                <option key={option} value={option}>
                  {humanize(option)}
                </option>
              ))}
            </select>
          )
        }
        control={
          short ? (
            <Segmented
              label={label}
              value={String(value)}
              onChange={(next) => set(next)}
              options={parameter.options.map((o) => ({ value: o, label: humanize(o) }))}
            />
          ) : undefined
        }
      />
    );
  }
  if (parameter.type === 'text') {
    return (
      <FieldShell
        {...shell}
        value={null}
        control={
          <Input
            id={id}
            value={String(value)}
            onChange={(event) => set(event.target.value)}
            className="h-7 text-xs"
          />
        }
      />
    );
  }
  const integer = parameter.type === 'int';
  const ranged = parameter.min !== undefined && parameter.max !== undefined;
  return (
    <FieldShell
      {...shell}
      value={
        <NumberField
          id={id}
          value={Number(value)}
          integer={integer}
          chars={digits(parameter)}
          invalid={error !== undefined}
          describedBy={`${id}-hint`}
          onCommit={(n) => set(n)}
        />
      }
      control={
        ranged ? (
          <Slider
            min={parameter.min}
            max={parameter.max}
            step={stepOf(parameter)}
            value={[Number(value)]}
            thumbLabels={[`${label} slider`]}
            marks={[
              { value: Number(fallback), label: `Default ${formatNumber(Number(fallback))}` },
            ]}
            onValueChange={([next]) => {
              if (next !== undefined)
                set(integer ? Math.round(next) : Number(next.toPrecision(10)));
            }}
          />
        ) : undefined
      }
    />
  );
}

/** A minimum and maximum parameter shown as one range with two thumbs. */
function RangeField({
  low,
  high,
  quantity,
  controller,
}: {
  readonly low: string;
  readonly high: string;
  readonly quantity: string;
  readonly controller: ParameterController;
}): ReactElement {
  const id = useId();
  const lowParameter = controller.schema[low]!;
  const highParameter = controller.schema[high]!;
  const a = Number(controller.values[low]);
  const b = Number(controller.values[high]);
  const integer = lowParameter.type === 'int';
  const min = 'min' in lowParameter ? lowParameter.min : undefined;
  const max = 'max' in highParameter ? highParameter.max : undefined;
  const bounded = min !== undefined && max !== undefined;
  const changed = controller.changed.includes(low) || controller.changed.includes(high);
  const label =
    humanize(quantity) || `${labelOf(low, lowParameter)} – ${labelOf(high, highParameter)}`;
  const error = controller.errors[low] ?? controller.errors[high];
  const set = (lowValue: number, highValue: number): void => {
    // Move the end that keeps the pair valid first.
    if (lowValue > Number(controller.values[high])) {
      controller.set(high, highValue);
      controller.set(low, lowValue);
    } else {
      controller.set(low, lowValue);
      controller.set(high, highValue);
    }
  };
  return (
    <FieldShell
      id={id}
      label={label}
      changed={changed}
      onReset={() => {
        controller.reset(low);
        controller.reset(high);
      }}
      defaultText={`${formatNumber(Number(controller.defaults[low]))}–${formatNumber(Number(controller.defaults[high]))}`}
      description={rangeDescription(lowParameter.description, highParameter.description)}
      error={error}
      unit={lowParameter.unit}
      value={
        <span className="flex items-center gap-1">
          <NumberField
            id={id}
            label={labelOf(low, lowParameter)}
            value={a}
            integer={integer}
            chars={digits(lowParameter)}
            invalid={false}
            onCommit={(n) => set(n, b)}
          />
          <span className="text-faint">–</span>
          <NumberField
            label={labelOf(high, highParameter)}
            value={b}
            integer={integer}
            chars={digits(highParameter)}
            invalid={false}
            onCommit={(n) => set(a, n)}
          />
        </span>
      }
      control={
        bounded ? (
          <Slider
            min={min}
            max={max}
            step={stepOf(lowParameter)}
            minStepsBetweenThumbs={0}
            value={[a, b]}
            thumbLabels={[labelOf(low, lowParameter), labelOf(high, highParameter)]}
            onValueChange={([x, y]) => {
              if (x === undefined || y === undefined) return;
              const round = (v: number): number =>
                integer ? Math.round(v) : Number(v.toPrecision(10));
              set(round(x), round(y));
            }}
          />
        ) : undefined
      }
    />
  );
}

/** Lists longer than this get a filter box. */
const LONG_LIST = 12;

type Item =
  { kind: 'one'; name: string } | { kind: 'range'; low: string; high: string; quantity: string };

function Section({
  title,
  hint,
  items,
  controller,
}: {
  readonly title: string;
  readonly hint: string;
  readonly items: readonly { group: string | undefined; items: Item[] }[];
  readonly controller: ParameterController;
}): ReactElement | null {
  if (items.every((g) => g.items.length === 0)) return null;
  return (
    <section className="px-3 pb-2">
      <h3 className="sticky top-0 z-[1] -mx-3 flex items-baseline gap-2 bg-panel/95 px-3 pt-3 pb-1 backdrop-blur">
        <span className="text-xs font-semibold">{title}</span>
        <span className="text-2xs text-faint">{hint}</span>
      </h3>
      {items.map(({ group, items: groupItems }) =>
        groupItems.length === 0 ? null : (
          <div key={group ?? ''} className="divide-y divide-line/60">
            {group && (
              <h4 className="pt-3 pb-0.5 text-2xs font-medium tracking-wide text-faint uppercase">
                {group}
              </h4>
            )}
            {groupItems.map((item) =>
              item.kind === 'one' ? (
                <ParameterField key={item.name} name={item.name} controller={controller} />
              ) : (
                <RangeField key={item.low} {...item} controller={controller} />
              ),
            )}
          </div>
        ),
      )}
    </section>
  );
}

/**
 * The model's parameters: those that change live first, then those that
 * shape the world when it is built (collected into one restart beside the
 * transport). Grouped, filterable, with defaults marked and every change
 * resettable.
 */
/** The model's runs, to choose one from. */
export interface RunChoice {
  readonly names: readonly string[];
  /** Undefined for the model's defaults. */
  readonly current: string | undefined;
  readonly choose: (name: string | undefined) => void;
}

export function ParametersPanel({
  controller,
  runs,
}: {
  readonly controller: ParameterController;
  readonly runs?: RunChoice | undefined;
}): ReactElement {
  const [filter, setFilter] = useState('');
  const names = Object.keys(controller.schema);
  const pairs = useMemo(() => rangePairs(controller.schema), [controller.schema]);
  const groups = useMemo(() => groupParameters(controller.schema), [controller.schema]);
  if (names.length === 0) {
    return <p className="p-4 text-muted">No parameters.</p>;
  }
  const query = filter.trim().toLowerCase();
  const matches = (name: string): boolean => {
    if (!query) return true;
    const p = controller.schema[name]!;
    return `${name} ${p.label ?? ''} ${humanize(name)} ${p.description ?? ''} ${p.group ?? ''}`
      .toLowerCase()
      .includes(query);
  };
  const paired = new Map<string, (typeof pairs)[number]>();
  for (const pair of pairs) {
    paired.set(pair.low, pair);
    paired.set(pair.high, pair);
  }
  const itemsFor = (live: boolean) =>
    groups.map(({ group, names: groupNames }) => {
      const items: Item[] = [];
      for (const name of groupNames) {
        if (controller.isLive(name) !== live) continue;
        const pair = paired.get(name);
        if (pair && controller.isLive(pair.low) === controller.isLive(pair.high)) {
          // A pair shows once, where its lower end is.
          if (name === pair.low && (matches(pair.low) || matches(pair.high))) {
            items.push({ kind: 'range', ...pair });
          }
          continue;
        }
        if (matches(name)) items.push({ kind: 'one', name });
      }
      return { group, items };
    });

  return (
    <div className="flex h-full min-h-0 flex-col">
      {(runs || names.length > LONG_LIST || controller.changed.length > 0) && (
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
          {runs && (
            <select
              aria-label="Run"
              value={runs.current ?? ''}
              onChange={(event) => runs.choose(event.target.value || undefined)}
              className="h-7 shrink-0 rounded-md border border-line bg-surface px-1.5 text-xs"
            >
              <option value="">Defaults</option>
              {runs.names.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          )}
          {names.length > LONG_LIST && (
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-faint" />
              <Input
                type="search"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Filter"
                aria-label="Filter parameters"
                className="h-7 pl-7 text-xs"
              />
            </div>
          )}
          {controller.changed.length > 0 && (
            <Button size="sm" variant="ghost" className="ml-auto" onClick={controller.resetAll}>
              <RotateCcw /> Reset {controller.changed.length}
            </Button>
          )}
        </div>
      )}
      <div data-rail-scroll className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <Section title="Live" hint="apply at once" items={itemsFor(true)} controller={controller} />
        <Section
          title={names.some((n) => controller.isLive(n)) ? 'World set-up' : 'Parameters'}
          hint="apply with a restart"
          items={itemsFor(false)}
          controller={controller}
        />
      </div>
    </div>
  );
}
