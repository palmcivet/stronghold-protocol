import { moduleTest } from '@alliance/shared/vitest';

export default moduleTest('@alliance/contract', {
  environment: 'node',
  include: ['**/*.test.ts', '**/*.spec.ts'],
});
