import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { initSecurityConsoleWarning } from './utils/securityConsoleWarning';
import './index.css';

initSecurityConsoleWarning();

ReactDOM.createRoot(document.getElementById('root')!).render(
 <React.StrictMode>
 <App />
 </React.StrictMode>
);
