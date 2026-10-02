// Runs before the first paint: applies a saved light/dark choice and the interface
// language's direction, so there is no flash of the wrong theme or of left-to-right text.
// ("system" theme is handled purely by CSS.)
try {
  var storage = window.localStorage;
  var theme = storage.getItem('freelanche:theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme);

  var language = storage.getItem('freelanche:lang');
  if (language) {
    document.documentElement.lang = language;
    // Keep in step with the right-to-left languages in src/i18n/languages.ts (a unit test checks this).
    document.documentElement.dir = language === 'ar' || language === 'ur' ? 'rtl' : 'ltr';
  }
} catch {
  /* storage unavailable: fall back to the system appearance and the page default */
}
