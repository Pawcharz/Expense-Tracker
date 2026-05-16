import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App';
import { AuthProvider } from './hooks/useAuth.jsx';
import { LanguageProvider } from './hooks/useLanguage.jsx';
import { CurrencyProvider } from './hooks/useCurrency.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <LanguageProvider>
          <CurrencyProvider>
            <App />
          </CurrencyProvider>
        </LanguageProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
