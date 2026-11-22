import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'highstreet-purple': '#6253F1',
        'highstreet-purple-hover': '#5443D1',
        'highstreet-cyan': '#00f2fe',
        'highstreet-light-gray': '#F8F8FF',
        'highstreet-silver': '#8C8C8C',
        'highstreet-dark': '#030303',
      },
    },
  },
  plugins: [],
};

export default config;
