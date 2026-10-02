import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../App';
import { createLocalPersistence, createMemoryStorage, STORAGE_KEY, type KeyValueStorage } from '../../data/persistence';
import { I18nProvider } from '../../i18n/I18nProvider';
import { LANGUAGES } from '../../i18n/languages';
import { loadLocale } from '../../i18n/registry';
import { StoreProvider } from '../../state/context';
import { AppStore } from '../../state/store';

let storage: KeyValueStorage;

function boot(): AppStore {
  const store = new AppStore(createLocalPersistence(storage), {
    now: () => new Date('2026-09-15T12:00:00'),
    newId: () => `id-${Math.random().toString(36).slice(2)}`,
    defaults: { language: 'en', currency: 'EUR' },
  });
  return store;
}

async function mount(store: AppStore): Promise<ReactElement> {
  await loadLocale(store.getSnapshot().data.settings.language);
  return (
    <StoreProvider store={store}>
      <I18nProvider>
        <App />
      </I18nProvider>
    </StoreProvider>
  );
}

/** Bidi isolates around inserted names are invisible; compare the visible words. */
const visible = (text: string) => text.replace(/[\u2066-\u2069]/g, '');

const saved = () => JSON.parse(storage.getItem(STORAGE_KEY)!).settings;

beforeEach(() => {
  storage = createMemoryStorage();
});

describe('onboarding', () => {
  it('asks for language, then name, then currency, then the goal — in that order', async () => {
    const user = userEvent.setup();
    render(await mount(boot()));

    // 1 — language comes first, with every language in its own script
    expect(screen.getByRole('heading', { name: 'What language would you like to use in the app?' })).toBeInTheDocument();
    for (const language of LANGUAGES) expect(screen.getByRole('radio', { name: new RegExp(language.nativeName.replace(/[()]/g, '\\$&')) })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    // 2 — name
    expect(screen.getByRole('heading', { name: 'What should we call you?' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Your name or nickname'), 'Alex');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    // 3 — currency, before any goal is asked, and nothing is pre-selected
    expect(screen.getByRole('heading', { name: 'Which currency would you like to use?' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Monthly goal amount')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('radio', { checked: true })).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a currency to continue.');
    await user.type(screen.getByRole('searchbox', { name: 'Search currencies' }), 'ruble');
    await user.click(screen.getByRole('radio', { name: /Russian Ruble/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    // 4 — the goal field shows the chosen currency, and formats as you type
    expect(screen.getByRole('heading', { name: 'What is your monthly income goal?' })).toBeInTheDocument();
    const goal = screen.getByLabelText('Monthly goal amount');
    expect(goal.closest('.amount-field')).toHaveTextContent('RUB');
    expect(goal).toHaveAttribute('placeholder', '200,000');
    await user.type(goal, '200000');
    expect(goal).toHaveValue('200,000');
    await user.click(screen.getByRole('button', { name: 'Start tracking' }));

    // done: personalised dashboard, everything saved
    expect(await screen.findByRole('heading', { level: 1, name: /Your income dashboard, .*Alex/ })).toBeInTheDocument();
    expect(saved()).toMatchObject({ language: 'en', name: 'Alex', currency: 'RUB', defaultMonthlyGoal: 20000000, onboardingCompleted: true });
    expect(screen.getByText(/Monthly goal: RUB\s?200,000/)).toBeInTheDocument();
    expect(await screen.findByText(/Welcome, .*Alex.*!/)).toBeInTheDocument();
  });

  it('switches the whole interface the moment a language is picked, and remembers it', async () => {
    const user = userEvent.setup();
    render(await mount(boot()));
    await user.click(screen.getByRole('radio', { name: /Español/ }));
    expect(await screen.findByRole('heading', { name: '¿Qué idioma quieres usar en la app?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeInTheDocument();
    expect(saved().language).toBe('es');
    expect(document.documentElement.lang).toBe('es-ES');
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('flips the document to right-to-left for Arabic and Urdu', async () => {
    const user = userEvent.setup();
    render(await mount(boot()));
    await user.click(screen.getByRole('radio', { name: /العربية/ }));
    await waitFor(() => expect(document.documentElement.dir).toBe('rtl'));
    expect(screen.getByRole('heading', { name: 'ما اللغة التي تريد استخدامها في التطبيق؟' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /اردو/ }));
    await waitFor(() => expect(document.documentElement.lang).toBe('ur-PK'));
    expect(document.documentElement.dir).toBe('rtl');
    await user.click(screen.getByRole('radio', { name: /English/ }));
    await waitFor(() => expect(document.documentElement.dir).toBe('ltr'));
  });

  it('keeps what you typed when you go back, and lets you skip the name', async () => {
    const user = userEvent.setup();
    render(await mount(boot()));
    await user.click(screen.getByRole('radio', { name: /Français/ }));
    await user.click(await screen.findByRole('button', { name: 'Continuer' }));
    await user.type(screen.getByLabelText('Votre nom ou pseudo'), 'Léa');
    await user.click(screen.getByRole('button', { name: 'Continuer' }));
    await user.click(screen.getByRole('button', { name: 'Retour' }));
    expect(screen.getByLabelText('Votre nom ou pseudo')).toHaveValue('Léa');
    await user.click(screen.getByRole('button', { name: 'Retour' }));
    expect(screen.getByRole('radio', { name: /Français/ })).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Continuer' }));
    await user.click(screen.getByRole('button', { name: 'Passer pour l’instant' }));
    expect(saved().name).toBe('');
  });

  it('rejects a name that is too long, with a friendly message', async () => {
    const user = userEvent.setup();
    render(await mount(boot()));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.type(screen.getByLabelText('Your name or nickname'), 'x'.repeat(50));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Keep your name under 40 characters.');
    expect(screen.getByRole('heading', { name: 'What should we call you?' })).toBeInTheDocument();
  });

  it('shows a first-launch progress indicator for all four steps', async () => {
    const user = userEvent.setup();
    render(await mount(boot()));
    expect(screen.getByText('Step 1 of 4')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Step 2 of 4')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Step 2 of 4' })).getAllByRole('listitem')).toHaveLength(4);
  });

  it('does not ask again once completed, and a restart keeps language, name, currency and goal', async () => {
    const user = userEvent.setup();
    const first = boot();
    const { unmount } = render(await mount(first));
    await user.click(screen.getByRole('radio', { name: /日本語/ }));
    await user.click(await screen.findByRole('button', { name: '続ける' }));
    await user.type(screen.getByLabelText('お名前またはニックネーム'), 'さくら');
    await user.click(screen.getByRole('button', { name: '続ける' }));
    await user.click(screen.getByRole('radio', { name: /日本円/ }));
    await user.click(screen.getByRole('button', { name: '続ける' }));
    await user.type(screen.getByLabelText('毎月の目標金額'), '300000');
    await user.click(screen.getByRole('button', { name: '記録を始める' }));
    expect(await screen.findByRole('heading', { level: 1, name: /さくら/ })).toBeInTheDocument();
    unmount();

    // "Restart": a brand-new store over the same storage.
    await act(async () => undefined);
    render(await mount(boot()));
    expect(await screen.findByRole('heading', { level: 1, name: (name) => visible(name) === 'さくらさんの収入ダッシュボード' })).toBeInTheDocument();
    expect(screen.queryByText('アプリで使う言語を選んでください')).not.toBeInTheDocument();
    expect(screen.getByText(/毎月の目標：.*300,000/)).toBeInTheDocument();
    expect(saved()).toMatchObject({ language: 'ja', name: 'さくら', currency: 'JPY', defaultMonthlyGoal: 30000000 });
  });

  it('leaves people who finished onboarding before names existed on the dashboard', async () => {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        settings: { currency: 'USD', defaultMonthlyGoal: 300000, theme: 'light', onboardingCompleted: true, language: 'en' },
        entries: [],
        goals: [],
      }),
    );
    render(await mount(boot()));
    expect(await screen.findByRole('heading', { level: 1, name: 'Your income dashboard' })).toBeInTheDocument();
    expect(screen.queryByText('What should we call you?')).not.toBeInTheDocument();
  });
});
