# FinGam CRM — Project Brief for Claude Code

## Что это за проект

CRM-система для управления клиентами школы финансовой грамотности для детей (Узбекистан).
Владелец — Алексей. Основная задача: отслеживать клиентов, платежи, занятия и расходы компании.

## Деплой

- **GitHub репозиторий:** `MrAleksby/CRMBMK` (публичный)
- **Основной сайт:** https://crmbmk-d6303.web.app (Firebase Hosting)
- **Запасной сайт:** https://mraleksby.github.io/CRMBMK/ (GitHub Pages)
- **Локальная папка:** `/Users/Aleks/Documents/CRMBMK`

Firebase Hosting — деплой вручную, не зависит от GitHub:

```bash
VITE_BASE=/ npm run build
npx firebase deploy --only hosting --project crmbmk-d6303
```

GitHub Pages — автоматически при `git push` в `main` → GitHub Actions → ветка `gh-pages`.

Путь приложения задаётся переменной `VITE_BASE`: по умолчанию `/CRMBMK/` (подпапка Pages),
для Firebase — `/` (корень). `BrowserRouter` берёт `basename` из `import.meta.env.BASE_URL`.
Правила Firestore: `npx firebase deploy --only firestore:rules --project crmbmk-d6303`

## Технический стек

- **React 19** + Vite
- **Tailwind CSS** (через @tailwindcss/vite)
- **Firebase Auth** — авторизация (email/password)
- **Firestore** — база данных
- **React Router v7** с `basename="/CRMBMK"` (важно для GitHub Pages)

## Firebase проект

- **Project ID:** `crmbmk-d6303`
- **Auth Domain:** `crmbmk-d6303.firebaseapp.com`
- Ключи хранятся в `.env` (не в git) и в GitHub Secrets для CI/CD
- Firestore правила: только авторизованные пользователи могут читать/писать

## Структура файлов

```
src/
  App.jsx          — роутинг, sidebar, мобильная навигация
  AuthContext.jsx  — Firebase Auth контекст
  firebase.js      — инициализация Firebase
  main.jsx
  pages/
    Login.jsx      — страница входа
    Dashboard.jsx  — главный дашборд со сводкой
    Clients.jsx    — список клиентов, платежи, занятия
    Finance.jsx    — финансовая сводка с карточками метрик
    Expenses.jsx   — расходы компании
public/
  404.html         — редирект для React Router на GitHub Pages
```

## Коллекции Firestore

- **clients** — клиенты: `childName`, `childAge`, `parentName`, `phone`, `email`, `notes`, `createdAt`
- **payments** — платежи: `clientId`, `clientName`, `amount`, `type` ('income'|'session'), `sessions`, `description`, `date`
- **expenses** — расходы компании: `amount`, `category`, `description`, `date`

## Логика платежей

- `type: 'income'` — клиент платит компании
- `type: 'session'` — списание за проведённые занятия
- **Баланс клиента** = сумма income − сумма session
- Положительный баланс = предоплата (компания должна клиенту занятия)
- Отрицательный баланс = долг клиента

## Карточки метрик (Finance.jsx)

1. Оплаты клиентов — сумма income за период
2. Списано (занятия) — сумма session за период
3. Расходы компании — сумма expenses за период
4. Занятий — количество за период
5. Долги клиентов — сумма отрицательных балансов (все время)
6. Должны клиентам — сумма положительных балансов (предоплаты, все время)
7. Баланс компании — все оплаты клиентов − все расходы (все время)
8. Реализованная прибыль — Списано − Расходы за период

## Важные технические детали

- `basename` роутера берётся из `import.meta.env.BASE_URL` — не хардкодить `/CRMBMK`, иначе сломается Firebase Hosting
- Перед каждым Firestore запросом делаем `await auth.currentUser.getIdToken()` — иначе race condition при загрузке
- Все fetch-функции обёрнуты в `try/catch/finally` — `setLoading(false)` всегда в `finally`
- `public/404.html` + скрипт в `index.html` — решение 404 при обновлении страницы

## Как запустить локально

```bash
cd /Users/Aleks/Documents/CRMBMK
npm install
npm run dev
# открыть http://localhost:5173/CRMBMK/
```

## Как задеплоить

```bash
git add .
git commit -m "описание"
git push
# GitHub Actions соберёт и задеплоит автоматически (~2 мин)
```
