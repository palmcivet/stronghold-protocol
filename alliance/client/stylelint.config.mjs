/** CSS naming only; formatting and the rest stay with Biome. */
const PUBLIC = '^wsde-[a-z0-9]+(-[a-z0-9]+)*$';
const INTERNAL = '^[a-z][a-zA-Z0-9]*$';
/** Modules read the public tokens and set their own camelCase properties; the rule sees both. */
const MODULE_PROPERTY = `(${PUBLIC})|(${INTERNAL})`;

/** @type {import('stylelint').Config} */
export default {
  rules: {
    // public, mod-facing: kebab-case with the `wsde-` prefix
    'selector-class-pattern': [PUBLIC, { resolveNestedSelectors: true }],
    'custom-property-pattern': PUBLIC,
  },
  overrides: [
    {
      // internal CSS Modules: camelCase classes and local properties, plus the public tokens they read
      files: ['**/*.module.css'],
      rules: {
        'selector-class-pattern': [INTERNAL, { resolveNestedSelectors: true }],
        'custom-property-pattern': MODULE_PROPERTY,
      },
    },
  ],
};
