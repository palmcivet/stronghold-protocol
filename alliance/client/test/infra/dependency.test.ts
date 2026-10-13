import { fileURLToPath } from 'node:url';
import { cruise, type IForbiddenRuleType } from 'dependency-cruiser';
import { describe, expect, it } from 'vitest';

const clientRoot = fileURLToPath(new URL('../..', import.meta.url));

const DOMAIN = '(entry|profile|loadout|guide|room|match|extension)';
const TESTS = '(^test/|\\.(test|spec)\\.tsx?$)';
const COMPOSITION = '^infra/(boot|router)/';

/** The dependency direction of the client: domains → shell, part, ui → infra. */
const RULES: IForbiddenRuleType[] = [
  {
    name: 'infra-stays-below',
    comment:
      'infra depends on no layer above it; boot and router assemble the client',
    severity: 'error',
    from: { path: '^infra/', pathNot: [TESTS, COMPOSITION] },
    to: { path: `^(ui|part|shell|${DOMAIN})/` },
  },
  {
    name: 'ui-reads-theme-and-text',
    comment: 'ui depends only on infra/theme and infra/text',
    severity: 'error',
    from: { path: '^ui/', pathNot: TESTS },
    to: {
      path: `^(infra|part|shell|${DOMAIN})/`,
      pathNot: '^infra/(theme|text)/',
    },
  },
  {
    name: 'part-below-shell',
    comment: 'part depends on neither the shell nor the domains',
    severity: 'error',
    from: { path: '^part/', pathNot: TESTS },
    to: { path: `^(shell|${DOMAIN})/` },
  },
  {
    name: 'shell-below-domains',
    comment: 'the shell depends on no domain',
    severity: 'error',
    from: { path: '^shell/', pathNot: TESTS },
    to: { path: `^${DOMAIN}/` },
  },
  {
    name: 'domains-apart',
    comment: 'a domain does not import another domain',
    severity: 'error',
    from: { path: `^${DOMAIN}/`, pathNot: TESTS },
    to: { path: `^${DOMAIN}/`, pathNot: '^$1/' },
  },
  {
    name: 'match-siblings-apart',
    comment:
      'a match subdirectory depends only on the shared part at the match root',
    severity: 'error',
    from: { path: '^match/([^/]+)/', pathNot: TESTS },
    to: { path: '^match/[^/]+/', pathNot: '^match/$1/' },
  },
];

describe('dependency direction', () => {
  it('keeps every import of the client in its layer', async () => {
    const result = await cruise(['.'], {
      baseDir: clientRoot,
      parser: 'swc',
      exclude: { path: '(^|/)(node_modules|dist|dist-web|dist-test)/' },
      doNotFollow: { path: 'node_modules' },
      tsPreCompilationDeps: true,
      enhancedResolveOptions: {
        extensions: ['.ts', '.tsx', '.js', '.json'],
      },
      ruleSet: { forbidden: RULES },
      validate: true,
    });
    const output = result.output;
    if (typeof output === 'string') {
      throw new Error(output);
    }
    const violations = output.summary.violations.map(
      (violation) =>
        `${violation.rule.name}: ${violation.from} → ${violation.to}`,
    );
    expect(output.summary.totalCruised).toBeGreaterThan(100);
    expect(violations).toEqual([]);
  });
});
