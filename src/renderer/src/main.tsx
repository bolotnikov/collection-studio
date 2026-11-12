import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './style.css';
import { LocalizationProvider } from './i18n/LocalizationContext';

const root = document.getElementById('root');
if (!root) throw new Error('Root element missing.');
createRoot(root).render(
  <React.StrictMode>
    <LocalizationProvider>
      <App />
    </LocalizationProvider>
  </React.StrictMode>,
);
