/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Segoe UI Variable', 'Segoe UI', 'SF Pro Display', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Cascadia Code', 'SF Mono', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        os: {
          bg: '#07080d',
          panel: '#0f1119',
          panel2: '#151826',
          line: 'rgba(255,255,255,0.08)',
          accent: 'rgb(var(--os-accent) / <alpha-value>)',
        },
      },
      boxShadow: {
        window: '0 30px 80px -20px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.07)',
        glow: '0 0 0 4px rgb(var(--os-accent) / 0.95), 0 0 40px 8px rgb(var(--os-accent) / 0.55)',
      },
      keyframes: {
        'fade-in': { from: { opacity: 0 }, to: { opacity: 1 } },
        'pop-in': { from: { opacity: 0, transform: 'scale(.94) translateY(8px)' }, to: { opacity: 1, transform: 'none' } },
        'slide-up': { from: { opacity: 0, transform: 'translateY(24px)' }, to: { opacity: 1, transform: 'none' } },
        'pulse-soft': { '0%,100%': { opacity: 0.45 }, '50%': { opacity: 1 } },
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
      },
      animation: {
        'fade-in': 'fade-in .25s ease-out both',
        'pop-in': 'pop-in .22s cubic-bezier(.2,.9,.3,1.2) both',
        'slide-up': 'slide-up .35s cubic-bezier(.2,.8,.2,1) both',
        'pulse-soft': 'pulse-soft 2.4s ease-in-out infinite',
        float: 'float 2.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
