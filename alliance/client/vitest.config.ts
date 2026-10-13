import { moduleTest } from '@wsde/shared/vitest';

export default moduleTest('@alliance/client', {
  environment: 'node',
  include: ['**/*.test.ts', '**/*.spec.ts', '**/*.test.tsx', '**/*.spec.tsx'],
});
