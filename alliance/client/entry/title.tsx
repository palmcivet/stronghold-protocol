import { NAME_MAX_LEN } from '@alliance/contract/match.js';
import { Button, Panel, Stack, TextField } from '@alliance/ui';
import { useRouteContext } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { Form } from 'react-aria-components';
import { settingsStore } from '#infra/store/settings.js';
import { useText } from '#infra/text/index.js';

/** The code name the player enters with. */
export function NameForm() {
  const t = useText();
  const { runtime } = useRouteContext({ from: '__root__' });
  const [name, setName] = useState(() => settingsStore.getState().name);
  const valid = name.trim().length > 0 && name.trim().length <= NAME_MAX_LEN;
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (valid) {
      runtime.api.enter(name);
    }
  };
  return (
    <Panel title={t('core:title.heading')}>
      <Form onSubmit={submit}>
        <Stack gap={3}>
          <TextField
            label={t('core:title.name')}
            value={name}
            onChange={setName}
            maxLength={NAME_MAX_LEN}
            isRequired
            autoFocus
            isInvalid={name.length > 0 && !valid}
            errorMessage={t('core:title.nameInvalid')}
          />
          <Button type="submit" variant="primary" isDisabled={!valid}>
            {t('core:title.start')}
          </Button>
        </Stack>
      </Form>
    </Panel>
  );
}
