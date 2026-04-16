import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './index.css';

if (!import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      void registration.unregister();
    }
  });

  if ('caches' in window) {
    void caches.keys().then((keys) => {
      for (const key of keys) {
        void caches.delete(key);
      }
    });
  }
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  registerSW({ immediate: true });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);