import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: {
          DEFAULT: '#f8f1df',
          light: '#fffdf6',
          deep: '#efe3c8',
          shadow: '#d8c9ab',
        },
        ink: {
          DEFAULT: '#203346',
          soft: '#52646f',
          faint: '#5f6f78',
        },
        terracotta: '#b84b3d',
        chalk: '#f4efe3',
        desk: '#335a56',
        'desk-dark': '#23443f',
        mustard: {
          DEFAULT: '#dfa93f',
          ink: '#7b5a12',
        },
        teal: '#33796f',
        rose: '#a94b5b',
        sky: '#3d6f88',
        leaf: '#3f7350',
      },
      fontFamily: {
        bangla: ['"Hind Siliguri"', '"Noto Sans Bengali"', 'sans-serif'],
        display: ['"Tiro Bangla"', '"Hind Siliguri"', 'serif'],
        hand: ['"Caveat"', 'cursive'],
        mono: ['"Courier Prime"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        paper: '0 1px 1px rgba(50,40,20,.08), 0 8px 24px rgba(68,49,21,.12)',
        'paper-lift': '0 2px 2px rgba(50,40,20,.08), 0 18px 42px rgba(68,49,21,.18)',
        slot: 'inset 0 2px 8px rgba(40,30,10,.08)',
      },
      borderRadius: {
        paper: '3px',
      },
      backgroundImage: {
        'notebook-lines':
          'repeating-linear-gradient(to bottom, transparent 0, transparent 31px, rgba(78,124,148,.20) 31px, rgba(78,124,148,.20) 32px)',
        scribble:
          'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'120\' height=\'8\'%3E%3Cpath d=\'M1 5C14 1 21 7 37 4S63 1 77 5s31 1 42-2\' fill=\'none\' stroke=\'%23b84b3d\' stroke-width=\'1.4\' stroke-linecap=\'round\'/%3E%3C/svg%3E")',
      },
      keyframes: {
        wiggle: {
          '0%, 100%': { transform: 'rotate(-1.5deg)' },
          '50%': { transform: 'rotate(1.5deg)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        'ink-in': {
          from: { clipPath: 'inset(0 100% 0 0)', opacity: '0.3' },
          to: { clipPath: 'inset(0 0 0 0)', opacity: '1' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(223,169,63,.45)' },
          '70%': { boxShadow: '0 0 0 12px rgba(223,169,63,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(223,169,63,0)' },
        },
      },
      animation: {
        wiggle: 'wiggle 3s ease-in-out infinite',
        float: 'float 4s ease-in-out infinite',
        'ink-in': 'ink-in .55s ease-out both',
        'pulse-ring': 'pulse-ring 1.8s ease-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
