// SPDX-License-Identifier: EPL-2.0

/** The kinds of space a model shows, for filtering. */
export type SpaceKind = 'lattice' | 'strip' | 'plane' | 'network' | 'charts';

export const SPACE_LABELS: Readonly<Record<SpaceKind, string>> = {
  lattice: 'Lattice',
  strip: 'One-row lattice',
  plane: 'Continuous space',
  network: 'Network',
  charts: 'Charts only',
};

/** What the Library knows about a model without loading its code. */
export interface ManifestModel {
  /** Address form of the name, unique across the catalogue. */
  readonly id: string;
  readonly name: string;
  readonly familyId: string;
  /** One line for cards. */
  readonly summary: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly spaces: readonly SpaceKind[];
  readonly parameterCount: number;
  readonly ruleCount: number;
  readonly authors?: string;
  readonly portedFrom?: string;
  /** Pre-rendered picture of the model after a short run. */
  readonly thumb: {
    readonly file: string;
    readonly width: number;
    readonly height: number;
    /** Draw with crisp pixels (a lattice) rather than smoothed. */
    readonly pixelated: boolean;
  };
}

export interface ManifestFamily {
  readonly id: string;
  readonly name: string;
  readonly collection: string;
  readonly description?: string;
  readonly tags: readonly string[];
  /** Set when the models are steps to take in order. */
  readonly path?: 'tutorial' | 'book';
  /** Model ids, in the family's order. */
  readonly models: readonly string[];
}

export interface Manifest {
  readonly families: readonly ManifestFamily[];
  readonly models: readonly ManifestModel[];
}
