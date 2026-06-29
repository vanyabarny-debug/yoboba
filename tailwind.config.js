/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: '#ff3d6e',
        'accent-soft': '#ff8aa8',
        highlight: '#2378ff',
        cyan: '#42e8df',
        violet: '#6a5cff',
        surface: '#f3f4f6',
        page: '#f4f5f6',
        cream: '#fff7ec',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'ui-monospace', 'monospace'],
        display: ['var(--font-montserrat-alt)', 'var(--font-inter)', 'system-ui', 'sans-serif'],
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
