import { moduleTest } from '@wsde/shared/vitest';

export default moduleTest('@alliance/data', {
  environment: 'node',
  include: ['**/*.test.ts', '**/*.spec.ts'],
});
