/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: 'var(--color-accent, #FF6B6B)',
        'accent-soft': 'var(--color-accent-soft, #002D7A)',
        'accent-pink': 'var(--color-accent-pink, #FF6B6B)',
        'accent-pink-soft': 'var(--color-accent-pink-soft, #002D7A)',
        'accent-foreground': '#ffffff',
        highlight: 'var(--color-accent-soft, #002D7A)',
        cyan: '#42e8df',
        violet: '#6a5cff',
        surface: '#ffffff',
        page: 'var(--color-page, #f4f5f6)',
        cream: '#fff7ec',
        mute: 'var(--brand-mute, #8b8689)',
      },
      fontFamily: {
        sans: ['var(--brand-font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'ui-monospace', 'monospace'],
        display: ['var(--brand-font-display)', 'cursive'],
        logo: ['var(--brand-font-logo)', 'system-ui', 'sans-serif'],
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
