import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'tg-bg': 'var(--bg)',
        'tg-text': 'var(--text)',
        'tg-hint': 'var(--hint)',
        'tg-link': 'var(--link)',
        'tg-button': 'var(--button)',
        'tg-button-text': 'var(--button-text)',
        'tg-secondary-bg': 'var(--secondary-bg)',
      },
    },
  },
  plugins: [],
};

export default config;
