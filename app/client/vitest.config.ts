import { moduleTest } from '@alliance/shared/vitest';

export default moduleTest('@alliance/client', {
  environment: 'node',
  include: ['**/*.test.ts', '**/*.spec.ts'],
});
