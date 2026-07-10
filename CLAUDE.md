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
    Finance.jsx    — кассы, статьи, лента операций и начислений
    Settings.jsx   — справочники + перенос финансов
  components/
    ClientForm.jsx        GroupForm.jsx        LessonForm.jsx
    LessonCalendar.jsx    LessonModal.jsx      LessonJournal.jsx
    AttendanceWidget.jsx  StudentChecklist.jsx SubscriptionForm.jsx
    DirectoryTable.jsx    ErrorBanner.jsx      TransactionForm.jsx
    MigrationPanel.jsx
  lib/
    client.js       — хелперы ученика (возраст, контакты, статусы)
    group.js        — серии занятий, генерация дат
    lesson.js       — журнал, плитки виджета, планировщик правки проведённого занятия
    subscription.js — абонементы, остаток уроков, подстановка цены
    finance.js      — модель операций, агрегации по кассам и статьям
    balance.js      — единственное место расчёта баланса ученика
    transaction.js  — форма операции: пустое состояние, валидация, сборка документа
    migrate.js      — план переноса старой модели и сверка сумм (чистый, без Firestore)
    migrate-run.js  — запись миграции в Firestore
    calendar.js     — сетка месяц/неделя/день
    directories.js  — описание справочников (декларативно)
    constants.js    — названия месяцев
    amount.js  backup.js  withTimeout.js
public/
  404.html         — редирект для React Router на GitHub Pages
```

## Коллекции Firestore

- **clients** — ученики: `childName`, `birthDate`, `gender`, `mother`/`father` (ФИО, телефоны списком, Instagram, Telegram), `childContacts`, `source`, `allergies`, `notes`, `lessonPrice`, `payerType`, `legalEntityId`, `status`
- **transactions** — движение реальных денег: `kind` ('income'|'expense'|'salary'), `amount`, `date`, `accountId`, `categoryId`, `clientId?`, `payerName?`, `teacherId?`, `comment`, `sourceId?` (след миграции)
- **charges** — начисление ученику за занятие: `clientId`, `amount`, `lessons`, `date`, `description`, `lessonId?`
- **groups** — серии занятий: расписание + состав
- **lessons** — занятия: дата, время, статус, `studentIds`, `attendance` с суммами
- **subscriptions** — выданные абонементы: `lessonsTotal`, `lessonsUsed`, `price`, срок
- **справочники**: `teachers`, `packages`, `accounts`, `categories`, `legalEntities`
- **payments**, **expenses** — старая модель. Оставлены до сверки сумм, кодом не читаются.

Полная схема и решения — `docs/ALFACRM_MIGRATION.md`.

## Логика денег и занятий

Деньги и учёба разведены по разным коллекциям, как в AlfaCRM: касса — отдельно,
лицевой счёт ученика — отдельно.

- **transactions** — реальные деньги. У каждой операции обязательны касса и статья.
- **charges** — начисление за проведённое занятие. Кассы не имеет: денег не двигало, вырос долг.

Смешивать нельзя: иначе отчёт по кассам обязан всюду помнить про фильтр, и первая же
забытая проверка испортит цифры.

- **Баланс клиента** = его доходные операции − его начисления. Плюс — предоплата, минус — долг.
  Считается только в `src/lib/balance.js`.
- **Баланс компании** = сумма по кассам: доходы − расходы − выплаты ЗП.
- **Остаток в уроках** = сумма `lessonsTotal − lessonsUsed` по действующим абонементам
- Доход без `clientId` (кешбек, турнир) — деньги компании, на баланс ученика не влияет.

**Неприкосновенность проведённых занятий.** Правка состава группы, смена расписания
и удаление группы касаются только запланированных занятий. За проведёнными стоят
начисления: изменение задним числом сдвинет балансы учеников.

**Но исправить конкретное проведённое занятие можно** — суммы иногда вводят с ошибкой.
Точка входа одна: кнопка «Изменить журнал» на странице «Уроки». Сумма живёт в двух местах
(`lessons.attendance[].amountCharged` и `charges.amount`), поэтому правка идёт через
`planAttendanceUpdate` в `src/lib/lesson.js` и одной транзакцией обновляет журнал,
начисления и остатки абонементов. Править `charges` напрямую нельзя: начисление с `lessonId`
заблокировано и в карточке клиента, и в ленте финансов.

**Откат.** Начисление помечено `lessonId`, посещение хранит `subscriptionId`. Поэтому
«Вернуть в запланированные» и «Отменить занятие» возвращают и деньги, и уроки —
одной транзакцией `writeBatch`.

**Цена занятия** всегда вводится вручную и уже включает питание. Система подставляет
подсказку: абонемент (`price ÷ lessonsCount`) → персональная цена ребёнка → пусто.

## Карточки метрик (Finance.jsx)

1. Доходы — сумма операций `income` за период
2. Списано (занятия) — сумма `charges` за период
3. Расходы компании — сумма операций `expense` за период
4. Выплаты ЗП — сумма операций `salary` за период
5. Занятий — сумма `charges.lessons` за период
6. Долги клиентов — сумма отрицательных балансов (всё время)
7. Должны клиентам — сумма положительных балансов (предоплаты, всё время)
8. Баланс компании — доходы − расходы − ЗП (всё время). Равен сумме остатков по кассам.
9. Реализованная прибыль — Списано − Расходы − ЗП за период

Инвариант, проверяемый тестом: **сумма остатков по кассам = баланс компании**.

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
