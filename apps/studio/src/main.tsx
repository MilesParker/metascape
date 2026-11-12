// SPDX-License-Identifier: EPL-2.0
import '@metascape/react/styles.css';
import './studio.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
