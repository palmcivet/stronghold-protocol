import { moduleTest } from '@wsde/shared/vitest';

export default moduleTest('@alliance/ui', {
  environment: 'node',
  include: ['**/*.test.ts', '**/*.spec.ts', '**/*.test.tsx', '**/*.spec.tsx'],
});
