import { NAME_MAX_LEN } from '@alliance/contract/match.js';
import { type FormEvent, useState } from 'react';
import { Form } from 'react-aria-components';
import type { AllianceApi } from '../infra/boot/api.js';
import { settingsStore } from '../infra/store/settings.js';
import { useText } from '../infra/text/index.js';
import { cx } from '../infra/theme/class-name.js';
import { Button, TextField } from '../ui/index.js';
import styles from './screen.module.css';

export function TitleScreen({ api }: { readonly api: AllianceApi }) {
  const t = useText();
  const [name, setName] = useState(() => settingsStore.getState().name);
  const valid = name.trim().length > 0 && name.trim().length <= NAME_MAX_LEN;
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (valid) {
      api.enter(name);
    }
  };
  return (
    <div className={cx(styles.screen)}>
      <h1 className={cx(styles.heading)}>{t('core:app.title')}</h1>
      <Form onSubmit={submit} className={cx(styles.row)}>
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
      </Form>
    </div>
  );
}
