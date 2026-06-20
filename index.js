const pool = require('./db');

async function testQuery() {
  try {
    // Делаем тестовый запрос, который возвращает текущее время из СУБД
    const res = await pool.query('SELECT NOW()');
    console.log('Время на сервере БД:', res.rows[0].now);
  } catch (err) {
    console.error('Ошибка при выполнении запроса:', err);
  } finally {
    // Закрываем пул (нужно только при завершении работы скрипта)
    await pool.end();
  }
}

testQuery();