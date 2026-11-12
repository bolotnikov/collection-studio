import { useState, type FormEvent } from 'react';
import type { Bootstrap, Brief } from '../../../shared/Contracts';

export function useBriefViewModel(data: Bootstrap, onStart: (brief: Brief) => Promise<void>) {
  const [theme, setTheme] = useState('');
  const [wishes, setWishes] = useState('');
  const [variants, setVariants] = useState(1);
  const ready =
    data.codexReady &&
    (data.settings.provider === 'codex' ? data.codexReady : data.hasKey) &&
    data.referenceCount > 0;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onStart({
      theme,
      wishes,
      variants,
      quality: 'low',
      autoRepair: true,
      maxImageCalls: Math.min(150, variants * 10 * (1 + data.productionPolicy.maxRepairsPerCard)),
    });
  };
  return { theme, setTheme, wishes, setWishes, variants, setVariants, ready, submit };
}
