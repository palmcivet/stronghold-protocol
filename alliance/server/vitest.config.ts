import { moduleTest } from '@wsde/shared/vitest';

export default moduleTest('@alliance/server', {
  environment: 'node',
  include: ['**/*.test.ts', '**/*.spec.ts'],
});
