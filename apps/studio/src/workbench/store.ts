// SPDX-License-Identifier: EPL-2.0
import type { Agent, ScapeSettings, Simulation } from '@metascape/engine';
import type { GhostRun } from '@metascape/react';
import { create } from 'zustand';
import { readLocal, writeLocal } from '../lib/storage';

/** A change made while a run was going, marked on the charts. */
export interface Intervention {
  readonly tick: number;
  readonly label: string;
  readonly kind: 'parameter' | 'rule';
  /** What was changed, such as a parameter name; repeated changes to it close together merge. */
  readonly key?: string;
}

/** Changes to the same thing within this many ticks count as one, as when a slider is dragged. */
const MERGE_TICKS = 15;

export type RailTab = 'parameters' | 'rules' | 'about';

const RAIL_TABS: readonly RailTab[] = ['parameters', 'rules', 'about'];

interface Selection {
  readonly sim: Simulation;
  readonly agent: Agent;
}

interface Hover {
  readonly agent: Agent;
  /** The pointer, relative to the world's box. */
  readonly x: number;
  readonly y: number;
}

/** What a thing to try changed, so it can be undone. */
export interface Tried {
  readonly title: string;
  readonly parameters: Readonly<Record<string, number | string | boolean>>;
  readonly rules: Readonly<Record<string, ScapeSettings>>;
}

interface WorkbenchState {
  readonly selection: Selection | undefined;
  readonly hover: Hover | undefined;
  readonly interventions: readonly Intervention[];
  readonly ghost: GhostRun | undefined;
  readonly showGhost: boolean;
  readonly railTab: RailTab;
  /** A world view shown alone, by index among the world's views. */
  readonly focusView: number | undefined;
  /** The thing to try last applied, with the values it replaced. */
  readonly tried: Tried | undefined;

  select(selection: Selection | undefined): void;
  setHover(hover: Hover | undefined): void;
  addIntervention(intervention: Intervention): void;
  newRun(ghost: GhostRun | undefined): void;
  setShowGhost(show: boolean): void;
  setRailTab(tab: RailTab): void;
  setFocusView(index: number | undefined): void;
  setTried(tried: Tried | undefined): void;
  reset(): void;
}

/** About on a first visit, since it says what the model is; afterwards the tab last chosen. */
function rememberedTab(): RailTab {
  const tab = readLocal<string>('railTab', 'about');
  return RAIL_TABS.includes(tab as RailTab) ? (tab as RailTab) : 'about';
}

const initial = {
  selection: undefined,
  hover: undefined,
  interventions: [],
  ghost: undefined,
  showGhost: true,
  focusView: undefined,
  tried: undefined,
};

/** The Workbench's view state: selection, hover, marks and panels. */
export const useWorkbench = create<WorkbenchState>((set) => ({
  ...initial,
  railTab: rememberedTab(),
  select: (selection) => set({ selection }),
  setHover: (hover) => set({ hover }),
  addIntervention: (intervention) =>
    set((state) => {
      const last = state.interventions[state.interventions.length - 1];
      if (
        last &&
        intervention.key !== undefined &&
        last.key === intervention.key &&
        intervention.tick - last.tick <= MERGE_TICKS
      ) {
        return {
          interventions: [
            ...state.interventions.slice(0, -1),
            { ...intervention, tick: last.tick },
          ],
        };
      }
      return { interventions: [...state.interventions, intervention] };
    }),
  newRun: (ghost) =>
    set((state) => ({
      interventions: [],
      ghost: ghost ?? state.ghost,
      selection: undefined,
      hover: undefined,
    })),
  setShowGhost: (showGhost) => set({ showGhost }),
  setRailTab: (railTab) => {
    writeLocal('railTab', railTab);
    set({ railTab });
  },
  setFocusView: (focusView) => set({ focusView }),
  setTried: (tried) => set({ tried }),
  reset: () => set({ ...initial, railTab: rememberedTab() }),
}));
