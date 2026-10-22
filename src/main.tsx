import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { prepareStorage } from './telegram/telegram';
import './ui/styles.css';

// Telegram ichida: foydalanuvchi saqlash joyi va bulutdagi nusxa o'yin boshlanishidan oldin (tarmoqsiz ham davom etadi)
void prepareStorage().catch(() => null).finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
