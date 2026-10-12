import { moduleTest } from '@alliance/shared/vitest';

export default moduleTest('@alliance/server', {
  environment: 'node',
  include: ['**/*.test.ts', '**/*.spec.ts'],
});
