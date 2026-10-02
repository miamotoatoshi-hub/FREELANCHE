import { useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { exportEntriesCsv, parseEntriesCsv } from '../../domain/csv';
import { monthOf } from '../../domain/dates';
import { resolveMonthlyGoal } from '../../domain/goals';
import { importEntries, type ImportRow } from '../../domain/usecases';
import type { ThemePreference } from '../../domain/types';
import { languageInfo } from '../../i18n/languages';
import { useI18n } from '../../i18n/I18nProvider';
import { createId } from '../../lib/id';
import { useAppSelector, useAppStore } from '../../state/context';
import { ConfirmationDialog } from '../components/ConfirmationDialog';
import { CurrencySelector } from '../components/CurrencySelector';
import { Icon, type IconName } from '../components/Icon';
import { SegmentedControl } from '../components/SegmentedControl';
import { Sheet } from '../components/Sheet';
import { useErrorMessage } from '../hooks/useErrorMessage';
import { InfoSheet } from '../sheets/InfoSheet';
import { LanguageSheet } from '../sheets/LanguageSheet';
import { NameSheet } from '../sheets/NameSheet';
import { useUi } from '../UiContext';

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

interface ImportPreview {
  rows: ImportRow[];
  added: number;
  duplicates: number;
  invalid: number;
  otherCurrency: number;
}

type Overlay = 'currency' | 'language' | 'name' | 'privacy' | 'terms' | 'delete-all' | null;

export function SettingsScreen() {
  const { t, tn, fmt, currency, language } = useI18n();
  const nativeLanguage = languageInfo(language);
  const ui = useUi();
  const store = useAppStore();
  const errorMessage = useErrorMessage();

  const data = useAppSelector((s) => s.data);
  const today = useAppSelector((s) => s.today);
  const { settings, entries, goals } = data;

  const [overlay, setOverlay] = useState<Overlay>(null);
  const [pendingCurrency, setPendingCurrency] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const currentMonth = monthOf(today);
  const goal = resolveMonthlyGoal(goals, currentMonth, settings.defaultMonthlyGoal).amount;

  // ── currency ────────────────────────────────────────────────────────────────
  const applyCurrency = (code: string) => {
    const result = store.changeCurrency(code);
    setPendingCurrency(null);
    setOverlay(null);
    ui.toast(result.ok ? t('settings.saved') : errorMessage(result.error));
  };

  const chooseCurrency = (code: string) => {
    if (code === currency) {
      setOverlay(null);
    } else if (entries.length > 0) {
      setPendingCurrency(code); // amounts exist: say plainly what will (not) happen first
    } else {
      applyCurrency(code);
    }
  };

  // ── export ──────────────────────────────────────────────────────────────────
  const exportCsv = async () => {
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
  };

  // ── import ──────────────────────────────────────────────────────────────────
  const onFileChosen = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow choosing the same file again
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      ui.toast(t('import.error.read'));
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      ui.toast(t('import.error.read'));
      return;
    }
    const parsed = parseEntriesCsv(text, currency);
    if (!parsed.ok) {
      ui.toast(parsed.error === 'empty' ? t('import.error.empty') : t('import.error.format'));
      return;
    }
    const outcome = importEntries(data, parsed.rows, { now: () => new Date(), newId: createId });
    if (outcome.added === 0) {
      ui.toast(t('import.nothing'));
      return;
    }
    setPreview({
      rows: parsed.rows,
      added: outcome.added,
      duplicates: outcome.duplicates,
      invalid: parsed.invalid,
      otherCurrency: parsed.otherCurrency,
    });
  };

  const confirmImport = () => {
    if (!preview) return;
    const result = store.importRows(preview.rows);
    setPreview(null);
    ui.toast(result.ok ? tn('import.done', result.value.added) : errorMessage(result.error));
  };

  // ── delete everything ───────────────────────────────────────────────────────
  const deleteAll = () => {
    const result = store.deleteAllData();
    setOverlay(null);
    if (result.ok) window.location.hash = '#/';
    else ui.toast(errorMessage(result.error));
  };

  const themeOptions: { value: ThemePreference; label: string }[] = [
    { value: 'light', label: t('settings.theme.light') },
    { value: 'dark', label: t('settings.theme.dark') },
    { value: 'system', label: t('settings.theme.system') },
  ];

  return (
    <div className="screen">
      <header className="topbar">
        <h1 className="title">{t('settings.title')}</h1>
      </header>

      <Group title={t('settings.section.profile')}>
        <Row
          label={t('settings.name')}
          value={settings.name || t('settings.name.none')}
          valueAttrs={settings.name ? { dir: 'auto' } : undefined}
          onClick={() => setOverlay('name')}
        />
        <Row
          label={t('settings.language')}
          value={nativeLanguage.nativeName}
          valueAttrs={{ lang: nativeLanguage.code, dir: nativeLanguage.dir }}
          onClick={() => setOverlay('language')}
        />
      </Group>

      <Group title={t('settings.section.finance')}>
        <Row label={t('settings.currency')} value={`${currency}`} onClick={() => setOverlay('currency')} />
        <Row
          label={t('settings.goal')}
          value={goal > 0 ? fmt.money(goal) : t('settings.goal.none')}
          onClick={() => ui.openGoal(currentMonth, 'fromNow')}
        />
        <p className="group-note">{t('settings.goal.hint')}</p>
      </Group>

      <Group title={t('settings.section.appearance')}>
        <div className="setting">
          <span className="setting__label">{t('settings.theme')}</span>
          <SegmentedControl<ThemePreference> label={t('settings.theme')} value={settings.theme} options={themeOptions} onChange={(value) => void store.setTheme(value)} />
        </div>
      </Group>

      <Group title={t('settings.section.data')}>
        <Row icon="download" label={t('settings.export')} hint={t('settings.export.hint')} onClick={() => void exportCsv()} />
        <Row icon="upload" label={t('settings.import')} hint={t('settings.import.hint')} onClick={() => fileInput.current?.click()} />
        <Row icon="trash" tone="danger" label={t('settings.deleteAll')} hint={t('settings.deleteAll.hint')} onClick={() => setOverlay('delete-all')} />
        <input ref={fileInput} type="file" accept=".csv,text/csv" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(event) => void onFileChosen(event)} />
      </Group>

      <Group title={t('settings.section.about')}>
        <div className="row row--static">
          <span className="row__label">{t('settings.version')}</span>
          <span className="row__value">{__APP_VERSION__}</span>
        </div>
        <Row label={t('settings.privacy')} onClick={() => setOverlay('privacy')} />
        <Row label={t('settings.terms')} onClick={() => setOverlay('terms')} />
      </Group>

      {overlay === 'currency' && (
        <Sheet title={t('settings.currency')} onClose={() => setOverlay(null)}>
          <CurrencySelector value={currency} onSelect={chooseCurrency} contained headingLevel={3} />
        </Sheet>
      )}

      {overlay === 'language' && <LanguageSheet onClose={() => setOverlay(null)} />}
      {overlay === 'name' && <NameSheet onClose={() => setOverlay(null)} />}

      {pendingCurrency && (
        <ConfirmationDialog
          title={t('currency.change.title', { currency: pendingCurrency })}
          description={t('currency.change.text', { currency: pendingCurrency })}
          confirmLabel={t('currency.change.confirm')}
          onConfirm={() => applyCurrency(pendingCurrency)}
          onCancel={() => setPendingCurrency(null)}
        />
      )}

      {overlay === 'privacy' && (
        <InfoSheet title={t('privacy.title')} paragraphs={[t('privacy.p1'), t('privacy.p2'), t('privacy.p3')]} onClose={() => setOverlay(null)} />
      )}
      {overlay === 'terms' && (
        <InfoSheet title={t('terms.title')} paragraphs={[t('terms.p1'), t('terms.p2'), t('terms.p3')]} onClose={() => setOverlay(null)} />
      )}

      {overlay === 'delete-all' && (
        <ConfirmationDialog
          title={t('deleteAll.title')}
          description={t('deleteAll.text')}
          confirmLabel={t('deleteAll.confirm')}
          tone="danger"
          onConfirm={deleteAll}
          onCancel={() => setOverlay(null)}
        />
      )}

      {preview && (
        <ConfirmationDialog
          title={t('import.title')}
          description={
            <ul className="import-summary">
              <li>
                <strong>{tn('import.new', preview.added)}</strong>
              </li>
              {preview.duplicates > 0 && <li>{tn('import.duplicates', preview.duplicates)}</li>}
              {preview.invalid > 0 && <li>{tn('import.invalid', preview.invalid)}</li>}
              {preview.otherCurrency > 0 && <li>{tn('import.otherCurrency', preview.otherCurrency)}</li>}
            </ul>
          }
          confirmLabel={t('import.confirm')}
          onConfirm={confirmImport}
          onCancel={() => setPreview(null)}
        />
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-group">
      <h2 className="settings-group__title">{title}</h2>
      <div className="card card--list">{children}</div>
    </section>
  );
}

interface RowProps {
  label: string;
  value?: string;
  /** `lang` / `dir` for the value, e.g. a language name written in its own script. */
  valueAttrs?: { lang?: string; dir?: 'ltr' | 'rtl' | 'auto' };
  hint?: string;
  icon?: IconName;
  tone?: 'danger';
  onClick: () => void;
}

function Row({ label, value, valueAttrs, hint, icon, tone, onClick }: RowProps) {
  return (
    <button type="button" className={`row${tone === 'danger' ? ' row--danger' : ''}`} onClick={onClick}>
      {icon && <Icon name={icon} size={22} className="row__icon" />}
      <span className="row__text">
        <span className="row__label">{label}</span>
        {hint && <span className="row__hint">{hint}</span>}
      </span>
      {value && (
        <span className="row__value" {...valueAttrs}>
          {value}
        </span>
      )}
      {!icon && <Icon name="chevronRight" size={18} className="row__chevron" />}
    </button>
  );
}
