import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ocean:   { DEFAULT: '#0C447C', light: '#E6F1FB', dark: '#083260' },
        sand:    { DEFAULT: '#BA7517', light: '#FAEEDA' },
        coral:   { DEFAULT: '#D85A30', light: '#FAECE7' },
        resort:  { green: '#3B6D11', 'green-light': '#EAF3DE' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
