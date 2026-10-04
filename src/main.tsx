import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { StoreProvider } from './state/store';
import { SyncProvider } from './state/sync';
import { App } from './App';
import './styles/global.css';
import './styles/print.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <StoreProvider>
        <SyncProvider>
          <App />
        </SyncProvider>
      </StoreProvider>
    </HashRouter>
  </StrictMode>,
);
