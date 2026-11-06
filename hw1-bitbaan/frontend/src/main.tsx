import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

if (!document.body.dataset.bugMode) document.body.dataset.bugMode = '0';
document.documentElement.dataset.bugMode ??= '0';
document.documentElement.dataset.ready = 'false';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
