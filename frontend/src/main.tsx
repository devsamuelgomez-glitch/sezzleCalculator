import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { createCalculatorClient } from './api/client';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('missing #root element');

const client = createCalculatorClient();

createRoot(root).render(
  <StrictMode>
    <App client={client} />
  </StrictMode>,
);
