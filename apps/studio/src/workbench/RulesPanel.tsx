// SPDX-License-Identifier: EPL-2.0
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Array2D, ruleKey, type RuleSetting, type ScapeSettings } from '@metascape/engine';
import {
  isModelScape,
  needsRandomOrder,
  type RulesController,
  type ScapeRules,
} from '@metascape/react';
import { ChevronDown, GripVertical, RotateCcw } from 'lucide-react';
import { useState, type ReactElement, type ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Button } from '../ui/button';
import { Badge, Input, Segmented, Switch, Tip } from '../ui/primitives';

/** What a scape's members are called: cells on a lattice, agents elsewhere. */
function nounOf(scape: ScapeRules['scape']): { one: string; many: string } {
  return scape.space instanceof Array2D
    ? { one: 'cell', many: 'cells' }
    : { one: 'agent', many: 'agents' };
}

/**
 * A scape's execution settings as terse labels: "By agent · Shuffled · Complete tour".
 * `shuffled` says whether its selected rules ask for a random order.
 */
export function summarizeExecution(
  settings: ScapeSettings,
  noun: string,
  shuffled: boolean,
): string {
  const count = settings.agentsPerIteration;
  return [
    settings.executionOrder === 'byAgent' ? 'By agent' : 'By rule',
    shuffled ? 'Shuffled' : 'In order',
    ...(count === null ? [] : [`${count} ${noun} per iteration`]),
    settings.executionStyle === 'completeTour' ? 'Complete tour' : 'Repeated draw',
  ].join(' · ');
}

/** One labelled setting, its explanation in a tooltip. */
function Setting({
  label,
  hint,
  children,
}: {
  readonly label: string;
  readonly hint: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
      <Tip label={hint} side="left">
        <span className="font-medium">{label}</span>
      </Tip>
      {children}
    </div>
  );
}

function RuleRow({
  rule,
  index,
  position,
  was,
  description,
  twoPhase,
  noun,
  onToggle,
}: {
  readonly rule: RuleSetting;
  readonly index: number;
  /** Its place among the rules that run, or undefined when it is off. */
  readonly position: number | undefined;
  /** Its place in the model's own order, from 1, when it has moved. */
  readonly was: number | undefined;
  readonly description: string | undefined;
  readonly twoPhase: boolean;
  readonly noun: { one: string; many: string };
  readonly onToggle: (enabled: boolean) => void;
}): ReactElement {
  const key = ruleKey(rule);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: key,
  });
  const name = (
    <span
      className={cn(
        'min-w-0 flex-1 truncate text-[13px]',
        !rule.enabled && 'text-faint line-through',
      )}
    >
      {rule.name}
      {rule.occurrence > 0 && <span className="text-faint"> ({rule.occurrence + 1})</span>}
    </span>
  );
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group/rule relative flex items-center gap-2 rounded-md border bg-surface py-1 pr-2 pl-1 transition-[opacity,box-shadow]',
        isDragging ? 'z-10 border-accent shadow-pop' : 'border-line',
        !rule.enabled && 'border-dashed bg-transparent',
      )}
      data-rule-key={key}
    >
      <button
        type="button"
        className="flex h-6 w-5 cursor-grab touch-none items-center justify-center rounded text-faint hover:text-fg active:cursor-grabbing"
        aria-label={`Move ${rule.name}, now ${index + 1}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" />
      </button>
      <span
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-2xs tnum',
          rule.enabled ? 'bg-accent-soft text-accent' : 'text-faint',
        )}
        aria-hidden="true"
      >
        {position !== undefined ? position + 1 : '–'}
      </span>
      {description ? <Tip label={description}>{name}</Tip> : name}
      {was !== undefined && (
        <span className="shrink-0 font-mono text-2xs text-accent tnum">was {was}</span>
      )}
      {twoPhase && (
        <Tip
          label={`Two-phase: every ${noun.one} works out its next state, then all apply it together`}
        >
          <Badge>sync</Badge>
        </Tip>
      )}
      <Switch
        checked={rule.enabled}
        onCheckedChange={onToggle}
        aria-label={`${rule.name} ${rule.enabled ? 'on' : 'off'}`}
      />
    </li>
  );
}

/** A scape's rules in the order they run, to reorder and switch on and off. */
function RuleList({
  entry,
  controller,
  label,
}: {
  readonly entry: ScapeRules;
  readonly controller: RulesController;
  readonly label: string;
}): ReactElement {
  const { scape, settings, defaults } = entry;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const noun = nounOf(scape);
  const keys = settings.rules.map(ruleKey);
  const originalKeys = defaults?.rules.map(ruleKey);
  const entries = new Map(
    scape.rules.map((r) => [ruleKey({ name: r.rule.name, occurrence: r.occurrence }), r.rule]),
  );
  let running = 0;
  const positions = settings.rules.map((rule) => (rule.enabled ? running++ : undefined));
  const onDragEnd = (event: DragEndEvent): void => {
    const from = keys.indexOf(String(event.active.id));
    const to = event.over ? keys.indexOf(String(event.over.id)) : -1;
    if (from >= 0 && to >= 0 && from !== to) controller.move(scape.name, from, to);
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={keys} strategy={verticalListSortingStrategy}>
        <ol className="space-y-1 px-2" aria-label={label}>
          {settings.rules.map((rule, index) => {
            const definition = entries.get(ruleKey(rule));
            const original = originalKeys?.indexOf(ruleKey(rule)) ?? -1;
            return (
              <RuleRow
                key={ruleKey(rule)}
                rule={rule}
                index={index}
                position={positions[index]}
                was={original >= 0 && original !== index ? original + 1 : undefined}
                description={definition?.description}
                twoPhase={definition?.update !== undefined}
                noun={noun}
                onToggle={(enabled) => controller.toggle(scape.name, index, enabled)}
              />
            );
          })}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function ScapeCard({
  entry,
  controller,
}: {
  readonly entry: ScapeRules;
  readonly controller: RulesController;
}): ReactElement {
  const { scape, settings } = entry;
  const [open, setOpen] = useState(false);
  const [countText, setCountText] = useState<string | undefined>(undefined);
  const noun = nounOf(scape);
  const count = settings.agentsPerIteration;

  return (
    <section
      className="rounded-lg border border-line bg-panel"
      aria-label={`Rules of ${scape.name}`}
    >
      <header className="flex items-center gap-2 px-3 pt-2.5 pb-2">
        <h3 className="min-w-0 flex-1 truncate text-[13px] font-semibold">{scape.name}</h3>
        <span className="text-2xs text-faint tnum">
          {scape.size} {scape.size === 1 ? noun.one : noun.many}
        </span>
      </header>
      <RuleList
        entry={entry}
        controller={controller}
        label={`Rules of ${scape.name}, in the order they run`}
      />
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="mt-1 flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs text-muted hover:text-fg"
      >
        <ChevronDown
          className={cn('size-3.5 shrink-0 transition-transform', !open && '-rotate-90')}
        />
        <span className="min-w-0 truncate">
          {summarizeExecution(settings, noun.many, needsRandomOrder(scape))}
        </span>
      </button>
      {open && (
        <div className="space-y-2.5 border-t border-line px-3 py-3 text-xs">
          <Setting
            label="Execution order"
            hint={`By agent: each ${noun.one} runs all its rules before the next starts. By rule: each rule runs for every ${noun.one} before the next rule.`}
          >
            <Segmented
              label="Execution order"
              value={settings.executionOrder}
              onChange={(executionOrder) => controller.change(scape.name, { executionOrder })}
              options={[
                { value: 'byAgent', label: 'By agent' },
                { value: 'byRule', label: 'By rule' },
              ]}
            />
          </Setting>
          <Setting
            label={`${noun.many[0]!.toUpperCase()}${noun.many.slice(1)} per iteration`}
            hint={`How many ${noun.many} act each iteration. Empty: all of them.`}
          >
            <Input
              aria-label={`${noun.many} per iteration`}
              inputMode="numeric"
              placeholder="All"
              value={countText ?? (count === null ? '' : String(count))}
              onChange={(event) => {
                const text = event.target.value;
                setCountText(text);
                if (text.trim() === '') controller.change(scape.name, { agentsPerIteration: null });
                const n = Number(text);
                if (Number.isInteger(n) && n >= 1)
                  controller.change(scape.name, { agentsPerIteration: n });
              }}
              onBlur={() => setCountText(undefined)}
              className="h-6 w-20 text-right font-mono text-xs tnum"
            />
          </Setting>
          <Setting
            label="Execution style"
            hint={`Complete tour: each ${noun.one} acts at most once an iteration. Repeated draw: ${noun.many} are drawn at random, so one may act several times and another not at all.`}
          >
            <Segmented
              label="Execution style"
              value={settings.executionStyle}
              onChange={(executionStyle) => controller.change(scape.name, { executionStyle })}
              options={[
                { value: 'completeTour', label: 'Complete tour' },
                { value: 'repeatedDraw', label: 'Repeated draw' },
              ]}
            />
          </Setting>
        </div>
      )}
    </section>
  );
}

/**
 * What the model does as a whole, such as stopping or setting up: the rules of its
 * scapes with a singleton space, shown as the model's own rather than as scapes of
 * agents. There is nothing to execute across, so no execution settings.
 */
function ModelCard({
  entries,
  controller,
}: {
  readonly entries: readonly ScapeRules[];
  readonly controller: RulesController;
}): ReactElement {
  return (
    <section className="rounded-lg border border-line bg-panel" aria-label="Rules of the model">
      <header className="px-3 pt-2.5 pb-2">
        <h3 className="text-[13px] font-semibold">Model</h3>
      </header>
      <div className="space-y-2 pb-2">
        {entries.map((entry) => (
          <div key={entry.scape.name}>
            {entries.length > 1 && (
              <h4 className="px-3 pb-1 text-2xs text-faint">{entry.scape.name}</h4>
            )}
            <RuleList
              entry={entry}
              controller={controller}
              label={`Rules of the model${entries.length > 1 ? `, ${entry.scape.name},` : ''} in the order they run`}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Every scape's rules in the order they run, with its execution settings, then the
 * model's own rules.
 * Drag (or use the keyboard) to reorder and switch rules on and off; changes
 * apply at once and are kept for restarts until reset.
 */
export function RulesPanel({ controller }: { readonly controller: RulesController }): ReactElement {
  if (controller.scapes.length === 0) {
    return <p className="p-4 text-muted">No rules.</p>;
  }
  const ofModel = controller.scapes.filter((entry) => isModelScape(entry.scape));
  return (
    <div className="flex h-full min-h-0 flex-col">
      {controller.customized && (
        <div className="flex shrink-0 items-center justify-end border-b border-line px-3 py-1.5">
          <Button size="sm" variant="ghost" onClick={controller.reset}>
            <RotateCcw /> Reset
          </Button>
        </div>
      )}
      <div data-rail-scroll className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 scrollbar-thin">
        {controller.error && (
          <p role="alert" className="text-xs text-danger">
            {controller.error}
          </p>
        )}
        {controller.scapes
          .filter((entry) => !isModelScape(entry.scape))
          .map((entry) => (
            <ScapeCard key={entry.scape.name} entry={entry} controller={controller} />
          ))}
        {ofModel.length > 0 && <ModelCard entries={ofModel} controller={controller} />}
      </div>
    </div>
  );
}
