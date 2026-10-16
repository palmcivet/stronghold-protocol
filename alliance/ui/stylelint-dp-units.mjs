import stylelint from 'stylelint';

const ruleName = 'alliance/dp-units';

const messages = stylelint.utils.ruleMessages(ruleName, {
  rem: (value) => `Unexpected rem in "${value}". Use calc(var(--wsde-dp) * N).`,
  viewport: (value) =>
    `Unexpected viewport unit in "${value}". The canvas is not the viewport.`,
  px: (value) =>
    `Unexpected px in "${value}". Only 1px and 2px strokes stay in device pixels.`,
});

/** @type {import('stylelint').Rule} */
const rule = (primary) => (root, result) => {
  if (!primary) {
    return;
  }
  const check = (node, value) => {
    if (!value) {
      return;
    }
    const lengths =
      /(?<![\w-])(-?(?:\d+\.\d+|\d+|\.\d+))(rem|dvh|svh|lvh|dvw|svw|lvw|vmin|vmax|vh|vw|px)(?![\w-])/gi;
    for (const match of value.matchAll(lengths)) {
      const amount = Number(match[1]);
      const unit = match[2].toLowerCase();
      if (unit === 'px' && (Math.abs(amount) === 1 || Math.abs(amount) === 2)) {
        continue;
      }
      const message =
        unit === 'rem'
          ? messages.rem(match[0])
          : unit === 'px'
            ? messages.px(match[0])
            : messages.viewport(match[0]);
      stylelint.utils.report({
        message,
        node,
        result,
        ruleName,
        word: match[0],
      });
    }
  };
  root.walkDecls((decl) => {
    check(decl, decl.value);
  });
  root.walkAtRules((at) => {
    check(at, at.params);
  });
};

rule.ruleName = ruleName;
rule.messages = messages;

export default stylelint.createPlugin(ruleName, rule);
