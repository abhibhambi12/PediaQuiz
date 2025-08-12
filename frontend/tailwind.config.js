/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      // --- NEW: Custom Color Palette ---
      colors: {
        primary: {
          DEFAULT: '#1E90FF', 
          50: '#E0F0FF', 100: '#BFDEFF', 200: '#99CCFF', 300: '#66B3FF',
          400: '#3399FF', 500: '#1E90FF', 600: '#007ACC', 700: '#0066B3',
          800: '#004C80', 900: '#00334C', 950: '#001A26',
        },
        secondary: {
          DEFAULT: '#8A2BE2',
          50: '#F0E0FF', 100: '#E1BFFF', 200: '#CE99FF', 300: '#B366FF',
          400: '#9933FF', 500: '#8A2BE2', 600: '#7322BD', 700: '#5C1C99',
          800: '#461575', 900: '#2F0F50', 950: '#170728',
        },
        neutral: {
          DEFAULT: '#334155', 50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0',
          300: '#cbd5e1', 400: '#94a3b8', 500: '#64748b', 600: '#475569',
          700: '#334155', 800: '#1e293b', 900: '#0f172a', 950: '#020617',
        },
        success: {
          DEFAULT: '#28A745', 50: '#EAF6EC', 100: '#D5EBD9', 200: '#B0D7BB',
          300: '#8AC29D', 400: '#66AD7E', 500: '#28A745', 600: '#208537',
          700: '#18642A', 800: '#10421C', 900: '#08210E', 950: '#041107',
        },
        danger: {
          DEFAULT: '#DC3545', 50: '#FDECEE', 100: '#FBD7DA', 200: '#F7B0B5',
          300: '#F1888F', 400: '#EB5C66', 500: '#DC3545', 600: '#AE2A36',
          700: '#821F28', 800: '#55151A', 900: '#280A0D', 950: '#140506',
        },
        warning: {
          DEFAULT: '#FFC107', 50: '#FFF8E6', 100: '#FFF3CD', 200: '#FFECA1',
          300: '#FFE475', 400: '#FFD73D', 500: '#FFC107', 600: '#CC9A00',
          700: '#997400', 800: '#664E00', 900: '#332700', 950: '#1A1300',
        },
      },
      // --- NEW: Custom Font Family ---
      fontFamily: {
        inter: ['Inter', 'sans-serif'],
      },
      // --- NEW: Custom Keyframe Animations ---
      keyframes: {
        'fade-in-up': { '0%': { opacity: '0', transform: 'translateY(10px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        'fade-in-down': { '0%': { opacity: '0', transform: 'translateY(-10px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        'pop-in': { '0%': { opacity: '0', transform: 'scale(0.9)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
        'pulse-subtle': { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.7' } }
      },
      // --- NEW: Custom Animation Utilities ---
      animation: {
        'fade-in-up': 'fade-in-up 0.3s ease-out forwards',
        'fade-in-down': 'fade-in-down 0.3s ease-out forwards',
        'pop-in': 'pop-in 0.2s ease-out forwards',
        'pulse-subtle': 'pulse-subtle 1.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}