// SPDX-License-Identifier: EPL-2.0
import { describe, expect, it } from 'vitest';
import { Agent, Scape, Simulation, type Model, type ParameterSchema } from '../index';
import { DataRecorder, type RecorderOptions } from './index';

class Holder extends Agent {
  constructor(public amount = 0) {
    super();
  }
}

/** Builds a sim hosting one scape of holders with the given amounts, plus a recorder. */
function setup(
  amounts: number[],
  declare: (recorder: DataRecorder, scape: Scape<Holder>) => void,
  options?: RecorderOptions,
  seed: number | string = 1,
) {
  let recorder!: DataRecorder;
  let scape!: Scape<Holder>;
  const model: Model<ParameterSchema> = {
    name: 'test',
    parameters: {},
    build(sim) {
      scape = sim.addScape(
        new Scape<Holder>({
          name: 'holders',
          size: amounts.length,
          create: (i) => new Holder(amounts[i]),
        }),
      );
      recorder = new DataRecorder(sim, options);
      declare(recorder, scape);
    },
  };
  const sim = new Simulation(model, { seed });
  return { sim, recorder, scape };
}

describe('sampling', () => {
  it('samples at tick 0 and after every step', () => {
    const { sim, recorder } = setup([1, 2], (r, s) => r.count(s, 'n'));
    expect(recorder.sampleCount).toBe(1);
    expect([...recorder.ticks]).toEqual([0]);
    sim.run(3);
    expect(recorder.sampleCount).toBe(4);
    expect([...recorder.ticks]).toEqual([0, 1, 2, 3]);
    expect([...recorder.values('n')]).toEqual([2, 2, 2, 2]);
  });

  it('describes series with ids and labels in declaration order', () => {
    const { recorder } = setup([1], (r, s) => {
      r.measure(s, 'wealth', (a) => a.amount, { statistics: ['mean', 'stdDev'] });
      r.count(s, 'alive');
      r.value('total', () => 0);
    });
    expect(recorder.series).toEqual([
      { id: 'wealth.mean', measure: 'wealth', statistic: 'mean', label: 'Mean wealth' },
      { id: 'wealth.stdDev', measure: 'wealth', statistic: 'stdDev', label: 'Std dev wealth' },
      { id: 'alive', measure: 'alive', statistic: 'count', label: 'Count alive' },
      { id: 'total', measure: 'total', statistic: 'value', label: 'total' },
    ]);
    expect(recorder.get('alive').label).toBe('Count alive');
    expect(() => recorder.get('nope')).toThrow(/No series/);
  });

  it('returns NaN for latest before any sample', () => {
    const sim = new Simulation({ name: 'x', parameters: {}, build() {} });
    const recorder = new DataRecorder(sim);
    recorder.value('v', () => 1);
    expect(recorder.latest('v')).toBeNaN();
    expect(recorder.values('v').length).toBe(0);
  });
});

describe('statistics', () => {
  const all = ['count', 'sum', 'mean', 'min', 'max', 'variance', 'stdDev'] as const;

  it('matches hand-computed values', () => {
    // 2, 4, 4, 4, 5, 5, 7, 9: sum 40, mean 5, sum of squares of deviations 32.
    const { recorder } = setup([2, 4, 4, 4, 5, 5, 7, 9], (r, s) =>
      r.measure(s, 'x', (a) => a.amount, { statistics: all }),
    );
    expect(recorder.latest('x.count')).toBe(8);
    expect(recorder.latest('x.sum')).toBe(40);
    expect(recorder.latest('x.mean')).toBe(5);
    expect(recorder.latest('x.min')).toBe(2);
    expect(recorder.latest('x.max')).toBe(9);
    expect(recorder.latest('x.variance')).toBeCloseTo(32 / 7, 12);
    expect(recorder.latest('x.stdDev')).toBeCloseTo(Math.sqrt(32 / 7), 12);
  });

  it('defaults to count, sum, mean, min, max', () => {
    const { recorder } = setup([1], (r, s) => r.measure(s, 'x', (a) => a.amount));
    expect(recorder.series.map((s) => s.id)).toEqual([
      'x.count',
      'x.sum',
      'x.mean',
      'x.min',
      'x.max',
    ]);
  });

  it('handles the empty set', () => {
    const { recorder } = setup([], (r, s) =>
      r.measure(s, 'x', (a) => a.amount, { statistics: all }),
    );
    expect(recorder.latest('x.count')).toBe(0);
    expect(recorder.latest('x.sum')).toBe(0);
    expect(recorder.latest('x.mean')).toBeNaN();
    expect(recorder.latest('x.min')).toBeNaN();
    expect(recorder.latest('x.max')).toBeNaN();
    expect(recorder.latest('x.variance')).toBe(0);
  });

  it('handles a single member', () => {
    const { recorder } = setup([-3], (r, s) =>
      r.measure(s, 'x', (a) => a.amount, { statistics: all }),
    );
    expect(all.map((statistic) => recorder.latest(`x.${statistic}`))).toEqual([
      1, -3, -3, -3, -3, 0, 0,
    ]);
  });

  it('is numerically stable for large offsets', () => {
    const { recorder } = setup([1e9 + 4, 1e9 + 7, 1e9 + 13, 1e9 + 16], (r, s) =>
      r.measure(s, 'x', (a) => a.amount, { statistics: ['variance'] }),
    );
    expect(recorder.latest('x.variance')).toBeCloseTo(30, 6);
  });

  it('filters with when and evaluates each agent at most once', () => {
    let whenCalls = 0;
    let valueCalls = 0;
    const { recorder } = setup([1, 2, 3, 4, 5, 6], (r, s) =>
      r.measure(
        s,
        'even',
        (a) => {
          valueCalls++;
          return a.amount;
        },
        {
          when: (a) => {
            whenCalls++;
            return a.amount % 2 === 0;
          },
          statistics: ['count', 'sum', 'mean', 'variance'],
        },
      ),
    );
    expect(whenCalls).toBe(6);
    expect(valueCalls).toBe(3);
    expect(recorder.latest('even.count')).toBe(3);
    expect(recorder.latest('even.sum')).toBe(12);
    expect(recorder.latest('even.mean')).toBe(4);
    expect(recorder.latest('even.variance')).toBe(4);
  });

  it('counts members, optionally matching a condition', () => {
    const { recorder } = setup([1, 2, 3, 4], (r, s) => {
      r.count(s, 'all');
      r.count(s, 'big', (a) => a.amount > 2);
    });
    expect(recorder.latest('all')).toBe(4);
    expect(recorder.latest('big')).toBe(2);
  });

  it('throws on non-finite values naming the measure and agent', () => {
    expect(() => setup([1, Number.NaN], (r, s) => r.measure(s, 'bad', (a) => a.amount))).toThrow(
      /"bad".*agent 1/,
    );
    expect(() =>
      setup([Number.POSITIVE_INFINITY], (r, s) => r.measure(s, 'bad', (a) => a.amount)),
    ).toThrow(/"bad".*agent 0/);
  });
});

describe('declarations', () => {
  it('rejects duplicate names across kinds', () => {
    expect(() =>
      setup([1], (r, s) => {
        r.measure(s, 'a', (x) => x.amount);
        r.count(s, 'a');
      }),
    ).toThrow(/already exists/);
    expect(() =>
      setup([1], (r, s) => {
        r.value('a', () => 1);
        r.distribution(s, 'a', (x) => x.amount, { bins: 2, min: 0, max: 1 });
      }),
    ).toThrow(/already exists/);
  });

  it('lets value series read the latest values of measures', () => {
    const { sim, recorder } = setup([1, 2, 3], (r, s) => {
      // Declared first, but still evaluated after the measure.
      r.value('doubleMean', () => r.latest('x.mean') * 2);
      r.measure(s, 'x', (a) => a.amount, { statistics: ['mean'] });
      s.addRule('grow', (a) => {
        a.amount += 1;
      });
    });
    sim.run(2);
    expect([...recorder.values('x.mean')]).toEqual([2, 3, 4]);
    expect([...recorder.values('doubleMean')]).toEqual([4, 6, 8]);
  });
});

describe('population changes', () => {
  it('tracks agents dying and being added mid-run', () => {
    const { sim, recorder, scape } = setup([10, 20, 30], (r, s) => {
      r.measure(s, 'x', (a) => a.amount, { statistics: ['count', 'sum'] });
    });
    scape.members[0]!.die();
    sim.step();
    scape.add(new Holder(5));
    scape.add(new Holder(6));
    sim.step();
    for (const agent of [...scape.members]) agent.die();
    sim.step();
    expect([...recorder.values('x.count')]).toEqual([3, 2, 4, 0]);
    expect([...recorder.values('x.sum')]).toEqual([60, 50, 61, 0]);
  });
});

describe('history', () => {
  it('keeps only the latest sample when history is false', () => {
    const { sim, recorder } = setup(
      [1, 2],
      (r, s) => {
        r.measure(s, 'x', (a) => a.amount, { statistics: ['sum'] });
        s.addRule('grow', (a) => {
          a.amount += 1;
        });
      },
      { history: false },
    );
    sim.run(4);
    expect(recorder.sampleCount).toBe(5);
    expect([...recorder.values('x.sum')]).toEqual([11]);
    expect([...recorder.ticks]).toEqual([4]);
    expect(recorder.latest('x.sum')).toBe(11);
    expect(recorder.toRows()).toEqual([{ tick: 4, 'x.sum': 11 }]);
  });

  it('grows its buffers beyond the initial capacity', () => {
    const { sim, recorder } = setup([0], (r, s) => {
      r.measure(s, 'x', (a) => a.amount, { statistics: ['sum'] });
      r.value('t', (simulation) => simulation.tick);
      s.addRule('grow', (a) => {
        a.amount += 1;
      });
    });
    sim.run(5000);
    expect(recorder.sampleCount).toBe(5001);
    const sums = recorder.values('x.sum');
    expect(sums.length).toBe(5001);
    expect(sums[0]).toBe(0);
    expect(sums[2500]).toBe(2500);
    expect(sums[5000]).toBe(5000);
    expect(recorder.values('t')[4321]).toBe(4321);
    expect(recorder.ticks[5000]).toBe(5000);
  });
});

describe('distributions', () => {
  it('bins the latest sample, clamping out-of-range values', () => {
    const { sim, recorder, scape } = setup([-5, 0, 2.5, 5, 7.5, 10, 99], (r, s) =>
      r.distribution(s, 'd', (a) => a.amount, { bins: 4, min: 0, max: 10 }),
    );
    // Bins: [0,2.5) [2.5,5) [5,7.5) [7.5,10]
    expect([...recorder.distributionCounts('d')]).toEqual([2, 1, 1, 3]);
    expect(recorder.distributionCounts('d')).toBeInstanceOf(Uint32Array);
    for (const agent of scape.members) agent.amount = 1;
    sim.step();
    expect([...recorder.distributionCounts('d')]).toEqual([7, 0, 0, 0]);
  });

  it('respects when and validates its options', () => {
    const { recorder } = setup([1, 2, 3, 4], (r, s) =>
      r.distribution(s, 'd', (a) => a.amount, {
        bins: 2,
        min: 0,
        max: 8,
        when: (a) => a.amount > 1,
      }),
    );
    expect([...recorder.distributionCounts('d')]).toEqual([2, 1]);
    expect(() => recorder.distributionCounts('zzz')).toThrow();
    expect(() =>
      setup([], (r, s) => r.distribution(s, 'd', () => 0, { bins: 0, min: 0, max: 1 })),
    ).toThrow(RangeError);
    expect(() =>
      setup([], (r, s) => r.distribution(s, 'd', () => 0, { bins: 2, min: 1, max: 1 })),
    ).toThrow(RangeError);
  });
});

describe('export', () => {
  function small() {
    const { sim, recorder } = setup([1, 2], (r, s) => {
      r.measure(s, 'x', (a) => a.amount, { statistics: ['count', 'mean'] });
      r.value('half', (simulation) => simulation.tick / 4);
      s.addRule('grow', (a) => {
        a.amount += 1;
      });
      s.addRule('shrink', (a) => {
        if (a.amount >= 3) a.die();
      });
    });
    sim.run(2);
    return recorder;
  }

  it('toRows gives one object per sample', () => {
    expect(small().toRows()).toEqual([
      { tick: 0, 'x.count': 2, 'x.mean': 1.5, half: 0 },
      { tick: 1, 'x.count': 1, 'x.mean': 2, half: 0.25 },
      { tick: 2, 'x.count': 0, 'x.mean': Number.NaN, half: 0.5 },
    ]);
  });

  it('toCSV writes a header, full precision, and empty fields for NaN', () => {
    expect(small().toCSV()).toBe('tick,x.count,x.mean,half\n0,2,1.5,0\n1,1,2,0.25\n2,0,,0.5\n');
  });

  it('quotes ids containing commas or quotes', () => {
    const { recorder } = setup([1], (r) => {
      r.value('a,b', () => 1);
      r.value('say "hi"', () => 2);
    });
    expect(recorder.toCSV()).toBe('tick,"a,b","say ""hi"""\n0,1,2\n');
  });

  it('writes full precision numbers', () => {
    const { recorder } = setup([0], (r) => r.value('v', () => 0.1 + 0.2));
    expect(recorder.toCSV()).toBe('tick,v\n0,0.30000000000000004\n');
  });
});

describe('determinism', () => {
  function run(seed: number): string {
    const { sim, recorder } = setup(
      Array.from({ length: 20 }, (_, i) => i),
      (r, s) => {
        r.measure(s, 'x', (a) => a.amount, { statistics: ['count', 'mean', 'variance'] });
        s.addRule('walk', (a) => {
          a.amount += a.random.int(-2, 3);
          if (a.random.chance(0.02)) a.die();
        });
      },
      undefined,
      seed,
    );
    sim.run(100);
    return recorder.toCSV();
  }

  it('produces identical CSV for the same seed and differs for another', () => {
    expect(run(7)).toBe(run(7));
    expect(run(7)).not.toBe(run(8));
  });
});
