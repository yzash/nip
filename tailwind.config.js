/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#0F1115',
        panel: '#171A21',
        panel2: '#1D212A',
        raised: '#232834',
        line: '#2A2F3A',
        line2: '#353B48',
        ink: '#F2F3F5',
        muted: '#A3AAB8',
        faint: '#6B7280',
        ioh: { red: '#E4002B', yellow: '#FFD100' },
        ok: '#2ECC71',
        warn: '#F5A623',
        bad: '#FF3B3B',
        nodata: '#6B7280',
        prog: '#8B5CF6',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['10px', '14px'],
        xs: ['11px', '16px'],
        sm: ['12.5px', '18px'],
        base: ['13.5px', '20px'],
      },
    },
  },
  plugins: [],
}
