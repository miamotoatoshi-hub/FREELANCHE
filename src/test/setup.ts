import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Unmount React trees and reset the browser-ish globals between tests.
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});
