const bcrypt = require('bcryptjs');
const pool = require('../src/config/db');

const DEMO_PASSWORD = 'demo12345';

const image = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1000&q=82`;

const demoUsers = [
  { username: 'zulamho', tag: 9445, roles: ['admin', 'support', 'market_moderator'], balance: 25000 },
  { username: 'Ing1', tag: 8489, balance: 18000 },
  { username: 'gamer50', tag: 2427, flag: 'verified', note: 'Проверенный демо-продавец: быстрые выдачи и стабильные отзывы.', balance: 8200 },
  { username: 'Ibra', tag: 6975, flag: 'trusted', note: 'Хорошая история сделок, держать под обычным наблюдением.', balance: 7600 },
  { username: 'KeySmith', tag: 3812, flag: 'verified', note: 'Сильный продавец ключей, низкий риск.', balance: 9200 },
  { username: 'SkinVault', tag: 5570, flag: 'trusted', note: 'Предметы и скины, есть повторные покупатели.', balance: 6800 },
  { username: 'BoostRoom', tag: 4471, flag: 'trusted', note: 'Услуги выполняет через чат сделки.', balance: 5900 },
  { username: 'RobloxHub', tag: 1188, flag: 'verified', note: 'Проверенная выдача цифровых товаров.', balance: 10300 },
  { username: 'PSNMarket', tag: 7710, flag: 'trusted', note: 'Региональные пополнения, нужна сверка региона.', balance: 7100 },
  { username: 'RiskyFox', tag: 9301, flag: 'risky', note: 'Демо-флаг: спорные сделки и медленные ответы.', balance: 1500 }
];

const activeLots = [
  ['gamer50', 'Steam ключ: Helldivers 2 Deluxe', 'Ключ для Steam. Передача в чате сделки сразу после открытия escrow. Регион: CIS.', 'key', 3190, image('photo-1542751371-adc38448a05e')],
  ['gamer50', 'CS2 Prime аккаунт с медалями', 'Аккаунт без VAC, почта отдаётся вместе с доступом. Проверка через демонстрацию экрана.', 'account', 4600, image('photo-1511512578047-dfb367046420')],
  ['gamer50', 'Discord Nitro для геймера 1 месяц', 'Подарочная активация. Подходит для основного аккаунта, выдача в течение 10 минут.', 'service', 780, image('photo-1550745165-9bc0b252726f')],
  ['Ibra', 'Minecraft Java аккаунт', 'Чистый аккаунт, смена почты при покупателе. Escrow до полного входа.', 'account', 2890, image('photo-1515879218367-8466d910aaa4')],
  ['Ibra', 'Roblox Robux пакет 1700', 'Пополнение через gift method. Нужен ник и подтверждение получения.', 'item', 1450, image('photo-1509198397868-475647b2a1e5')],
  ['Ibra', 'Standoff 2 Gold набор', 'Выдача через внутриигровой трейд. Сначала проверка профиля, потом передача.', 'item', 2100, image('photo-1550745165-9bc0b252726f')],
  ['KeySmith', 'Elden Ring Shadow ключ Steam', 'Официальный ключ, регион RU/CIS. Возврата после активации нет.', 'key', 3990, image('photo-1552820728-8b83bb6b773f')],
  ['KeySmith', 'Baldur Gate 3 Steam key', 'Глобальный ключ. Отправка кодом в чат сделки.', 'key', 5490, image('photo-1511882150382-421056c89033')],
  ['KeySmith', 'Random co-op bundle x5', 'Пять случайных кооперативных игр. Список показывается до подтверждения.', 'key', 690, image('photo-1519669556878-63bdad8a1a49')],
  ['SkinVault', 'CS2 AK-47 skin pack', 'Передача через трейд-ссылку Steam. Покупатель подтверждает после получения предметов.', 'item', 6200, image('photo-1560253023-3ec5d502959f')],
  ['SkinVault', 'Dota 2 Arcana выбор', 'Один предмет на выбор из списка. Trade hold проверяем до сделки.', 'item', 3400, image('photo-1493711662062-fa541adb3fc8')],
  ['SkinVault', 'Rust starter kit сервер EU', 'Ресурсы и инструменты на EU-сервере. Передача в игре.', 'item', 990, image('photo-1538481199705-c710c4e965fc')],
  ['BoostRoom', 'Valorant калибровка дуо', '3 игры дуо, голос обязателен. Без гарантий ранга, но с отчётом после каждой игры.', 'service', 2300, image('photo-1542751110-97427bbecf20')],
  ['BoostRoom', 'Apex Legends coaching 2 часа', 'Разбор стрельбы, позиционки и настроек. Запись с таймкодами.', 'service', 1800, image('photo-1556438064-2d7646166914')],
  ['BoostRoom', 'League of Legends лоу-эло разбор', 'Один VOD + план тренировок на неделю. Передача через чат сделки.', 'service', 1200, image('photo-1519389950473-47ba0277781c')],
  ['RobloxHub', 'Rare Roblox items подбор', 'Подбор редких предметов под бюджет. Список согласуем до оплаты.', 'item', 2500, image('photo-1566576912321-d58ddd7a6088')],
  ['RobloxHub', 'Roblox Premium gift', 'Подарочная активация. Нужен ник, срок выдачи 5-15 минут.', 'service', 890, image('photo-1611996575749-79a3a250f948')],
  ['RobloxHub', 'Adopt Me pet bundle', 'Комплект питомцев. Передача в игре при покупателе.', 'item', 1750, image('photo-1606167668584-78701c57f13d')],
  ['PSNMarket', 'PSN Turkey пополнение 1000 TRY', 'Пополнение турецкого аккаунта. Регион проверяем до сделки.', 'service', 4150, image('photo-1605901309584-818e25960a8f')],
  ['PSNMarket', 'PlayStation Plus Deluxe 1 месяц', 'Активация на аккаунт покупателя. Нужна 2FA-проверка.', 'service', 1390, image('photo-1606144042614-b2417e99c4e3')],
  ['PSNMarket', 'EA FC 26 Ultimate points', 'Пакет внутриигровой валюты, регион EU/TR. Срок 10-30 минут.', 'item', 3100, image('photo-1578303512597-81e6cc155b3e')],
  ['RiskyFox', 'Очень дешёвый Steam аккаунт', 'Цена ниже рынка. Требуется внимательная проверка и переписка только внутри SpikeNet.', 'account', 900, image('photo-1516321318423-f06f85e504b3')],
  ['RiskyFox', 'Game Pass аккаунт 3 месяца', 'Демо-риск продавца: перед покупкой проверь отзывы и условия.', 'account', 1250, image('photo-1621259182978-fbf93132d53d')],
  ['gamer50', 'Escape from Tarkov stash помощь', 'Помощь с переносом предметов и стартовым набором. Только через voice и чат сделки.', 'service', 2700, image('photo-1558494949-ef010cbdcc31')],
  ['Ibra', 'Fortnite V-Bucks gift', 'Подарок на аккаунт после сверки ника. Escrow держится до получения.', 'item', 2400, image('photo-1505685296765-3a2736de412f')],
  ['KeySmith', 'Cyberpunk 2077 Ultimate ключ', 'Ключ Steam/GOG по выбору. Регион уточняется перед оплатой.', 'key', 3590, image('photo-1527430253228-e93688616381')],
  ['SkinVault', 'PUBG progressive skin', 'Скин через трейд. Нужна проверка trade hold перед сделкой.', 'item', 5200, image('photo-1511512578047-dfb367046420')],
  ['BoostRoom', 'Warzone squad coaching', '2 часа с разбором передвижения и коммуникации. Можно группой.', 'service', 2200, image('photo-1520975682031-a49a10f95b2a')],
  ['RobloxHub', 'Blox Fruits boost pack', 'Помощь с прокачкой и предметами. Выполнение поэтапно через чат сделки.', 'service', 1990, image('photo-1535223289827-42f1e9919769')],
  ['PSNMarket', 'Genshin Welkin Moon', 'Подарочная активация. Регион аккаунта проверяется заранее.', 'service', 690, image('photo-1518709268805-4e9042af2176')]
];

const completedDeals = [
  ['Ing1', 'gamer50', 'Steam ключ: Palworld', 'key', 2100, 5, 'Ключ пришёл быстро, активировался без проблем.'],
  ['Ing1', 'gamer50', 'CS2 skin мини-набор', 'item', 1700, 5, 'Продавец всё показал и передал через трейд.'],
  ['Ibra', 'KeySmith', 'Hades II Steam key', 'key', 1590, 5, 'Код рабочий, выдача за пару минут.'],
  ['zulamho', 'KeySmith', 'Co-op pack для сквада', 'key', 980, 5, 'Удобно для теста escrow, всё ок.'],
  ['Ing1', 'RobloxHub', 'Robux 800', 'item', 760, 5, 'Получил быстро, продавец на связи.'],
  ['gamer50', 'RobloxHub', 'Adopt Me trade pack', 'item', 1200, 4, 'Немного ждали, но всё получил.'],
  ['zulamho', 'Ibra', 'Minecraft аккаунт демо-сделка', 'account', 2450, 5, 'Передача аккуратная, почту сменили при мне.'],
  ['Ing1', 'SkinVault', 'Dota 2 cosmetic pack', 'item', 1900, 4, 'Trade прошёл нормально.'],
  ['Ibra', 'SkinVault', 'CS2 gloves low float', 'item', 8100, 5, 'Дорого, но продавец проверенный.'],
  ['zulamho', 'BoostRoom', 'Valorant coaching', 'service', 1500, 5, 'После разбора стало понятнее, за что платил.'],
  ['Ing1', 'BoostRoom', 'Apex aim session', 'service', 1300, 5, 'Хороший отчёт после занятия.'],
  ['gamer50', 'PSNMarket', 'PSN Turkey 500 TRY', 'service', 2300, 4, 'Регион проверили, пополнение пришло.'],
  ['Ibra', 'PSNMarket', 'PS Plus gift', 'service', 1150, 5, 'Без лишних вопросов, всё чётко.'],
  ['Ing1', 'RiskyFox', 'Game Pass дешёвый тест', 'account', 900, 2, 'Долго отвечал, доступ пришлось перепроверять.']
];

const disputes = [
  {
    buyer: 'Ing1',
    seller: 'RiskyFox',
    title: 'Спорный Steam аккаунт',
    category: 'account',
    price: 1350,
    reason: 'Продавец передал доступ, но почта не меняется и есть риск восстановления аккаунта.',
    evidence: [
      ['message', 'В чате продавец обещал полную смену почты, но не прислал код подтверждения.', 'Ключевое сообщение сделки'],
      ['link', 'https://example.com/spikenet-demo-evidence/account-mail-lock', 'Демо-ссылка на доказательство']
    ]
  },
  {
    buyer: 'Ibra',
    seller: 'PSNMarket',
    title: 'PSN пополнение задержано',
    category: 'service',
    price: 2200,
    reason: 'Пополнение не пришло в заявленный срок, покупатель просит ручную проверку.',
    evidence: [
      ['text', 'Оплата в escrow открыта, продавец просит ещё 24 часа.', 'Описание ситуации'],
      ['link', 'https://example.com/spikenet-demo-evidence/psn-delay', 'Скрин переписки']
    ]
  }
];

function avatarFor(username) {
  return `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(username)}`;
}

async function upsertUser(client, user) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const result = await client.query(
    `INSERT INTO users (username, password_hash, avatar_url, current_status, user_tag)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (username) DO UPDATE
     SET avatar_url = EXCLUDED.avatar_url,
         password_hash = EXCLUDED.password_hash,
         current_status = EXCLUDED.current_status,
         user_tag = EXCLUDED.user_tag
     RETURNING id, username`,
    [user.username, passwordHash, avatarFor(user.username), user.username === 'RiskyFox' ? 'idle' : 'online', user.tag]
  );
  return result.rows[0];
}

async function ensureWallet(client, userId, balance, locked = 0) {
  await client.query(
    `INSERT INTO market_wallets (user_id, balance, locked_balance, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id) DO UPDATE
     SET balance = GREATEST(market_wallets.balance, EXCLUDED.balance),
         locked_balance = GREATEST(market_wallets.locked_balance, EXCLUDED.locked_balance),
         updated_at = NOW()`,
    [userId, balance, locked]
  );
}

async function insertListing(client, users, [sellerName, title, description, category, price, imageUrl], status = 'active') {
  const seller = users[sellerName];
  const result = await client.query(
    `INSERT INTO market_listings (seller_id, title, description, category, price, image_url, status, sold_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $7 = 'sold' THEN NOW() - INTERVAL '2 days' ELSE NULL END, NOW() - ($8::int || ' hours')::interval)
     RETURNING id`,
    [seller.id, title, description, category, price, imageUrl, status, Math.floor(Math.random() * 140)]
  );
  return result.rows[0].id;
}

async function ensureDirectChat(client, userA, userB) {
  const a = Math.min(userA, userB);
  const b = Math.max(userA, userB);
  const chat = await client.query(
    `INSERT INTO direct_chats (user_one_id, user_two_id)
     VALUES ($1, $2)
     ON CONFLICT (user_one_id, user_two_id) DO UPDATE SET user_one_id = EXCLUDED.user_one_id
     RETURNING id`,
    [a, b]
  );
  return chat.rows[0].id;
}

async function insertMessageIfMissing(client, chatId, senderId, content) {
  await client.query(
    `INSERT INTO direct_messages (chat_id, sender_id, content, created_at)
     SELECT $1, $2, $3, NOW() - INTERVAL '20 minutes'
     WHERE NOT EXISTS (
       SELECT 1 FROM direct_messages
       WHERE chat_id = $1 AND sender_id = $2 AND content = $3
     )`,
    [chatId, senderId, content]
  );
}

async function insertCompletedDeal(client, users, deal, index) {
  const [buyerName, sellerName, title, category, price, rating, comment] = deal;
  const listingId = await insertListing(
    client,
    users,
    [sellerName, title, `Завершённая демо-сделка #${index + 1}.`, category, price, image('photo-1511512578047-dfb367046420')],
    'sold'
  );
  const trade = await client.query(
    `INSERT INTO market_trades (listing_id, buyer_id, seller_id, price, trade_hash, status, confirmed_at, created_at)
     VALUES ($1, $2, $3, $4, $5, 'completed', NOW() - ($6::int || ' hours')::interval, NOW() - ($7::int || ' hours')::interval)
     RETURNING id`,
    [
      listingId,
      users[buyerName].id,
      users[sellerName].id,
      price,
      `SN-DEMO-${index + 1}-${Date.now().toString(36).toUpperCase()}`,
      12 + index,
      30 + index
    ]
  );
  await client.query(
    `INSERT INTO market_reviews (trade_id, buyer_id, seller_id, rating, comment, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW() - ($6::int || ' hours')::interval)
     ON CONFLICT (trade_id) DO NOTHING`,
    [trade.rows[0].id, users[buyerName].id, users[sellerName].id, rating, comment, 10 + index]
  );
}

async function insertOpenDispute(client, users, dispute, index) {
  const listingId = await insertListing(
    client,
    users,
    [dispute.seller, dispute.title, 'Лот сейчас в escrow и открыт для проверки модератором.', dispute.category, dispute.price, image('photo-1516321318423-f06f85e504b3')],
    'escrow'
  );
  const trade = await client.query(
    `INSERT INTO market_trades (listing_id, buyer_id, seller_id, price, trade_hash, status, seller_risk_score_snapshot, seller_flag_snapshot, seller_flag_note_snapshot, created_at)
     VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, NOW() - ($9::int || ' hours')::interval)
     RETURNING id`,
    [
      listingId,
      users[dispute.buyer].id,
      users[dispute.seller].id,
      dispute.price,
      `SN-DISPUTE-${index + 1}-${Date.now().toString(36).toUpperCase()}`,
      dispute.seller === 'RiskyFox' ? 72 : 28,
      dispute.seller === 'RiskyFox' ? 'risky' : 'trusted',
      dispute.seller === 'RiskyFox' ? 'Демо-продавец с ручным риск-флагом' : 'Проверить задержку вручную',
      8 + index
    ]
  );
  const disputeRow = await client.query(
    `INSERT INTO market_disputes (trade_id, opener_id, buyer_id, seller_id, reason, status, risk_score_snapshot, risk_breakdown, created_at)
     VALUES ($1, $2, $3, $4, $5, 'open', $6, $7::jsonb, NOW() - ($8::int || ' hours')::interval)
     RETURNING id`,
    [
      trade.rows[0].id,
      users[dispute.buyer].id,
      users[dispute.buyer].id,
      users[dispute.seller].id,
      dispute.reason,
      dispute.seller === 'RiskyFox' ? 72 : 28,
      JSON.stringify({ reasons: ['demo dispute', 'manual review required'] }),
      6 + index
    ]
  );
  for (const [kind, content, note] of dispute.evidence) {
    await client.query(
      `INSERT INTO market_dispute_evidence (dispute_id, user_id, kind, content, note)
       VALUES ($1, $2, $3, $4, $5)`,
      [disputeRow.rows[0].id, users[dispute.buyer].id, kind, content, note]
    );
  }
  await client.query(
    `INSERT INTO market_dispute_events (dispute_id, actor_id, event_type, message, metadata)
     VALUES ($1, $2, 'opened', $3, $4::jsonb)`,
    [disputeRow.rows[0].id, users[dispute.buyer].id, dispute.reason, JSON.stringify({ demo: true })]
  );
}

async function seedChatDemo(client, users) {
  const dmPairs = [
    ['zulamho', 'Ing1', ['Привет, проверь новый вид лички.', 'ПКМ по сообщению теперь открывает меню действий.']],
    ['zulamho', 'gamer50', ['Лот ещё актуален?', 'Да, могу передать через escrow за 5 минут.']],
    ['Ing1', 'KeySmith', ['Нужен ключ для коопа сегодня вечером.', 'Окей, подберу вариант под регион.']]
  ];
  for (const [a, b, messages] of dmPairs) {
    const chatId = await ensureDirectChat(client, users[a].id, users[b].id);
    await insertMessageIfMissing(client, chatId, users[a].id, messages[0]);
    await insertMessageIfMissing(client, chatId, users[b].id, messages[1]);
  }

  const room = await client.query(
    `INSERT INTO party_rooms (room_token, creator_id)
     VALUES ('Demo Squad (demo1)', $1)
     ON CONFLICT (room_token) DO UPDATE SET creator_id = EXCLUDED.creator_id
     RETURNING id`,
    [users.zulamho.id]
  );
  for (const name of ['zulamho', 'Ing1', 'gamer50', 'Ibra', 'KeySmith']) {
    await client.query(
      `INSERT INTO room_members (room_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (room_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [room.rows[0].id, users[name].id, name === 'zulamho' ? 'owner' : name === 'Ing1' ? 'admin' : 'member']
    );
  }
  const groupMessages = [
    ['zulamho', 'Добро пожаловать в Demo Squad. Тут тестируем чат, voice и сделки.'],
    ['Ing1', 'Я в voice общий, го проверим микрофон.'],
    ['gamer50', 'Скинул новый лот, можно брать через escrow.']
  ];
  for (const [name, content] of groupMessages) {
    await client.query(
      `INSERT INTO messages (room_id, user_id, username, content, created_at)
       SELECT $1, $2, $3::text, $4::text, NOW() - INTERVAL '12 minutes'
       WHERE NOT EXISTS (
         SELECT 1 FROM messages WHERE room_id = $1 AND username = $3::text AND content = $4::text
       )`,
      [room.rows[0].id, users[name].id, name, content]
    );
  }
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const users = {};
    for (const user of demoUsers) {
      users[user.username] = await upsertUser(client, user);
    }

    await client.query(
      `INSERT INTO user_roles (user_id, role, granted_by)
       VALUES ($1, 'admin', $1), ($1, 'support', $1), ($1, 'market_moderator', $1)
       ON CONFLICT (user_id, role) DO NOTHING`,
      [users.zulamho.id]
    );
    await client.query(
      `INSERT INTO market_moderators (user_id, granted_by)
       VALUES ($1, $1)
       ON CONFLICT (user_id) DO NOTHING`,
      [users.zulamho.id]
    );

    for (const user of demoUsers) {
      await ensureWallet(client, users[user.username].id, user.balance, user.username === 'Ing1' ? 3550 : 0);
      if (user.flag) {
        await client.query(
          `INSERT INTO market_seller_flags (seller_id, flag, note, updated_by, updated_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (seller_id) DO UPDATE
           SET flag = EXCLUDED.flag, note = EXCLUDED.note, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
          [users[user.username].id, user.flag, user.note || '', users.zulamho.id]
        );
      }
    }

    const demoTitles = [
      ...activeLots.map((lot) => lot[1]),
      ...completedDeals.map((deal) => deal[2]),
      ...disputes.map((dispute) => dispute.title)
    ];
    await client.query('DELETE FROM market_listings WHERE title = ANY($1::text[])', [demoTitles]);

    for (const lot of activeLots) {
      await insertListing(client, users, lot, 'active');
    }
    for (let i = 0; i < completedDeals.length; i += 1) {
      await insertCompletedDeal(client, users, completedDeals[i], i);
    }
    for (let i = 0; i < disputes.length; i += 1) {
      await insertOpenDispute(client, users, disputes[i], i);
    }

    await seedChatDemo(client, users);

    await client.query('COMMIT');
    console.log('Demo seed complete.');
    console.log(`Users: ${demoUsers.map((user) => user.username).join(', ')}`);
    console.log(`Password for all demo users: ${DEMO_PASSWORD}`);
    console.log(`Active demo listings: ${activeLots.length}`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Demo seed failed:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
