/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: 'var(--color-accent, #0468F0)',
        'accent-soft': 'var(--color-accent-soft, #1A7AF5)',
        'accent-pink': 'var(--color-accent-pink, #D81B7B)',
        'accent-pink-soft': 'var(--color-accent-pink-soft, #F0358F)',
        'accent-foreground': '#ffffff',
        highlight: 'var(--color-accent-soft, #1A7AF5)',
        cyan: '#42e8df',
        violet: '#6a5cff',
        surface: '#f3f4f6',
        page: 'var(--color-page, #f4f5f6)',
        cream: '#fff7ec',
      },
      fontFamily: {
        sans: ['var(--brand-font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'ui-monospace', 'monospace'],
        display: ['var(--brand-font-display)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '1rem',
        pill: '9999px',
      },
      boxShadow: {
        soft: '0 4px 24px rgba(0, 0, 0, 0.06)',
      },
    },
  },
  plugins: [],
};
