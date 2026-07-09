# FinGam CRM — Project Brief for Claude Code

> **Текущая большая задача:** переезд с AlfaCRM (`bmk.s20.online`).
> Полное обследование старой системы, целевая модель данных и план по фазам —
> в `docs/ALFACRM_MIGRATION.md`. Читать перед любой доработкой функционала.

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
  firebase.js      — инициализация Firebase (long-polling против зависаний)
  pages/
    Login.jsx      — вход
    Dashboard.jsx  — сводка
    Clients.jsx    — таблица учеников
    ClientCard.jsx — карточка ученика /clients/:id, две колонки
    Groups.jsx     — группы = серии занятий
    Lessons.jsx    — календарь и список уроков, журнал
    Finance.jsx    — финансовая сводка
    Expenses.jsx   — расходы компании
    Settings.jsx   — справочники
  components/
    ClientForm.jsx        GroupForm.jsx        LessonForm.jsx
    LessonCalendar.jsx    LessonModal.jsx      LessonJournal.jsx
    AttendanceWidget.jsx  StudentChecklist.jsx SubscriptionForm.jsx
    DirectoryTable.jsx    ErrorBanner.jsx
  lib/
    client.js       — хелперы ученика (возраст, контакты, статусы)
    group.js        — серии занятий, генерация дат
    lesson.js       — журнал, плитки виджета посещений
    subscription.js — абонементы, остаток уроков, подстановка цены
    calendar.js     — сетка месяц/неделя/день
    directories.js  — описание справочников (декларативно)
    amount.js  backup.js  withTimeout.js
public/
  404.html         — редирект для React Router на GitHub Pages
```

## Коллекции Firestore

- **clients** — ученики: `childName`, `birthDate`, `gender`, `mother`/`father` (ФИО, телефоны списком, Instagram, Telegram), `childContacts`, `source`, `allergies`, `notes`, `lessonPrice`, `payerType`, `legalEntityId`, `status`
- **payments** — движение денег: `clientId`, `amount`, `type` ('income'|'session'), `sessions`, `description`, `date`, `lessonId` (для отката)
- **expenses** — расходы компании: `amount`, `category`, `description`, `date`
- **groups** — серии занятий: расписание + состав
- **lessons** — занятия: дата, время, статус, `studentIds`, `attendance` с суммами
- **subscriptions** — выданные абонементы: `lessonsTotal`, `lessonsUsed`, `price`, срок
- **справочники**: `teachers`, `packages`, `accounts`, `categories`, `legalEntities`

Полная схема и решения — `docs/ALFACRM_MIGRATION.md`.

## Логика платежей и занятий

- `type: 'income'` — клиент платит компании
- `type: 'session'` — списание за проведённое занятие
- **Баланс клиента** = сумма income − сумма session. Плюс — предоплата, минус — долг.
- **Остаток в уроках** = сумма `lessonsTotal − lessonsUsed` по действующим абонементам

**Неприкосновенность проведённых занятий.** Правка состава группы, смена расписания
и удаление группы касаются только запланированных занятий. За проведёнными стоят
списания: изменение задним числом сдвинет балансы учеников.

**Откат.** Списание помечено `lessonId`, посещение хранит `subscriptionId`. Поэтому
«Вернуть в запланированные» и «Отменить занятие» возвращают и деньги, и уроки —
одной транзакцией `writeBatch`.

**Цена занятия** всегда вводится вручную и уже включает питание. Система подставляет
подсказку: абонемент (`price ÷ lessonsCount`) → персональная цена ребёнка → пусто.

## Карточки метрик (Finance.jsx)

1. Оплаты клиентов — сумма income за период
2. Списано (занятия) — сумма session за период
3. Расходы компании — сумма expenses за период
4. Занятий — количество за период
5. Долги клиентов — сумма отрицательных балансов (все время)
6. Должны клиентам — сумма положительных балансов (предоплаты, все время)
7. Баланс компании — все оплаты клиентов − все расходы (все время)
8. Реализованная прибыль — Списано − Расходы за период

## Правила по стилям и цвету

Интерфейс светлый: белые карточки (`#ffffff`) на сером фоне (`#f1f2f4`), основной текст `#111827`,
вторичный `#6b7280`, приглушённый `#4b5563`, рамки `#e5e7eb`.
Смысл цвета: зелёный (`#059669`) — оплата, красный (`#dc2626`) — долг, фиолетовый (`#7c3aed`) — акцент.
Белый текст (`#fff`) допустим **только** на цветных кнопках.

**Обязательная проверка после любых правок цвета.** Стили заданы инлайном и часто через условие,
например `color: key === 'name' ? '#fff' : '#4b5563'`. Массовая замена по шаблону `color: '#fff'`
такие строки не находит — так уже был потерян текст названий в справочниках: белый на белом.
Поэтому после изменения палитры прогонять:

```bash
# светлые цвета, использованные как цвет текста
grep -rn "color: '#\(fff\|ffffff\|f7f8fa\|f3f4f6\|ede9fe\|e5e7eb\|dcfce7\|fee2e2\)'" src
# условные выражения с белым текстом
grep -rn "? '#fff'" src
```

Каждое совпадение должно быть текстом на цветной кнопке. Всё остальное — невидимый текст.
Проверять глазами все вкладки, а не только изменённую: стили дублируются по файлам.

Поля ввода обязаны иметь видимое состояние фокуса (`index.css`) — на светлом фоне без него
не понять, где курсор.

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
