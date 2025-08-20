// frontend/src/main.tsx
// frontend/src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// The QueryClientProvider is now part of App.tsx, so no need to import/wrap here.
// This file is simplified to just render the App component.

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);