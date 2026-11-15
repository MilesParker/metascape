// SPDX-License-Identifier: EPL-2.0
export {
  Array2D,
  Array2DMoore,
  Array2DVonNeumann,
  type Array2DOptions,
  type Metric,
  type Neighborhood,
  type WithinOptions,
} from './array2d';
export { Continuous2D, type Continuous2DOptions } from './continuous2d';
export { diffusion, type DiffusionOptions } from './diffusion';
export { Graph, type GraphOptions } from './graph';
export { connectRandom, connectRing, connectSmallWorld } from './graph-generators';
export { ListSpace, Singleton } from './list';
export { wireSmallWorld, type SmallWorldOptions } from './small-world';
export {
  Space,
  type Displacement,
  type Extent,
  type FindOptions,
  type Geometry,
  type Point,
  type SpaceSetup,
} from './space';
