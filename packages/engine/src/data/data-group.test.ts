// SPDX-License-Identifier: EPL-2.0
import { describe, expect, it } from 'vitest';
import { Agent, RootScape, Scape, type Model, type ParameterSchema } from '../index';
import { DataGroup, stat, type DataOptions } from './index';

class Holder extends Agent {
  constructor(public amount = 0) {
    super();
  }
}

/** Builds a model with one scape of holders with the given amounts, and returns its data. */
function setup(
  amounts: number[],
  declare: (data: DataGroup, scape: Scape<Holder>) => void,
  options?: DataOptions,
  seed: number | string = 1,
) {
  let scape!: Scape<Holder>;
  const model: Model<ParameterSchema> = {
    name: 'test',
    parameters: {},
    build(root) {
      scape = root.add(
        new Scape<Holder>({
          name: 'holders',
          size: amounts.length,
          prototypeAgent: (i) => new Holder(amounts[i]),
        }),
      );
      declare(root.data, scape);
    },
  };
  const root = new RootScape(model, {
    seed,
    ...(options?.history !== undefined && { history: options.history }),
  });
  return { root, data: root.data, scape };
}

describe('sampling', () => {
  it('collects at period 0 and after every iteration', () => {
    const { root, data } = setup([1, 2], (r, s) => s.addStatCollector(stat.count('n')));
    expect(data.sampleCount).toBe(1);
    expect([...data.periods]).toEqual([0]);
    root.run(3);
    expect(data.sampleCount).toBe(4);
    expect([...data.periods]).toEqual([0, 1, 2, 3]);
    expect([...data.values('n')]).toEqual([2, 2, 2, 2]);
  });

  it('describes series with ids and labels in declaration order', () => {
    const { data } = setup([1], (r, s) => {
      s.addStatCollector(
        stat.measure('wealth', (a) => a.amount, { statistics: ['mean', 'stdDev'] }),
      );
      s.addStatCollector(stat.count('alive'));
      s.root.addStatCollector(stat.value('total', () => 0));
    });
    expect(data.series).toEqual([
      { id: 'wealth.mean', measure: 'wealth', statistic: 'mean', label: 'Mean wealth' },
      { id: 'wealth.stdDev', measure: 'wealth', statistic: 'stdDev', label: 'Std dev wealth' },
      { id: 'alive', measure: 'alive', statistic: 'count', label: 'Count alive' },
      { id: 'total', measure: 'total', statistic: 'value', label: 'total' },
    ]);
    expect(data.get('alive').label).toBe('Count alive');
    expect(() => data.get('nope')).toThrow(/No series/);
  });

  it('returns NaN for latest before any sample', () => {
    const data = new DataGroup();
    data.register(
      new Scape({ name: 'x' }),
      stat.value('v', () => 1),
    );
    expect(data.latest('v')).toBeNaN();
    expect(data.values('v').length).toBe(0);
  });
});

describe('statistics', () => {
  const all = ['count', 'sum', 'mean', 'min', 'max', 'variance', 'stdDev'] as const;

  it('matches hand-computed values', () => {
    // 2, 4, 4, 4, 5, 5, 7, 9: sum 40, mean 5, sum of squares of deviations 32.
    const { data } = setup([2, 4, 4, 4, 5, 5, 7, 9], (r, s) =>
      s.addStatCollector(stat.measure('x', (a) => a.amount, { statistics: all })),
    );
    expect(data.latest('x.count')).toBe(8);
    expect(data.latest('x.sum')).toBe(40);
    expect(data.latest('x.mean')).toBe(5);
    expect(data.latest('x.min')).toBe(2);
    expect(data.latest('x.max')).toBe(9);
    expect(data.latest('x.variance')).toBeCloseTo(32 / 7, 12);
    expect(data.latest('x.stdDev')).toBeCloseTo(Math.sqrt(32 / 7), 12);
  });

  it('defaults to count, sum, mean, min, max', () => {
    const { data } = setup([1], (r, s) => s.addStatCollector(stat.measure('x', (a) => a.amount)));
    expect(data.series.map((s) => s.id)).toEqual(['x.count', 'x.sum', 'x.mean', 'x.min', 'x.max']);
  });

  it('handles the empty set', () => {
    const { data } = setup([], (r, s) =>
      s.addStatCollector(stat.measure('x', (a) => a.amount, { statistics: all })),
    );
    expect(data.latest('x.count')).toBe(0);
    expect(data.latest('x.sum')).toBe(0);
    expect(data.latest('x.mean')).toBeNaN();
    expect(data.latest('x.min')).toBeNaN();
    expect(data.latest('x.max')).toBeNaN();
    expect(data.latest('x.variance')).toBe(0);
  });

  it('handles a single member', () => {
    const { data } = setup([-3], (r, s) =>
      s.addStatCollector(stat.measure('x', (a) => a.amount, { statistics: all })),
    );
    expect(all.map((statistic) => data.latest(`x.${statistic}`))).toEqual([
      1, -3, -3, -3, -3, 0, 0,
    ]);
  });

  it('is numerically stable for large offsets', () => {
    const { data } = setup([1e9 + 4, 1e9 + 7, 1e9 + 13, 1e9 + 16], (r, s) =>
      s.addStatCollector(stat.measure('x', (a) => a.amount, { statistics: ['variance'] })),
    );
    expect(data.latest('x.variance')).toBeCloseTo(30, 6);
  });

  it('filters with when and evaluates each agent at most once', () => {
    let whenCalls = 0;
    let valueCalls = 0;
    const { data } = setup([1, 2, 3, 4, 5, 6], (r, s) =>
      s.addStatCollector(
        stat.measure(
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
      ),
    );
    expect(whenCalls).toBe(6);
    expect(valueCalls).toBe(3);
    expect(data.latest('even.count')).toBe(3);
    expect(data.latest('even.sum')).toBe(12);
    expect(data.latest('even.mean')).toBe(4);
    expect(data.latest('even.variance')).toBe(4);
  });

  it('counts members, optionally matching a condition', () => {
    const { data } = setup([1, 2, 3, 4], (r, s) => {
      s.addStatCollector(stat.count('all'));
      s.addStatCollector(stat.count('big', (a) => a.amount > 2));
    });
    expect(data.latest('all')).toBe(4);
    expect(data.latest('big')).toBe(2);
  });

  it('throws on non-finite values naming the measure and agent', () => {
    expect(() =>
      setup([1, Number.NaN], (r, s) => s.addStatCollector(stat.measure('bad', (a) => a.amount))),
    ).toThrow(/"bad".*agent 1/);
    expect(() =>
      setup([Number.POSITIVE_INFINITY], (r, s) =>
        s.addStatCollector(stat.measure('bad', (a) => a.amount)),
      ),
    ).toThrow(/"bad".*agent 0/);
  });
});

describe('declarations', () => {
  it('rejects duplicate names across kinds', () => {
    expect(() =>
      setup([1], (r, s) => {
        s.addStatCollector(stat.measure('a', (x) => x.amount));
        s.addStatCollector(stat.count('a'));
      }),
    ).toThrow(/already exists/);
    expect(() =>
      setup([1], (r, s) => {
        s.root.addStatCollector(stat.value('a', () => 1));
        s.addStatCollector(stat.distribution('a', (x) => x.amount, { bins: 2, min: 0, max: 1 }));
      }),
    ).toThrow(/already exists/);
  });

  it('lets value series read the latest values of measures', () => {
    const { root, data } = setup([1, 2, 3], (r, s) => {
      // Added first, and to the root, but still calculated after the measure.
      s.root.addStatCollector(stat.value('doubleMean', () => r.latest('x.mean') * 2));
      s.addStatCollector(stat.measure('x', (a) => a.amount, { statistics: ['mean'] }));
      s.addRule('grow', (a) => {
        a.amount += 1;
      });
    });
    root.run(2);
    expect([...data.values('x.mean')]).toEqual([2, 3, 4]);
    expect([...data.values('doubleMean')]).toEqual([4, 6, 8]);
  });
});

describe('population changes', () => {
  it('tracks agents dying and being added mid-run', () => {
    const { root, data, scape } = setup([10, 20, 30], (r, s) => {
      s.addStatCollector(stat.measure('x', (a) => a.amount, { statistics: ['count', 'sum'] }));
    });
    scape.members[0]!.die();
    root.iterate();
    scape.add(new Holder(5));
    scape.add(new Holder(6));
    root.iterate();
    for (const agent of [...scape.members]) agent.die();
    root.iterate();
    expect([...data.values('x.count')]).toEqual([3, 2, 4, 0]);
    expect([...data.values('x.sum')]).toEqual([60, 50, 61, 0]);
  });
});

describe('history', () => {
  it('keeps only the latest sample when history is false', () => {
    const { root, data } = setup(
      [1, 2],
      (r, s) => {
        s.addStatCollector(stat.measure('x', (a) => a.amount, { statistics: ['sum'] }));
        s.addRule('grow', (a) => {
          a.amount += 1;
        });
      },
      { history: false },
    );
    root.run(4);
    expect(data.sampleCount).toBe(5);
    expect([...data.values('x.sum')]).toEqual([11]);
    expect([...data.periods]).toEqual([4]);
    expect(data.latest('x.sum')).toBe(11);
    expect(data.toRows()).toEqual([{ period: 4, 'x.sum': 11 }]);
  });

  it('grows its buffers beyond the initial capacity', () => {
    const { root, data } = setup([0], (r, s) => {
      s.addStatCollector(stat.measure('x', (a) => a.amount, { statistics: ['sum'] }));
      s.root.addStatCollector(stat.value('t', (root) => root.period));
      s.addRule('grow', (a) => {
        a.amount += 1;
      });
    });
    root.run(5000);
    expect(data.sampleCount).toBe(5001);
    const sums = data.values('x.sum');
    expect(sums.length).toBe(5001);
    expect(sums[0]).toBe(0);
    expect(sums[2500]).toBe(2500);
    expect(sums[5000]).toBe(5000);
    expect(data.values('t')[4321]).toBe(4321);
    expect(data.periods[5000]).toBe(5000);
  });
});

describe('distributions', () => {
  it('bins the latest sample, clamping out-of-range values', () => {
    const { root, data, scape } = setup([-5, 0, 2.5, 5, 7.5, 10, 99], (r, s) =>
      s.addStatCollector(stat.distribution('d', (a) => a.amount, { bins: 4, min: 0, max: 10 })),
    );
    // Bins: [0,2.5) [2.5,5) [5,7.5) [7.5,10]
    expect([...data.distributionCounts('d')]).toEqual([2, 1, 1, 3]);
    expect(data.distributionCounts('d')).toBeInstanceOf(Uint32Array);
    for (const agent of scape.members) agent.amount = 1;
    root.iterate();
    expect([...data.distributionCounts('d')]).toEqual([7, 0, 0, 0]);
  });

  it('respects when and validates its options', () => {
    const { data } = setup([1, 2, 3, 4], (r, s) =>
      s.addStatCollector(
        stat.distribution('d', (a) => a.amount, {
          bins: 2,
          min: 0,
          max: 8,
          when: (a) => a.amount > 1,
        }),
      ),
    );
    expect([...data.distributionCounts('d')]).toEqual([2, 1]);
    expect(() => data.distributionCounts('zzz')).toThrow();
    expect(() =>
      setup([], (r, s) =>
        s.addStatCollector(stat.distribution('d', () => 0, { bins: 0, min: 0, max: 1 })),
      ),
    ).toThrow(RangeError);
    expect(() =>
      setup([], (r, s) =>
        s.addStatCollector(stat.distribution('d', () => 0, { bins: 2, min: 1, max: 1 })),
      ),
    ).toThrow(RangeError);
  });
});

describe('export', () => {
  function small() {
    const { root, data } = setup([1, 2], (r, s) => {
      s.addStatCollector(stat.measure('x', (a) => a.amount, { statistics: ['count', 'mean'] }));
      s.root.addStatCollector(stat.value('half', (root) => root.period / 4));
      s.addRule('grow', (a) => {
        a.amount += 1;
      });
      s.addRule('shrink', (a) => {
        if (a.amount >= 3) a.die();
      });
    });
    root.run(2);
    return data;
  }

  it('toRows gives one object per sample', () => {
    expect(small().toRows()).toEqual([
      { period: 0, 'x.count': 2, 'x.mean': 1.5, half: 0 },
      { period: 1, 'x.count': 1, 'x.mean': 2, half: 0.25 },
      { period: 2, 'x.count': 0, 'x.mean': Number.NaN, half: 0.5 },
    ]);
  });

  it('toCSV writes a header, full precision, and empty fields for NaN', () => {
    expect(small().toCSV()).toBe('period,x.count,x.mean,half\n0,2,1.5,0\n1,1,2,0.25\n2,0,,0.5\n');
  });

  it('quotes ids containing commas or quotes', () => {
    const { data } = setup([1], (r, s) => {
      s.root.addStatCollector(stat.value('a,b', () => 1));
      s.root.addStatCollector(stat.value('say "hi"', () => 2));
    });
    expect(data.toCSV()).toBe('period,"a,b","say ""hi"""\n0,1,2\n');
  });

  it('writes full precision numbers', () => {
    const { data } = setup([0], (r, s) =>
      s.root.addStatCollector(stat.value('v', () => 0.1 + 0.2)),
    );
    expect(data.toCSV()).toBe('period,v\n0,0.30000000000000004\n');
  });
});

describe('determinism', () => {
  function run(seed: number): string {
    const { root, data } = setup(
      Array.from({ length: 20 }, (_, i) => i),
      (r, s) => {
        s.addStatCollector(
          stat.measure('x', (a) => a.amount, { statistics: ['count', 'mean', 'variance'] }),
        );
        s.addRule('walk', (a) => {
          a.amount += a.random.int(-2, 3);
          if (a.random.chance(0.02)) a.die();
        });
      },
      undefined,
      seed,
    );
    root.run(100);
    return data.toCSV();
  }

  it('produces identical CSV for the same seed and differs for another', () => {
    expect(run(7)).toBe(run(7));
    expect(run(7)).not.toBe(run(8));
  });
});
