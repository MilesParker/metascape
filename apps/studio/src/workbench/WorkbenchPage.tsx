// SPDX-License-Identifier: EPL-2.0
import { useLoaderData, useNavigate } from '@tanstack/react-router';
import { ChevronDown, ChevronLeft, LogOut, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import { Group, Panel, Separator, type PanelImperativeHandle } from 'react-resizable-panels';
import { familyOf, modelById, pathPosition, shortName } from '../catalog';
import { useCommands, type Command } from '../lib/commands';
import { cn } from '../lib/cn';
import { readLocal, writeLocal } from '../lib/storage';
import { toast } from '../shell/toast';
import { TopBar } from '../shell/TopBar';
import { Button } from '../ui/button';
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tip,
} from '../ui/primitives';
import { AboutPanel } from './AboutPanel';
import { ChartDock, download, splitViews } from './ChartDock';
import { ParametersPanel } from './ParametersPanel';
import { RulesPanel } from './RulesPanel';
import { useSession, type Session } from './session';
import { agentTitle, InspectorBody, Stage } from './Stage';
import { useWorkbench, type RailTab } from './store';
import { Transport } from './Transport';
import { positionToSpeed, speedToPosition } from '@metascape/react';

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof matchMedia === 'function' && matchMedia(query).matches,
  );
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const list = matchMedia(query);
    const change = (): void => setMatches(list.matches);
    list.addEventListener('change', change);
    return () => list.removeEventListener('change', change);
  }, [query]);
  return matches;
}

/** The selected agent or cell, at the top of the side panel. */
function Inspector({ session }: { readonly session: Session }): ReactElement | null {
  const selection = useWorkbench((state) => state.selection);
  const select = useWorkbench((state) => state.select);
  if (selection?.root !== session.root) return null;
  return (
    <section
      aria-label="Inspector"
      className="max-h-[45%] shrink-0 overflow-auto border-b border-line px-3 py-2 scrollbar-thin"
    >
      <header className="mb-1 flex items-center gap-1">
        <h2 className="min-w-0 flex-1 truncate text-xs font-semibold">
          {agentTitle(selection.agent)}
        </h2>
        <Tip label="Close" keys="Esc">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close the inspector"
            onClick={() => select(undefined)}
          >
            <X />
          </Button>
        </Tip>
      </header>
      <InspectorBody session={session} agent={selection.agent} />
    </section>
  );
}

/** Parameters, Rules and About, with the inspector above them. */
function Rail({ session }: { readonly session: Session }): ReactElement {
  const tab = useWorkbench((state) => state.railTab);
  const setTab = useWorkbench((state) => state.setRailTab);
  const pending = session.parameters.pending.length;
  const changedRules = session.rules.customized;
  const body = useRef<HTMLDivElement>(null);

  // A new model starts at the top of each tab, whatever the router restores.
  useLayoutEffect(() => {
    const reset = (): void => {
      body.current?.querySelectorAll<HTMLElement>('[data-rail-scroll]').forEach((element) => {
        element.scrollTop = 0;
      });
    };
    reset();
    const frame = requestAnimationFrame(reset);
    return () => cancelAnimationFrame(frame);
  }, [session.entry.id, tab]);

  return (
    <aside
      ref={body}
      aria-label="Model controls"
      className="flex h-full min-h-0 flex-col border-l border-line bg-panel"
    >
      <Inspector session={session} />
      <Tabs
        value={tab}
        onValueChange={(next) => setTab(next as RailTab)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line px-2">
          <TabsList aria-label="Model controls">
            <TabsTrigger value="about">About</TabsTrigger>
            <TabsTrigger value="parameters">
              Parameters
              {pending > 0 && (
                <span
                  className="size-1.5 rounded-full bg-warn"
                  aria-label={`${pending} waiting for a restart`}
                />
              )}
            </TabsTrigger>
            <TabsTrigger value="rules">
              Rules
              {changedRules && (
                <span className="size-1.5 rounded-full bg-accent" aria-label="changed" />
              )}
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="about" className="min-h-0 flex-1 outline-none">
          <AboutPanel session={session} />
        </TabsContent>
        <TabsContent value="parameters" className="min-h-0 flex-1 outline-none">
          <ParametersPanel
            controller={session.parameters}
            runs={
              session.runs.length > 0
                ? {
                    names: session.runs.map((setup) => setup.name),
                    current: session.run,
                    choose: session.chooseRun,
                  }
                : undefined
            }
          />
        </TabsContent>
        <TabsContent value="rules" className="min-h-0 flex-1 outline-none">
          <RulesPanel controller={session.rules} />
        </TabsContent>
      </Tabs>
    </aside>
  );
}

/** The model's name, as a menu of the other models in its family. */
function ModelMenu({ session }: { readonly session: Session }): ReactElement {
  const { entry } = session;
  const family = familyOf(entry);
  const position = pathPosition(entry);
  const navigate = useNavigate();
  return (
    <div className="flex min-w-0 items-center gap-1">
      <span className="h-5 w-px bg-line" aria-hidden="true" />
      <Menu>
        <MenuTrigger asChild>
          <button
            type="button"
            className="flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-[13px] hover:bg-panel"
          >
            {family.models.length > 1 && (
              <span className="hidden max-w-[18ch] truncate text-muted lg:inline">
                {family.name}
                <span className="text-faint"> /</span>
              </span>
            )}
            <h1 className="min-w-0 truncate font-semibold">
              {family.models.length > 1 ? shortName(entry) : entry.name}
            </h1>
            {position && (
              <span className="font-mono text-2xs text-faint tnum">
                {position.index + 1}/{position.count}
              </span>
            )}
            <ChevronDown className="size-3.5 shrink-0 text-faint" />
          </button>
        </MenuTrigger>
        <MenuContent align="start" className="max-h-[70vh] w-[min(92vw,380px)] overflow-auto">
          {family.models.length > 1 &&
            family.models.map((id, i) => {
              const model = modelById(id)!;
              const current = id === entry.id;
              return (
                <MenuItem
                  key={id}
                  aria-current={current ? 'page' : undefined}
                  className={cn('items-start', current && 'bg-accent-soft')}
                  onSelect={() =>
                    void navigate({ to: '/models/$modelId', params: { modelId: id }, search: {} })
                  }
                >
                  {family.path && (
                    <span className="w-5 shrink-0 pt-px text-right font-mono text-2xs text-faint tnum">
                      {i + 1}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{shortName(model)}</span>
                    <span className="line-clamp-2 text-2xs text-muted">{model.summary}</span>
                  </span>
                </MenuItem>
              );
            })}
          {family.models.length > 1 && <MenuSeparator />}
          <MenuItem onSelect={() => void navigate({ to: '/', search: {} })}>Library</MenuItem>
        </MenuContent>
      </Menu>
    </div>
  );
}

function copyLink(): void {
  void navigator.clipboard
    ?.writeText(window.location.href)
    .then(() => toast('Link copied'))
    .catch(() => toast('Copy failed; use the address bar', 'info'));
}

function saveImage(session: Session): void {
  // The first view shown; one shown alone when the user chose one.
  const canvas = document.querySelector<HTMLCanvasElement>('[data-stage] canvas');
  if (!canvas) {
    toast('No image to save', 'info');
    return;
  }
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const context = out.getContext('2d');
  if (!context) return;
  context.fillStyle = getComputedStyle(canvas).getPropertyValue('--stage') || '#111';
  context.fillRect(0, 0, out.width, out.height);
  context.drawImage(canvas, 0, 0);
  out.toBlob((blob) => {
    if (blob) download(`${session.entry.id}-${session.root.period}.png`, blob);
  });
}

function ExportMenu({ session }: { readonly session: Session }): ReactElement {
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="ghost" size="sm">
          Export
        </Button>
      </MenuTrigger>
      <MenuContent align="end">
        <MenuItem onSelect={copyLink}>Copy link</MenuItem>
        <MenuItem onSelect={() => saveImage(session)}>Image (PNG)</MenuItem>
        <MenuItem
          onSelect={() => download(`${session.entry.id}-data.csv`, session.root.data.toCSV())}
        >
          Data (CSV)
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

/** Keyboard and palette commands of the Workbench. */
function useWorkbenchCommands(session: Session, toggleRail: () => void): void {
  const { runner, entry } = session;
  const navigate = useNavigate();
  const position = pathPosition(entry);
  const running = session.snapshot.state === 'running';
  const speedBy = (steps: number): void => {
    const next = Math.max(0, Math.min(100, speedToPosition(runner.iterationsPerSecond) + steps));
    runner.setSpeed(positionToSpeed(next));
  };
  const commands: Command[] = [
    {
      id: 'play',
      label: running ? 'Pause' : 'Play',
      group: 'Run',
      keys: 'space',
      enabled: session.snapshot.state !== 'stopped',
      run: () => (running ? runner.pause() : runner.start()),
    },
    { id: 'step', label: 'Step', group: 'Run', keys: '.', run: () => runner.step() },
    {
      id: 'step-arrow',
      label: 'Step',
      group: 'Run',
      keys: 'arrowright',
      hidden: true,
      run: () => runner.step(),
    },
    { id: 'restart', label: 'Restart', group: 'Run', keys: 'r', run: session.restart },
    {
      id: 'reseed',
      label: 'Restart with a new seed',
      group: 'Run',
      keys: 'shift+r',
      run: () => session.reseed(),
    },
    {
      id: 'apply',
      label: 'Apply changes',
      group: 'Run',
      keys: 'mod+enter',
      enabled: session.parameters.pending.length > 0,
      run: () => void session.apply(),
    },
    { id: 'slower', label: 'Slower', group: 'Run', keys: '[', run: () => speedBy(-10) },
    { id: 'faster', label: 'Faster', group: 'Run', keys: ']', run: () => speedBy(10) },
    {
      id: 'present',
      label: session.present ? 'Stop presenting' : 'Present',
      group: 'View',
      keys: 'shift+p',
      keywords: 'projector teach',
      run: () => session.setPresent(!session.present),
    },
    { id: 'rail', label: 'Side panel', group: 'View', keys: 'b', run: toggleRail },
    {
      id: 'fullscreen',
      label: 'Full screen',
      group: 'View',
      keys: 'f',
      run: () => void document.querySelector<HTMLElement>('[data-stage]')?.requestFullscreen?.(),
    },
    {
      id: 'escape',
      label: 'Clear selection',
      group: 'View',
      keys: 'escape',
      hidden: true,
      run: () => {
        const state = useWorkbench.getState();
        if (state.selection) state.select(undefined);
        else if (session.present) session.setPresent(false);
      },
    },
    {
      id: 'tab-about',
      label: 'About',
      group: 'View',
      keys: 'i',
      run: () => useWorkbench.getState().setRailTab('about'),
    },
    {
      id: 'tab-parameters',
      label: 'Parameters',
      group: 'View',
      keys: 'p',
      run: () => useWorkbench.getState().setRailTab('parameters'),
    },
    {
      id: 'tab-rules',
      label: 'Rules',
      group: 'View',
      keys: 'u',
      run: () => useWorkbench.getState().setRailTab('rules'),
    },
    { id: 'share', label: 'Copy link', group: 'Export', keys: 'shift+c', run: copyLink },
    { id: 'export-image', label: 'Image (PNG)', group: 'Export', run: () => saveImage(session) },
    {
      id: 'export-csv',
      label: 'Data (CSV)',
      group: 'Export',
      run: () => download(`${entry.id}-data.csv`, session.root.data.toCSV()),
    },
  ];
  if (position?.previous) {
    const id = position.previous.id;
    commands.push({
      id: 'previous',
      label: `Previous: ${shortName(position.previous)}`,
      group: 'Models',
      keys: 'shift+arrowleft',
      run: () => void navigate({ to: '/models/$modelId', params: { modelId: id }, search: {} }),
    });
  }
  if (position?.next) {
    const id = position.next.id;
    commands.push({
      id: 'next',
      label: `Next: ${shortName(position.next)}`,
      group: 'Models',
      keys: 'shift+arrowright',
      run: () => void navigate({ to: '/models/$modelId', params: { modelId: id }, search: {} }),
    });
  }
  useCommands(commands);
}

/** The thin strip a collapsed side panel leaves, which opens it again. */
function RailStrip({ onOpen }: { readonly onOpen: () => void }): ReactElement {
  return (
    <Tip label="Show panel" keys="B" side="left">
      <button
        type="button"
        onClick={onOpen}
        aria-label="Show panel"
        className="flex h-full w-full items-center justify-center border-l border-line bg-panel text-faint hover:bg-line/50 hover:text-fg"
      >
        <ChevronLeft className="size-4" />
      </button>
    </Tip>
  );
}

const RAIL_STRIP = 20;

/**
 * The share of the main area the world gets at first: enough for the
 * largest square the height allows, the rest going to the charts.
 */
function worldShare(sideBySide: boolean): number {
  if (typeof window === 'undefined') return 60;
  const main = { width: window.innerWidth - 340, height: window.innerHeight - 48 };
  // The run controls and the view's title take about 80 px under and over the world.
  const share = sideBySide
    ? ((main.height - 80) / main.width) * 100
    : ((main.width * 0.9 + 80) / main.height) * 100;
  return Math.round(Math.max(35, Math.min(75, share)));
}

function Workbench({ session }: { readonly session: Session }): ReactElement {
  const { entry, present } = session;
  const wide = useMediaQuery('(min-width: 900px)');
  const landscape = useMediaQuery('(min-aspect-ratio: 5/4)');
  const railRef = useRef<PanelImperativeHandle | null>(null);
  const dockRef = useRef<PanelImperativeHandle | null>(null);
  const selection = useWorkbench((state) => state.selection);
  const [railOpen, setRailOpen] = useState(true);
  const hasDock =
    splitViews(session.root.allViews).charts.length > 0 || session.charts.added.length > 0;
  const sideBySide = landscape;
  const layoutKey = `layout:${entry.id}:${sideBySide ? 'beside' : 'below'}`;
  const saved = readLocal<{ dock?: number; rail?: number } | undefined>(layoutKey, undefined);

  // Presenting hides the side panel and the charts; leaving brings them back.
  useEffect(() => {
    if (present) {
      railRef.current?.collapse();
      dockRef.current?.collapse();
    } else {
      railRef.current?.expand();
      dockRef.current?.expand();
    }
  }, [present]);

  // A selection shows in the side panel, so open it.
  useEffect(() => {
    if (selection && !present && railRef.current?.isCollapsed()) railRef.current.expand();
  }, [selection, present]);

  const toggleRail = (): void => {
    if (!wide) return;
    if (railRef.current?.isCollapsed()) railRef.current.expand();
    else railRef.current?.collapse();
  };
  useWorkbenchCommands(session, toggleRail);

  const remember = (key: 'dock' | 'rail', value: number): void => {
    if (present) return;
    writeLocal(layoutKey, { ...readLocal<Record<string, number>>(layoutKey, {}), [key]: value });
  };

  const header = present ? (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-line bg-bg px-4">
      <h1 className="min-w-0 flex-1 truncate text-base font-semibold">{entry.name}</h1>
      <Button size="sm" onClick={() => session.setPresent(false)}>
        <LogOut /> Stop presenting <span className="text-faint">Esc</span>
      </Button>
    </header>
  ) : (
    <TopBar
      actions={
        <>
          <ExportMenu session={session} />
          {wide && (
            <Tip label="Hide everything but the model" keys="⇧P">
              <Button variant="ghost" size="sm" onClick={() => session.setPresent(true)}>
                Present
              </Button>
            </Tip>
          )}
        </>
      }
    >
      <ModelMenu session={session} />
    </TopBar>
  );

  const stageColumn = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        <Stage session={session} />
      </div>
      <Transport session={session} large={present} />
    </div>
  );

  if (!wide) {
    // Phones and narrow windows: the world, its run controls, then charts and the panel below.
    return (
      <div className="flex min-h-full flex-col">
        {header}
        <div className="h-[min(100vw+80px,70vh)] min-h-[320px] shrink-0">{stageColumn}</div>
        {hasDock && (
          <div className="h-[420px] shrink-0 border-t border-line">
            <ChartDock session={session} />
          </div>
        )}
        <div className="h-[80vh] shrink-0">
          <Rail session={session} />
        </div>
      </div>
    );
  }

  const separator = (vertical: boolean): ReactElement => (
    <Separator
      className={cn(
        'bg-line transition-colors hover:bg-accent data-[separator=active]:bg-accent',
        vertical ? 'w-1' : 'h-1',
      )}
    />
  );

  return (
    <div className={cn('flex h-full flex-col', present && 'text-[15px]')}>
      {header}
      <Group orientation="horizontal" className="min-h-0 flex-1" id={`wb-h-${entry.id}`}>
        <Panel id="main" minSize="45%">
          {hasDock ? (
            <Group
              key={sideBySide ? 'beside' : 'below'}
              orientation={sideBySide ? 'horizontal' : 'vertical'}
              id={`wb-main-${entry.id}-${sideBySide ? 'beside' : 'below'}`}
            >
              <Panel id="stage" minSize="25%">
                {stageColumn}
              </Panel>
              {separator(sideBySide)}
              <Panel
                id="dock"
                panelRef={dockRef}
                collapsible
                collapsedSize="0%"
                defaultSize={`${saved?.dock ?? 100 - worldShare(sideBySide)}%`}
                minSize="15%"
                onResize={(size) => {
                  if (size.asPercentage > 0) remember('dock', Math.round(size.asPercentage));
                }}
              >
                <ChartDock session={session} />
              </Panel>
            </Group>
          ) : (
            stageColumn
          )}
        </Panel>
        {separator(true)}
        <Panel
          id="rail"
          panelRef={railRef}
          collapsible
          collapsedSize={`${RAIL_STRIP}px`}
          defaultSize={present ? `${RAIL_STRIP}px` : `${saved?.rail ?? 340}px`}
          minSize="260px"
          maxSize="45%"
          onResize={(size) => {
            const open = size.inPixels > RAIL_STRIP + 1;
            setRailOpen(open);
            if (open) remember('rail', Math.round(size.inPixels));
          }}
        >
          {railOpen ? (
            <Rail session={session} />
          ) : (
            <RailStrip onOpen={() => railRef.current?.expand()} />
          )}
        </Panel>
      </Group>
    </div>
  );
}

/** The Workbench for one model: loaded by the route, run by a session. */
export function WorkbenchPage(): ReactElement {
  const { entry, model } = useLoaderData({ from: '/models/$modelId' });
  // A fresh session for each model.
  return <WorkbenchFor key={entry.id} entry={entry} model={model} />;
}

function WorkbenchFor({
  entry,
  model,
}: {
  readonly entry: Parameters<typeof useSession>[0];
  readonly model: Parameters<typeof useSession>[1];
}): ReactElement {
  const reset = useWorkbench((state) => state.reset);
  useEffect(() => {
    reset();
    document.title = `${entry.name} · Metascape Studio`;
    return () => {
      document.title = 'Metascape Studio';
    };
  }, [entry, reset]);
  const session = useSession(entry, model);
  return <Workbench session={session} />;
}
