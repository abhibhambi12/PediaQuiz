// frontend/src/setupTests.ts
import '@testing-library/jest-dom';

// Mock matchMedia for components that use it (e.g., for responsive design or theme switching)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock Firebase services to prevent actual API calls during tests
jest.mock('@/firebase', () => ({
  auth: jest.fn(),
  db: jest.fn(),
  storage: jest.fn(),
  functions: jest.fn(),
  app: jest.fn(),
}));

// Mock the PWA registration module from Vite
jest.mock('virtual:pwa-register/react', () => ({
    useRegisterSW: () => ({
      needRefresh: [false, jest.fn()],
      offlineReady: [false, jest.fn()],
      updateServiceWorker: jest.fn(),
    }),
}));