import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/plus-jakarta-sans';
import './index.css';
import App from './App';
import { ErrorBoundary } from '@/components/ErrorBoundary';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Jaring terakhir (PRD-FE §9): layar kiosk tidak boleh pernah blank. */}
    <ErrorBoundary level="app" label="Kiosk">
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
