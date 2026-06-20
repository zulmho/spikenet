# SpikeNet

SpikeNet - игровой маркет с escrow и социальным слоем доверия: лоты, продавцы, сделки, отзывы, чат сделки, группы и модерация.

## Быстрый запуск

1. Установить зависимости:

```bash
npm install
```

2. Создать `.env`:

```bash
copy .env.example .env
```

3. Указать PostgreSQL и секрет:

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

Демо-пользователи: `zulamho`, `Ing1`, `gamer50`, `Ibra`, `KeySmith`, `SkinVault`, `BoostRoom`, `RobloxHub`, `PSNMarket`, `RiskyFox`.

Пароль у всех: `demo12345`.

6. Запустить сервер:

```bash
npm run dev
```

7. Открыть сайт:

```text
http://localhost:3001
```

## Миграции

Миграции лежат в `migrations/` и применяются по порядку:

```bash
npm run migrate
```

Проверка порядка и запрет runtime-создания схемы:

```bash
npm test
```

## Админ и модерация

Миграция `005_admin_seed.sql` выдаёт пользователю `id=1` роли:

```text
admin
support
market_moderator
```

Другого пользователя можно сделать модератором через Admin Center: выдать роль `market moderator`.

Демо-пользователь `zulamho` также получает роли `admin`, `support`, `market_moderator` через `npm run seed`.

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
- заявка получает `provider_payment_id`, `provider_status` и попадает в модерацию;
- модератор подтверждает или отклоняет заявку;
- ledger фиксирует начисление, резерв вывода, возврат или выплату.

До подключения настоящего провайдера деньги не списываются с карты автоматически. Это специально: escrow/UI должны быть чистыми до реальных платежей.

Для реального провайдера позже нужно добавить adapter в `src/services/paymentProvider.js` и заполнить:

```env
PAYMENT_PROVIDER=your_provider
PAYMENT_API_KEY=...
PAYMENT_SHOP_ID=...
PAYMENT_WEBHOOK_SECRET=...
```

## Проверки

```bash
npm test
npm run test:integration
npm run prod:check
```

## Полезные команды

```bash
npm run db:backup
npm run build:react-modules
```

## Главный продуктовый фокус

SpikeNet не должен расползаться в десять разных сервисов. Основной фокус:

```text
игровой маркет + escrow + доверие через профиль продавца, отзывы, чат сделки и модерацию
```

Группы и личные чаты нужны как социальный слой вокруг сделок, а не как отдельная попытка заменить Discord.
