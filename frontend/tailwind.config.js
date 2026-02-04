/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Sora"', 'ui-sans-serif', 'system-ui'],
        body: ['"DM Sans"', 'ui-sans-serif', 'system-ui']
      },
      colors: {
        ink: {
          950: '#0b0c10',
          900: '#12141b',
          800: '#1a1e29',
          700: '#242b3a',
          600: '#2f384a'
        },
        gold: {
          300: '#f6e7b5',
          400: '#e9cc7a',
          500: '#d4b162'
        },
        ocean: {
          500: '#43c6f5',
          600: '#2bb0e3'
        }
      },
      boxShadow: {
        glow: '0 20px 60px rgba(30, 193, 255, 0.18)',
        soft: '0 10px 40px rgba(0,0,0,0.2)'
      },
      keyframes: {
        floaty: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' }
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' }
        }
      },
      animation: {
        floaty: 'floaty 6s ease-in-out infinite',
        shimmer: 'shimmer 2.4s linear infinite'
      }
    }
  },
  plugins: []
}
