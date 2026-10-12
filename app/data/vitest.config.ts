import { moduleTest } from '@alliance/shared/vitest';

export default moduleTest('@alliance/data', {
  environment: 'node',
  include: ['**/*.test.ts', '**/*.spec.ts'],
});
