# SpikeNet

SpikeNet - игровой маркетплейс с escrow-защитой и социальным слоем доверия.

Фокус проекта:

```text
лоты -> продавцы -> сделки -> escrow -> отзывы -> чат сделки -> модерация
```

Группы и личные чаты нужны как социальный слой вокруг сделок, а не как отдельная замена Discord.

## Быстрый Запуск

1. Установить зависимости:

```bash
npm install
```

2. Создать `.env`:

```bash
copy .env.example .env
```

3. Заполнить PostgreSQL и секрет:

```env
DB_USER=postgres
DB_HOST=localhost
DB_DATABASE=my_database
DB_PASSWORD=your_password
DB_PORT=5432
JWT_SECRET=replace_with_a_unique_32_plus_character_secret
```

4. Применить миграции:

```bash
npm run migrate
```

5. Добавить демо-данные:

```bash
npm run seed
```

6. Запустить сервер:

```bash
npm run dev
```

7. Открыть сайт:

```text
http://localhost:3001
```

## Демо-Данные

После `npm run seed` доступны демо-пользователи:

```text
zulamho
Ing1
gamer50
Ibra
KeySmith
SkinVault
BoostRoom
RobloxHub
PSNMarket
RiskyFox
```

Пароль у демо-аккаунтов:

```text
demo12345
```

Для новых аккаунтов включена проверка сложности пароля.

## Миграции

Миграции лежат в `migrations/` и применяются по порядку:

```bash
npm run migrate
```

Текущие важные миграции:

- `001_baseline.sql` - базовая схема.
- `002_market_admin.sql` - маркет, сделки, роли модерации.
- `004_telemetry.sql` - клиентские события и ошибки.
- `006_payment_provider.sql` - заявки на пополнение/вывод.
- `007_password_recovery.sql` - восстановление пароля.

## Админка И Модерация

Миграция `005_admin_seed.sql` выдаёт пользователю `id=1` роли:

```text
admin
support
market_moderator
```

`npm run seed` также выдаёт роли `admin`, `support`, `market_moderator` демо-пользователю `zulamho`.

Через Admin Center можно:

- выдавать и отзывать роли;
- смотреть споры;
- смотреть жалобы;
- смотреть риск-сделки;
- проверять новых продавцов;
- смотреть логи действий.

## Платежи

Сейчас включён безопасный ручной режим:

```env
PAYMENT_PROVIDER=manual
PAYMENT_PUBLIC_NAME=Manual review
PAYMENT_CURRENCY=SPK
PAYMENT_SPK_RATE=1
```

Как это работает:

- пользователь создаёт заявку на пополнение или вывод;
- заявка получает `provider_payment_id` и `provider_status`;
- модератор подтверждает или отклоняет заявку;
- ledger фиксирует начисление, резерв, возврат или выплату.

До подключения настоящего платёжного провайдера деньги не списываются с карты автоматически. Это сделано специально: escrow-сценарий и интерфейс должны быть стабильными до реальных платежей.

## Проверки

Основные проверки:

```bash
npm test
npm run prod:check
npm run perf:audit
npm audit --omit=dev
```

Интеграционные тесты:

```bash
npm run test:integration
```

## Оптимизация

Уже сделано:

- главный баннер сжат с `2.6 MB` до примерно `156 KB`;
- убран неиспользуемый `Chart.js`;
- большой React-бандл удалён из браузера;
- вместо него добавлен лёгкий `spikenet-runtime.js`;
- CSS/JS отдаются с gzip;
- удалены старые CSS-хвосты новостей и game tracker;
- добавлен `npm run perf:audit`.

Текущие ориентиры по весу:

```text
spikenet-runtime.js: около 2 KB gzip
market.js: около 20 KB gzip
app.js: около 18 KB gzip
ui.css: около 35 KB gzip
```

Команда для аудита:

```bash
npm run perf:audit
```

## Полезные Команды

```bash
npm run db:backup
npm run seed
npm run migrate
npm test
npm run perf:audit
```

## Структура

```text
src/                  backend: routes, middleware, services, sockets
public/               frontend: HTML, CSS, JS, assets
migrations/           SQL migrations
scripts/              migrate, seed, backup, production checks
tests/                node:test checks
uploads/              user uploads
docs/                 technical notes
```

## Production Checklist

Перед реальным запуском:

- поставить сильный `JWT_SECRET`;
- заполнить параметры PostgreSQL;
- включить `NODE_ENV=production`;
- настроить backup базы;
- проверить `npm run prod:check`;
- проверить `npm audit --omit=dev`;
- проверить `npm run perf:audit`;
- подключить домен и HTTPS;
- только потом подключать реальный платёжный провайдер.
