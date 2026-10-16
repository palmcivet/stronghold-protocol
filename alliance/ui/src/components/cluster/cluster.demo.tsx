'use client';

import { Cluster, Text } from '#ui/index.js';

export function ClusterDemo() {
  return (
    <Cluster gap={2} align="center" justify="between">
      <span>左侧</span>
      <Text variant="number">1280</Text>
    </Cluster>
  );
}
