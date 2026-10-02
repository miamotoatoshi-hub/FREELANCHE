/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

/** 'play' in real builds; 'mock' in dev, unit tests and the end-to-end build. See vite.config.ts. */
declare const __BILLING_MODE__: 'play' | 'mock';
