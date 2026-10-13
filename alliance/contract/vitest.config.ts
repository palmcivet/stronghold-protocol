import { moduleTest } from '@wsde/shared/vitest';

export default moduleTest('@alliance/contract', {
  environment: 'node',
  include: ['**/*.test.ts', '**/*.spec.ts'],
});
