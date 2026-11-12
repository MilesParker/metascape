// SPDX-License-Identifier: EPL-2.0
import {
  ContinuousScape,
  GridScape,
  Runner,
  ManualClock,
  ManualScheduler,
  runExperiment,
  Simulation,
  type Cell,
  type Occupant,
  type PointAgent,
} from '@metascape/engine';
import { describe, expect, it } from 'vitest';
import { compileModel } from './compile';
import { readAttribute } from './runtime';
import { ModelFormatError, type ModelSpec } from './schema';

const model = (spec: Omit<ModelSpec, 'schemaVersion' | 'name'>): ModelSpec => ({
  schemaVersion: 1,
  name: 'Test',
  ...spec,
});

describe('compileModel', () => {
  it('rejects an invalid model with its diagnostics', () => {
    const broken = model({ agents: { a: { attributes: { n: { type: 'int', initial: 'm' } } } } });
    expect(() => compileModel(broken)).toThrow(ModelFormatError);
  });

  it('maps parameters, spaces and agent types onto the engine', () => {
    const spec = model({
      parameters: {
        size: { type: 'int', default: 4, min: 1, max: 9, label: 'Size' },
        on: { type: 'boolean', default: true },
        mode: { type: 'choice', options: ['a', 'b'], default: 'b' },
        note: { type: 'text', default: 'hi' },
      },
      spaces: {
        land: { kind: 'grid', width: 'param.size', height: 3, wrap: false },
        room: { kind: 'continuous', width: 20, height: 10 },
        web: { kind: 'network', nodes: 'node', initial: { topology: 'ring', k: 1 } },
      },
      agents: {
        walker: { space: 'land', count: 2, order: 'sequential', schedule: 'byRule' },
        patch: { space: 'land', as: 'cell' },
        bird: { space: 'room', count: 3 },
        node: { count: 5 },
      },
    });
    const compiled = compileModel(spec);
    expect(compiled.parameters).toEqual({
      size: { type: 'int', default: 4, min: 1, max: 9, label: 'Size' },
      on: { type: 'boolean', default: true },
      mode: { type: 'choice', options: ['a', 'b'], default: 'b' },
      note: { type: 'text', default: 'hi' },
    });
    const sim = new Simulation(compiled, { seed: 1, parameters: { size: 6 } });
    expect(sim.scapes.map((scape) => scape.name)).toEqual(['walker', 'patch', 'bird', 'node']);
    const grid = sim.scape('patch') as GridScape;
    expect(grid).toBeInstanceOf(GridScape);
    expect([grid.width, grid.height, grid.wrap]).toEqual([6, 3, false]);
    expect(sim.scape('walker').order).toBe('sequential');
    expect(sim.scape('walker').schedule).toBe('byRule');
    expect(sim.scape('bird')).toBeInstanceOf(ContinuousScape);
    expect(sim.scape('node').size).toBe(5);
    // Occupants were placed on distinct cells, even though their grid is declared after them.
    const cells = (sim.scape('walker').members as readonly Occupant[]).map((w) => w.cell);
    expect(new Set(cells).size).toBe(2);
    expect(sim.views.map((view) => view.type)).toEqual(['grid', 'continuous', 'network']);
    const network = sim.views[2];
    if (network?.type !== 'network') throw new Error('expected a network view');
    expect(network.network.edgeCount).toBe(5);
    expect(sim.data.series.map((series) => series.id)).toEqual([
      'walker.count',
      'patch.count',
      'bird.count',
      'node.count',
    ]);
  });

  it('runs in a Runner and in experiments', () => {
    const compiled = compileModel(
      model({
        parameters: { n: { type: 'int', default: 3 } },
        agents: {
          a: {
            count: 'param.n',
            attributes: { v: { type: 'int', record: ['sum'] } },
            rules: [{ name: 'grow', do: [{ set: 'v', to: { op: 'add', args: ['v', 1] } }] }],
          },
        },
      }),
    );
    const runner = new Runner(compiled, {
      seed: 1,
      scheduler: new ManualScheduler(),
      clock: new ManualClock(),
    });
    runner.step();
    runner.step();
    expect(runner.sim.data.latest('a.v.sum')).toBe(6);
    const rows = runExperiment(compiled, {
      parameters: { n: [1, 2] },
      maxTicks: 4,
      measure: (sim) => ({ total: sim.data.latest('a.v.sum') }),
    });
    expect(rows.map((row) => row.total)).toEqual([4, 8]);
  });

  it('sets initial values in order, then create overrides, then initialize actions', () => {
    const spec = model({
      agents: {
        parent: {
          count: 1,
          rules: [
            {
              name: 'spawn',
              when: { op: 'eq', args: ['tick', 1] },
              do: [{ create: 'child', count: 2, set: { a: 5 } }],
            },
          ],
        },
        child: {
          count: 1,
          attributes: {
            a: { type: 'int', initial: 1 },
            b: { type: 'int', initial: { op: 'add', args: ['a', 1] } },
            c: { type: 'int' },
          },
          initialize: [
            { set: 'c', to: { op: 'mul', args: ['a', 'b'] } },
            { set: 'b', to: { op: 'mul', args: ['b', 10] } },
          ],
        },
      },
    });
    const sim = new Simulation(compileModel(spec), { seed: 1 });
    const children = () =>
      sim
        .scape('child')
        .members.map((child) => ['a', 'b', 'c'].map((n) => readAttribute(child, n)));
    expect(children()).toEqual([[1, 20, 2]]);
    sim.step();
    expect(children()).toEqual([
      [1, 20, 2],
      [5, 20, 10],
      [5, 20, 10],
    ]);
  });

  it('gives initial values access to self.x and self.y', () => {
    const spec = model({
      spaces: { land: { kind: 'grid', width: 3, height: 2 } },
      agents: {
        patch: {
          space: 'land',
          as: 'cell',
          attributes: {
            index: {
              type: 'int',
              initial: { op: 'add', args: [{ op: 'mul', args: ['self.y', 3] }, 'self.x'] },
            },
            double: { type: 'int', initial: { op: 'mul', args: ['index', 2] } },
          },
        },
      },
    });
    const sim = new Simulation(compileModel(spec), { seed: 1 });
    const cells = sim.scape('patch').members;
    expect(cells.map((cell) => readAttribute(cell, 'index'))).toEqual([0, 1, 2, 3, 4, 5]);
    expect(cells.map((cell) => readAttribute(cell, 'double'))).toEqual([0, 2, 4, 6, 8, 10]);
  });

  it('runs else when a with finds nothing, and binds the found agent otherwise', () => {
    const spec = model({
      agents: {
        seeker: {
          count: 1,
          attributes: { found: { type: 'int' }, missed: { type: 'int' } },
          rules: [
            {
              name: 'look',
              do: [
                {
                  with: { type: 'target', from: 'all', where: 't.visible', as: 't' },
                  do: [{ set: 'found', to: 't.id' }],
                  else: [{ set: 'missed', to: { op: 'add', args: ['missed', 1] } }],
                },
              ],
            },
          ],
        },
        target: {
          count: 3,
          attributes: { visible: { type: 'boolean', initial: { op: 'eq', args: ['self.id', 3] } } },
        },
      },
    });
    const sim = new Simulation(compileModel(spec), { seed: 1 });
    sim.step();
    const seeker = sim.scape('seeker').members[0]!;
    expect(readAttribute(seeker, 'found')).toBe(3);
    expect(readAttribute(seeker, 'missed')).toBe(0);
    for (const target of sim.scape('target').members) target.die();
    sim.step();
    expect(readAttribute(seeker, 'missed')).toBe(1);
  });

  it('applies synchronous sets after every agent has acted', () => {
    // Each cell takes its left neighbour's value: a rotation, whatever the order.
    const spec = model({
      spaces: { ring: { kind: 'grid', width: 5, height: 1, neighborhood: 'vonNeumann' } },
      agents: {
        slot: {
          space: 'ring',
          as: 'cell',
          attributes: { v: { type: 'int', initial: 'self.x' } },
          rules: [
            {
              name: 'shift',
              synchronous: true,
              do: [
                {
                  with: {
                    type: 'slot',
                    from: 'neighbors',
                    where: {
                      op: 'eq',
                      args: [
                        'other.x',
                        { op: 'mod', args: [{ op: 'sub', args: ['self.x', 1] }, 5] },
                      ],
                    },
                  },
                  do: [{ set: 'v', to: 'other.v' }],
                },
              ],
            },
          ],
        },
      },
    });
    const sim = new Simulation(compileModel(spec), { seed: 3 });
    sim.step();
    expect(sim.scape('slot').members.map((cell) => readAttribute(cell, 'v'))).toEqual([
      4, 0, 1, 2, 3,
    ]);
  });

  it('moves onto free cells only, or onto agents on a multi-occupancy grid', () => {
    const make = (multiOccupancy: boolean): ModelSpec =>
      model({
        spaces: { land: { kind: 'grid', width: 3, height: 3, multiOccupancy } },
        agents: {
          patch: { space: 'land', as: 'cell' },
          ant: {
            space: 'land',
            count: 8,
            rules: [
              {
                name: 'move',
                do: multiOccupancy
                  ? [{ moveTo: { type: 'ant', from: 'all' } }]
                  : [{ moveTo: { type: 'patch', from: 'all' } }],
              },
            ],
          },
        },
      });
    const single = new Simulation(compileModel(make(false)), { seed: 1 });
    single.run(10);
    const cells = single.scape('patch').members as readonly Cell[];
    expect(cells.filter((cell) => !cell.isAvailable)).toHaveLength(8);
    const multi = new Simulation(compileModel(make(true)), { seed: 1 });
    multi.run(30);
    const occupied = (multi.scape('patch').members as readonly Cell[]).filter(
      (c) => !c.isAvailable,
    );
    expect(occupied.length).toBeLessThan(8);
  });

  it('creates agents here and at random positions in a continuous space', () => {
    const spec = model({
      spaces: { room: { kind: 'continuous', width: 10, height: 10 } },
      agents: {
        mother: {
          space: 'room',
          count: 1,
          rules: [
            {
              name: 'birth',
              when: { op: 'eq', args: ['tick', 1] },
              do: [
                { create: 'baby', at: 'here' },
                { create: 'baby', count: 3 },
              ],
            },
          ],
        },
        baby: { space: 'room' },
      },
    });
    const sim = new Simulation(compileModel(spec), { seed: 1 });
    sim.step();
    const mother = sim.scape('mother').members[0] as PointAgent;
    const babies = sim.scape('baby').members as readonly PointAgent[];
    expect(babies).toHaveLength(4);
    expect([babies[0]!.x, babies[0]!.y]).toEqual([mother.x, mother.y]);
    expect(new Set(babies.map((baby) => baby.x)).size).toBe(4);
  });

  it('connects, disconnects and selects linked agents', () => {
    const spec = model({
      spaces: { web: { kind: 'network', nodes: 'node' } },
      agents: {
        node: {
          count: 4,
          schedule: 'byRule',
          attributes: { degree: { type: 'int', record: ['sum'] } },
          rules: [
            {
              name: 'link',
              when: { op: 'eq', args: ['tick', 1] },
              do: [
                {
                  forEach: { type: 'node', from: 'all' },
                  do: [{ connect: 'other', network: 'web' }],
                },
              ],
            },
            {
              name: 'unlink',
              when: {
                op: 'and',
                args: [
                  { op: 'eq', args: ['tick', 2] },
                  { op: 'eq', args: ['self.id', 0] },
                ],
              },
              do: [
                {
                  forEach: { type: 'node', from: 'linked', network: 'web' },
                  do: [{ disconnect: 'other', network: 'web' }],
                },
              ],
            },
            {
              name: 'count',
              do: [
                {
                  set: 'degree',
                  to: {
                    aggregate: 'count',
                    over: { type: 'node', from: 'linked', network: 'web' },
                  },
                },
              ],
            },
          ],
        },
      },
    });
    const sim = new Simulation(compileModel(spec), { seed: 1 });
    sim.step();
    expect(sim.data.latest('node.degree.sum')).toBe(12);
    sim.step();
    expect(sim.data.latest('node.degree.sum')).toBe(6);
  });

  it('evaluates stopWhen after every tick', () => {
    const spec = model({
      agents: { a: { count: 1 } },
      stopWhen: { op: 'ge', args: ['tick', 3] },
    });
    const sim = new Simulation(compileModel(spec), { seed: 1 });
    expect(sim.run(10)).toBe(3);
    expect(sim.stopReason).toBe('stopWhen condition met');
  });

  it('hides occupants whose style says so', () => {
    const spec = model({
      spaces: { land: { kind: 'grid', width: 2, height: 1 } },
      agents: {
        patch: { space: 'land', as: 'cell' },
        ant: {
          space: 'land',
          count: 2,
          attributes: { shy: { type: 'boolean', initial: { op: 'eq', args: ['self.cell.x', 0] } } },
          style: { color: { color: '#123456' }, hidden: 'shy' },
        },
      },
    });
    const sim = new Simulation(compileModel(spec), { seed: 1 });
    const view = sim.views[0];
    if (view?.type !== 'grid') throw new Error('expected a grid view');
    const ants = sim.scape('ant').members as readonly Occupant[];
    const colors = ants.map((ant) => [ant.cell!.x, view.occupantColor!(ant)]);
    expect(colors.sort()).toEqual([
      [0, undefined],
      [1, 0x123456],
    ]);
  });
});
