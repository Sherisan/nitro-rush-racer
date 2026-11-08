import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './scenes/index.js';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
