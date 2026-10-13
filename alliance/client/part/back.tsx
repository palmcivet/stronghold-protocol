import { useCanGoBack, useNavigate, useRouter } from '@tanstack/react-router';
import { useText } from '../infra/text/index.js';
import { Button, Icon } from '../ui/index.js';

/** Back to the page the player came from; to the lobby when the page was opened directly. */
export function BackButton() {
  const t = useText();
  const router = useRouter();
  const navigate = useNavigate();
  const canGoBack = useCanGoBack();
  return (
    <Button
      onPress={() => {
        if (canGoBack) {
          router.history.back();
        } else {
          void navigate({ to: '/' });
        }
      }}
    >
      <Icon name="back" />
      {t('core:common.back')}
    </Button>
  );
}
