import { readFileSync } from 'node:fs';
import { evaluateBaseRun, evaluateBranchRun, type CriterionChecks, type StructuredTestRunner } from '@agent-factory/domain';
import { describe, expect, it } from 'vitest';
import { TestReportFormatError } from './report-paths.ts';
import { RUNNER_REPORTING, readTestReport } from './test-report-reader.ts';
import { parseXml, XmlFormatError } from './xml-document.ts';

const WORKTREE = '/work/shop';
const EXTENSIONS: Readonly<Record<StructuredTestRunner, string>> = { pytest: 'xml', vitest: 'json', playwright: 'json' };

function fixture(runner: StructuredTestRunner, name: string): string {
  return readFileSync(new URL(`./fixtures/${runner}-${name}.${EXTENSIONS[runner]}`, import.meta.url), 'utf8');
}

function read(runner: StructuredTestRunner, name: string): ReturnType<typeof readTestReport> {
  return readTestReport(runner, fixture(runner, name), WORKTREE);
}

describe('pytest junit report', () => {
  it('reads a base run with assertion failures, an import error inside a test and a skipped test', () => {
    const report = read('pytest', 'base');
    expect(report.collectionErrors).toEqual([]);
    expect(report.cases.map((test) => [test.id, test.outcome, test.failureKind])).toEqual([
      ['tests/test_checkout.py::test_total_of_two_items', 'passed', null],
      ['tests/test_checkout.py::test_discount_is_applied_above_twenty', 'failed', 'assertion'],
      ['tests/test_checkout.py::test_receipt_lists_items', 'failed', 'error'],
      ['tests/test_checkout.py::test_receipt_is_printed', 'skipped', null],
      ['tests/test_checkout.py::TestRefunds::test_refund_restores_stock', 'failed', 'assertion'],
    ]);
    expect(report.cases[2]?.failureMessage).toBe("ModuleNotFoundError: No module named 'shop.receipt'");
  });

  it('reads a collection error as a check that did not load', () => {
    const report = read('pytest', 'collection-error');
    expect(report.cases).toEqual([]);
    expect(report.collectionErrors).toHaveLength(1);
    expect(report.collectionErrors[0]?.file).toBe('tests/test_coupons.py');
    expect(report.collectionErrors[0]?.message).toContain("No module named 'shop.coupons'");
  });

  it('refuses a report without file attributes', () => {
    const xunit2 = fixture('pytest', 'branch').replaceAll(/ file="[^"]*"/g, '');
    expect(() => readTestReport('pytest', xunit2, WORKTREE)).toThrow(TestReportFormatError);
  });

  it('asks pytest for a junit report with file attributes', () => {
    expect(RUNNER_REPORTING.pytest.arguments('/work/shop/.factory/reports/pytest.xml')).toEqual([
      '--junitxml=/work/shop/.factory/reports/pytest.xml',
      '-o',
      'junit_family=xunit1',
    ]);
  });
});

describe('vitest json report', () => {
  it('reads a base run and tells assertions from module errors', () => {
    const report = read('vitest', 'base');
    expect(report.collectionErrors).toEqual([]);
    expect(report.cases.map((test) => [test.id, test.outcome, test.failureKind])).toEqual([
      ['test/cart.test.ts > cart total > adds two items', 'passed', null],
      ['test/cart.test.ts > cart total > applies a discount above twenty', 'failed', 'assertion'],
      ['test/cart.test.ts > cart total > renders the receipt', 'failed', 'error'],
      ['test/cart.test.ts > cart total > prints the receipt', 'skipped', null],
      ['test/cart.test.ts > refunds > restores the stock', 'failed', 'assertion'],
    ]);
  });

  it('reads a test file that fails to import as a collection error', () => {
    const report = read('vitest', 'collection-error');
    expect(report.collectionErrors.map((error) => error.file)).toEqual(['test/coupons.test.ts']);
    expect(report.collectionErrors[0]?.message).toContain("Cannot find module '../src/coupons.ts'");
  });
});

describe('playwright json report', () => {
  it('reads nested describe blocks and matcher failures', () => {
    const report = read('playwright', 'base');
    expect(report.collectionErrors).toEqual([]);
    expect(report.cases.map((test) => [test.id, test.outcome, test.failureKind])).toEqual([
      ['e2e/cart.spec.ts > refund restores the stock', 'failed', 'assertion'],
      ['e2e/cart.spec.ts > cart total > adds two items', 'passed', null],
      ['e2e/cart.spec.ts > cart total > applies a discount above twenty', 'failed', 'assertion'],
      ['e2e/cart.spec.ts > cart total > renders the receipt', 'failed', 'error'],
      ['e2e/cart.spec.ts > cart total > prints the receipt', 'skipped', null],
    ]);
    expect(report.cases[0]?.failureMessage).not.toContain(String.fromCharCode(27));
  });

  it('reads a spec file that fails to load as a collection error', () => {
    const report = read('playwright', 'collection-error');
    expect(report.cases).toEqual([]);
    expect(report.collectionErrors[0]?.message).toContain("Cannot find module '/work/shop/src/coupons.ts'");
  });

  it('writes its json report where the factory reads it', () => {
    expect(RUNNER_REPORTING.playwright.environment('/r.json')).toMatchObject({ PLAYWRIGHT_JSON_OUTPUT_FILE: '/r.json' });
  });
});

describe.each(['pytest', 'vitest', 'playwright'] as const)('%s base and branch runs', (runner) => {
  const checkFile = { pytest: 'tests/test_checkout.py', vitest: 'test/cart.test.ts', playwright: 'e2e/cart.spec.ts' }[runner];
  const criteria: readonly CriterionChecks[] = [{ criterion: 1, files: [checkFile], onBase: 'fails' }];

  it('rejects a base where one check is red because a module is missing', () => {
    const evaluation = evaluateBaseRun(read(runner, 'base'), criteria);
    expect(evaluation.failingCriteria).toEqual([1]);
    expect(evaluation.problems).toHaveLength(1);
    expect(evaluation.problems[0]).toContain('fails on base for another reason than an assertion');
  });

  it('rejects a base whose checks do not load', () => {
    expect(evaluateBaseRun(read(runner, 'collection-error'), criteria).problems.some((problem) => problem.includes('did not load'))).toBe(true);
  });

  it('accepts the branch where every test that ran on base passes', () => {
    const base = evaluateBaseRun(read(runner, 'base'), criteria).tests;
    expect(evaluateBranchRun(base, read(runner, 'branch'))).toMatchObject({ passed: true, problems: [] });
  });
});

describe('parseXml', () => {
  it('decodes entities, CDATA and quoted angle brackets', () => {
    const element = parseXml('<?xml version="1.0"?><a x="1 &gt; 0" y=\'b > c\'><b>&lt;t&#10;</b><![CDATA[<raw>]]></a>');
    expect(element.attributes).toEqual({ x: '1 > 0', y: 'b > c' });
    expect(element.children[0]?.text).toBe('<t\n');
    expect(element.text).toBe('<raw>');
  });

  it('refuses unbalanced documents', () => {
    expect(() => parseXml('<a><b></a>')).toThrow(XmlFormatError);
    expect(() => parseXml('<a>')).toThrow(XmlFormatError);
  });
});
