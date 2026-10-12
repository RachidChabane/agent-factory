import { describe, expect, it } from 'vitest';
import { DEFAULT_ISSUE_TYPES } from './issue-type-presets.ts';
import { InvalidTypologyError, IssueTypology, proofExpectation, PROOF_STRATEGIES, typeLabel, UnknownIssueTypeError, type IssueTypeDefinition } from './issue-types.ts';

function definition(id: string, overrides: Partial<IssueTypeDefinition> = {}): IssueTypeDefinition {
  return {
    id,
    label: typeLabel(id),
    proof: 'fails-on-base',
    checks: 'a test',
    commit: { type: 'feat', scope: null, whenChanged: [] },
    evidence: ['acceptance-tests'],
    review: [],
    paths: [],
    ...overrides,
  };
}

describe('IssueTypology', () => {
  const typology = new IssueTypology([definition('feature'), definition('docs', { proof: 'none', label: 'documentation' })]);

  it('finds a type by id and by forge label', () => {
    expect(typology.get('feature').label).toBe('type:feature');
    expect(typology.fromLabels(['spec:validated', 'documentation'])?.id).toBe('docs');
    expect(typology.fromLabels(['bug'])).toBeNull();
    expect(typology.ids()).toEqual(['feature', 'docs']);
  });

  it('names the known types when an unknown one is asked for', () => {
    expect(() => typology.get('ui')).toThrow(new UnknownIssueTypeError('ui', ['feature', 'docs']));
    expect(() => typology.get('ui')).toThrow('unknown issue type "ui"; this project knows feature, docs');
  });

  it('refuses an empty list, a repeated id, a repeated label and an id that is not a lowercase word', () => {
    expect(() => new IssueTypology([])).toThrow(InvalidTypologyError);
    expect(() => new IssueTypology([definition('feature'), definition('feature', { label: 'other' })])).toThrow('ids are declared twice: feature');
    expect(() => new IssueTypology([definition('a'), definition('b', { label: 'type:a' })])).toThrow('labels are declared twice: type:a');
    expect(() => new IssueTypology([definition('New Feature')])).toThrow('lowercase words joined by dashes: New Feature');
  });
});

describe('proofExpectation', () => {
  it('maps every strategy to the before proof the gate expects', () => {
    expect(PROOF_STRATEGIES.map((strategy) => [strategy, proofExpectation(strategy)])).toEqual([
      ['fails-on-base', { kind: 'fails-on-base', mandatoryFailingBase: true, failingBaseWhenExpressible: true }],
      ['fails-on-base-when-expressible', { kind: 'fails-on-base', mandatoryFailingBase: false, failingBaseWhenExpressible: true }],
      ['base-score', { kind: 'base-score', mandatoryFailingBase: false, failingBaseWhenExpressible: false }],
      ['none', { kind: 'none', mandatoryFailingBase: false, failingBaseWhenExpressible: false }],
    ]);
  });
});

describe('DEFAULT_ISSUE_TYPES', () => {
  it('forms a valid typology with a label per type', () => {
    const typology = new IssueTypology(DEFAULT_ISSUE_TYPES);
    expect(typology.ids()).toEqual(['feature', 'fix', 'ui', 'api', 'security', 'infra', 'data', 'dependencies', 'docs', 'refactor', 'release', 'prompt']);
    expect(typology.get('security').review).toEqual(['security']);
    expect(typology.get('prompt').proof).toBe('base-score');
    expect(typology.get('dependencies').commit).toEqual({ type: 'build', scope: 'deps', whenChanged: [] });
  });
});
