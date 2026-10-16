'use client';

import { useState } from 'react';
import { TextField } from '#ui/index.js';

export function TextFieldDemo() {
  const [code, setCode] = useState('');
  const [query, setQuery] = useState('');
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 480 }}>
      <TextField
        label="同盟密钥"
        micro="KEY"
        icon="link"
        placeholder="七位字符"
        hint="向房主索取"
        value={code}
        onChange={setCode}
      />
      <TextField
        type="search"
        label="搜索干员"
        labelHidden
        placeholder="搜索干员"
        clearLabel="清空搜索"
        value={query}
        onChange={setQuery}
      />
      <TextField
        label="昵称"
        errorMessage="昵称不能为空"
        value=""
        onChange={() => undefined}
      />
    </div>
  );
}
