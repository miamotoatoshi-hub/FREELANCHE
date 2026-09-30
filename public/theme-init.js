// Applies a saved light/dark choice before the first paint. ("system" is handled purely by CSS.)
try {
  var theme = window.localStorage.getItem('freelanche:theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme);
} catch {
  /* storage unavailable: fall back to the system appearance */
}
