import { Telegraf } from 'telegraf';
import { config, validateConfig } from './config';
import { db } from './services/database';
import { redis } from './services/redis';
import { geminiService } from './services/gemini';
import { handleStatsCommand, handleStatsCallback } from './handlers/stats';
import { handleSearchCommand, handleSearchCallback } from './handlers/search';

/**
 * Главный файл Telegram бота для аналитики чатов.
 * Обрабатывает команды /start, /stats, /search, /analyze и сохраняет сообщения пользователей.
 */

// Проверяем конфигурацию
validateConfig();

// Инициализируем бота
const bot = new Telegraf(config.telegram.token!);

console.log('🤖 Starting Telegram Chat Analytics Bot...');

/**
 * Обработчик команды /start
 * Показывает приветственное сообщение с инструкциями по использованию бота
 */
bot.start((ctx) => {
  ctx.reply(
    '👋 Привет! Я бот для аналитики чата с ИИ.\n\n' +
    '📊 Доступные команды:\n' +
    '/stats - Показать статистику чата\n' +
    '/search ключевое_слово - Поиск сообщений\n' +
    '/analyze @username - ИИ-анализ пользователя\n' +
    '/analyze (в ответ на сообщение) - Анализ автора сообщения\n\n' +
    '🔍 Поиск поддерживает регулярные выражения: `/search /прив.*мир/`\n' +
    '🤖 ИИ анализирует стиль общения, темы и личность пользователей!\n\n' +
    'Просто отправляйте сообщения в чат - я буду их сохранять для анализа!'
  );
});

/**
 * Обработчик текстовых сообщений
 * Сохраняет сообщения пользователей в базу данных для последующего анализа
 */
bot.on('text', async (ctx) => {
  try {
    const message = ctx.message;
    const user = message.from;
    const chat = message.chat;

    // Проверяем, что сообщение из группового чата или супергруппы
    if (chat.type !== 'group' && chat.type !== 'supergroup') {
      return ctx.reply('⚠️ Я работаю только в групповых чатах!');
    }

    console.log(`📝 Processing message from user ${user.id} (${user.username || user.first_name}) in chat ${chat.id}`);

    // Сохраняем или обновляем пользователя
    await db.users.createOrUpdate({
      id: user.id,
      username: user.username,
      first_name: user.first_name,
      last_name: user.last_name,
    });

    // Сохраняем сообщение
    await db.messages.create({
      user_id: user.id,
      chat_id: chat.id,
      text: message.text,
    });

    console.log(`✅ Message saved: ${message.text.substring(0, 50)}...`);

    // Не отвечаем на каждое сообщение, чтобы не спамить

  } catch (error) {
    console.error('❌ Error processing message:', error);
    // В продакшене можно отправить уведомление администратору
  }
});

/**
 * Обработчик команды /stats
 * Показывает статистику сообщений в чате
 */
bot.command('stats', handleStatsCommand);

/**
 * Обработчик команды /search
 * Выполняет поиск сообщений по ключевым словам или регулярным выражениям
 */
bot.command('search', handleSearchCommand);

/**
 * Обработчик команды /analyze
 * Выполняет ИИ-анализ пользователя с помощью Google Gemini
 */
bot.command('analyze', async (ctx) => {
  try {
    const message = ctx.message;
    const chat = ctx.chat;

    if (chat.type !== 'group' && chat.type !== 'supergroup') {
      return ctx.reply('⚠️ Эта команда доступна только в групповых чатах!');
    }

    let targetUserId: number;
    let targetUsername: string;

    // Проверяем, является ли сообщение reply на другое сообщение
    if (message.reply_to_message) {
      const repliedMessage = message.reply_to_message;
      targetUserId = repliedMessage.from!.id;
      targetUsername = repliedMessage.from!.username || repliedMessage.from!.first_name || 'Unknown';

      // Ищем пользователя в нашей БД
      const user = await db.users.findById(targetUserId);
      if (!user) {
        return ctx.reply('❌ Пользователь не найден в базе данных. Возможно, он не писал сообщений в этом чате.');
      }
      targetUsername = user.username || user.first_name || 'Unknown';
    } else {
      // Парсим аргументы команды
      const args = message.text.split(' ').slice(1);
      const username = args[0]?.replace('@', '');

      if (!username) {
        return ctx.reply('⚠️ Использование: /analyze @username\n\nили ответьте на сообщение пользователя командой /analyze');
      }

      // Ищем пользователя по username
      const user = await db.users.findByUsername(username);
      if (!user) {
        return ctx.reply(`❌ Пользователь @${username} не найден в этом чате.`);
      }

      targetUserId = user.id;
      targetUsername = username;
    }

    await ctx.reply('🔍 Анализирую пользователя с помощью ИИ...');

    // Получаем статистику пользователя для проверки
    const stats = await db.users.getStats(targetUserId);

    if (!stats || stats.message_count === 0) {
      return ctx.reply(`📭 У пользователя @${targetUsername} пока нет сообщений для анализа.`);
    }

    // Получаем последние сообщения пользователя (увеличено до 50 для лучшего анализа)
    const recentMessages = await db.messages.getRecentMessages(targetUserId, 50);

    if (recentMessages.length < 5) {
      return ctx.reply(`📝 У пользователя @${targetUsername} слишком мало сообщений для качественного анализа. Минимум 5 сообщений требуется.`);
    }

    try {
      // Анализируем пользователя с помощью Gemini
      const analysis = await geminiService.analyzeUser(targetUsername, recentMessages, stats.message_count);

      // Форматируем ответ
      let response = `🤖 *ИИ-анализ пользователя @${targetUsername}*\n\n`;
      response += `📊 *Статистика:*\n`;
      response += `• Всего сообщений: ${stats.message_count}\n`;

      if (stats.first_message) {
        response += `• Первое сообщение: ${stats.first_message.toLocaleDateString('ru-RU')}\n`;
      }
      if (stats.last_message) {
        response += `• Последнее сообщение: ${stats.last_message.toLocaleDateString('ru-RU')}\n`;
      }

      response += `\n🧠 *Личность:* ${analysis.personality}\n\n`;
      response += `📝 *Основные темы:* ${analysis.topics.join(', ')}\n\n`;
      response += `💬 *Стиль общения:* ${analysis.communicationStyle}\n\n`;
      response += `⚡ *Активность:* ${analysis.activity}\n\n`;
      response += `💡 *Рекомендации:*\n`;
      analysis.recommendations.forEach((rec, index) => {
        response += `${index + 1}. ${rec}\n`;
      });

      await ctx.replyWithMarkdown(response);

    } catch (error) {
      console.error('❌ Error in Gemini analysis:', error);
      await ctx.reply('❌ Произошла ошибка при ИИ-анализе. Попробуйте позже.');
    }

  } catch (error) {
    console.error('❌ Error in /analyze command:', error);
    await ctx.reply('❌ Произошла ошибка при анализе пользователя.');
  }
});

/**
 * Обработчик callback-запросов для интерактивных кнопок статистики
 */
bot.on('callback_query', handleStatsCallback);

/**
 * Обработчик callback-запросов для интерактивных кнопок поиска
 */
bot.on('callback_query', handleSearchCallback);

/**
 * Обработчик ошибок бота
 */
bot.catch((err, ctx) => {
  console.error('❌ Bot error:', err);
  ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
});

/**
 * Graceful shutdown при получении сигнала SIGINT (Ctrl+C)
 */
process.once('SIGINT', () => {
  console.log('🛑 Shutting down bot...');
  bot.stop('SIGINT');
  Promise.all([
    db.close(),
    redis.disconnect()
  ]).finally(() => process.exit(0));
});

/**
 * Graceful shutdown при получении сигнала SIGTERM
 */
process.once('SIGTERM', () => {
  console.log('🛑 Shutting down bot...');
  bot.stop('SIGTERM');
  Promise.all([
    db.close(),
    redis.disconnect()
  ]).finally(() => process.exit(0));
});

/**
 * Запускает бота, инициализируя все сервисы
 */
async function startBot() {
  try {
    // Проверяем подключение к БД
    const dbConnected = await db.testConnection();
    if (!dbConnected) {
      throw new Error('Failed to connect to database');
    }

    // Подключаемся к Redis
    await redis.connect();

    // Проверяем подключение к Gemini API
    const geminiConnected = await geminiService.testConnection();
    if (!geminiConnected) {
      console.warn('⚠️ Gemini API connection test failed. LLM analysis may not work.');
    } else {
      console.log('✅ Gemini API connected successfully');
    }

    console.log('🚀 Starting bot...');
    await bot.launch();
    console.log('✅ Bot is running!');

  } catch (error) {
    console.error('❌ Failed to start bot:', error);
    process.exit(1);
  }
}

startBot();