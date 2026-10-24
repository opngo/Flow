/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: 'var(--surface)',
        s1: 'var(--surface-1)',
        s2: 'var(--surface-2)',
        s3: 'var(--surface-3)',
        ink: 'var(--text)',
        muted: 'var(--text-muted)',
        faint: 'var(--text-faint)',
        accent: 'var(--accent)',
        accentsoft: 'var(--accent-soft)',
        success: 'var(--success)',
        warning: 'var(--warning)',
        danger: 'var(--danger)',
      },
      borderRadius: { xl2: 'var(--radius)', xl3: 'calc(var(--radius) * 1.4)' },
      fontFamily: {
        ui: 'var(--font-ui)',
        content: 'var(--font-content)',
        timer: 'var(--font-timer)',
        mono: 'var(--font-mono)',
      },
      boxShadow: {
        soft: 'var(--shadow-1)',
        lift: 'var(--shadow-2)',
        float: 'var(--shadow-3)',
      },
      transitionDuration: { DEFAULT: '180ms' },
    },
  },
  plugins: [],
};
