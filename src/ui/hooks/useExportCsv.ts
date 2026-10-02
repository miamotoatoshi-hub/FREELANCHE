import { useCallback } from 'react';
import { exportEntriesCsv } from '../../domain/csv';
import { useI18n } from '../../i18n/I18nProvider';
import { useAppSelector } from '../../state/context';
import { useUi } from '../UiContext';

/**
 * "Export data": hands the income history over as a CSV file. Used by Settings and by the locked screen,
 * because people can always take their own data with them — subscribed or not.
 */
export function useExportCsv(): () => Promise<void> {
  const { t } = useI18n();
  const ui = useUi();
  const entries = useAppSelector((s) => s.data.entries);
  const today = useAppSelector((s) => s.today);

  return useCallback(async () => {
    if (entries.length === 0) {
      ui.toast(t('settings.export.empty'));
      return;
    }
    const filename = `freelanche-income-${today}.csv`;
    const blob = new Blob([exportEntriesCsv(entries)], { type: 'text/csv;charset=utf-8' });
    const file = new File([blob], filename, { type: 'text/csv' });

    // On phones use the native share sheet ("Save to Files", email, …); elsewhere download directly.
    const touch = window.matchMedia?.('(pointer: coarse)').matches;
    if (touch && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    ui.toast(t('settings.export.done'));
  }, [entries, today, t, ui]);
}
