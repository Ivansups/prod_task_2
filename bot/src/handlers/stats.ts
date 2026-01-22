import { Context } from 'telegraf';
import { db } from '../services/database';
import { redis } from '../services/redis';

export type StatsPeriod = 'all' | 'today' | 'week' | 'month';

export interface StatsData {
  period: StatsPeriod;
  totalMessages: number;
  topUsers: Array<{
    user_id: number;
    username: string | null;
    first_name: string | null;
    last_name: string | null;
    message_count: number;
  }>;
  cached: boolean;
}

/**
 * Получает количество дней для периода
 */
function getDaysLimit(period: StatsPeriod): number | undefined {
  switch (period) {
    case 'today':
      return 1;
    case 'week':
      return 7;
    case 'month':
      return 30;
    case 'all':
    default:
      return undefined;
  }
}

/**
 * Получает текстовое описание периода
 */
function getPeriodText(period: StatsPeriod): string {
  switch (period) {
    case 'today':
      return 'за сегодня';
    case 'week':
      return 'за неделю';
    case 'month':
      return 'за месяц';
    case 'all':
    default:
      return 'за всё время';
  }
}

/**
 * Получает данные статистики с кэшированием
 */
export async function getStatsData(chatId: number, period: StatsPeriod): Promise<StatsData> {
  const cacheKey = redis.createStatsCacheKey(chatId, period);
  const cachedData = await redis.get(cacheKey);

  if (cachedData) {
    const parsedData = JSON.parse(cachedData);
    parsedData.cached = true;
    return parsedData;
  }

  const daysLimit = getDaysLimit(period);
  const topUsers = await db.messages.getTopUsers(chatId, 10, daysLimit);
  const totalMessages = await db.messages.getTotalCount(chatId, daysLimit);

  const statsData: StatsData = {
    period,
    totalMessages,
    topUsers,
    cached: false
  };

  // Кэшируем на 20 минут
  await redis.set(cacheKey, JSON.stringify(statsData), 1200);

  return statsData;
}

/**
 * Создает inline клавиатуру для статистики
 */
function createStatsKeyboard(currentPeriod: StatsPeriod) {
  const periods = [
    { text: '📅 Все время', callback_data: 'stats:all' },
    { text: '📆 Сегодня', callback_data: 'stats:today' },
    { text: '📊 Неделя', callback_data: 'stats:week' },
    { text: '📈 Месяц', callback_data: 'stats:month' },
    { text: '👤 Пользователи', callback_data: 'stats:users' }
  ];

  // Разбиваем на строки по 2 кнопки
  const keyboard = [];
  for (let i = 0; i < periods.length; i += 2) {
    keyboard.push(periods.slice(i, i + 2));
  }

  return keyboard;
}

/**
 * Форматирует сообщение со статистикой
 */
function formatStatsMessage(statsData: StatsData): string {
  const { period, totalMessages, topUsers, cached } = statsData;
  const periodText = getPeriodText(period);
  const cacheText = cached ? ' (из кэша)' : '';

  let message = `📊 *Статистика чата ${periodText}${cacheText}*\n\n`;
  message += `💬 Всего сообщений: ${totalMessages}\n\n`;

  if (topUsers.length === 0) {
    message += `📭 Нет сообщений за выбранный период.`;
  } else {
    message += `🏆 *Топ активных участников:*\n\n`;
    topUsers.forEach((user, index) => {
      const name = user.username || `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Без имени';
      message += `${index + 1}. ${name} - ${user.message_count} сообщений\n`;
    });
  }

  return message;
}

/**
 * Обработчик команды /stats
 */
export async function handleStatsCommand(ctx: Context): Promise<void> {
  try {
    const chat = ctx.chat;

    if (chat?.type !== 'group' && chat?.type !== 'supergroup') {
      await ctx.reply('⚠️ Эта команда доступна только в групповых чатах!');
      return;
    }

    const chatId = chat.id;
    const statsData = await getStatsData(chatId, 'all');
    const message = formatStatsMessage(statsData);
    const keyboard = createStatsKeyboard('all');

    await ctx.replyWithMarkdown(message, {
      reply_markup: {
        inline_keyboard: keyboard
      }
    });

  } catch (error) {
    console.error('❌ Error in /stats command:', error);
    await ctx.reply('❌ Произошла ошибка при получении статистики.');
  }
}

/**
 * Обработчик callback-запросов для статистики
 */
export async function handleStatsCallback(ctx: Context): Promise<void> {
  try {
    const callbackQuery = ctx.callbackQuery;

    if (!callbackQuery || !('data' in callbackQuery)) {
      return;
    }

    const data = callbackQuery.data;
    const chat = ctx.chat;

    if (!chat || (chat.type !== 'group' && chat.type !== 'supergroup')) {
      await ctx.answerCbQuery('⚠️ Эта функция доступна только в групповых чатах!');
      return;
    }

    const chatId = chat.id;

    // Парсим callback data
    if (data.startsWith('stats:')) {
      const action = data.split(':')[1];

      if (action === 'users') {
        // Показываем список пользователей
        await handleUsersList(ctx, chatId);
        return;
      }

      // Меняем период статистики
      const period = action as StatsPeriod;
      if (['all', 'today', 'week', 'month'].includes(period)) {
        const statsData = await getStatsData(chatId, period);
        const message = formatStatsMessage(statsData);
        const keyboard = createStatsKeyboard(period);

        await ctx.editMessageText(message, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: keyboard
          }
        });

        await ctx.answerCbQuery(`Показана статистика ${getPeriodText(period)}`);
        return;
      }
    }

    // Обработка выбора пользователя
    if (data.startsWith('user_stats:')) {
      const userId = parseInt(data.split(':')[1]);
      await handleUserStats(ctx, chatId, userId, 'all');
      return;
    }

    // Обработка статистики пользователя по периоду
    if (data.startsWith('user_stats_period:')) {
      const [, userIdStr, periodStr] = data.split(':');
      const userId = parseInt(userIdStr);
      const period = periodStr as StatsPeriod;
      await handleUserStats(ctx, chatId, userId, period);
      return;
    }

    // Обработка пагинации пользователей
    if (data.startsWith('users_page:')) {
      const page = parseInt(data.split(':')[1]);
      await handleUsersList(ctx, chatId, page);
      return;
    }

    await ctx.answerCbQuery('❌ Неизвестная команда');

  } catch (error) {
    console.error('❌ Error in stats callback:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка');
  }
}

/**
 * Показывает список пользователей для выбора
 */
async function handleUsersList(ctx: Context, chatId: number, page: number = 0): Promise<void> {
  const cacheKey = redis.createUsersListCacheKey(chatId);
  const cachedUsers = await redis.get(cacheKey);

  let users;
  if (cachedUsers) {
    users = JSON.parse(cachedUsers);
  } else {
    // Получаем всех пользователей чата
    users = await db.messages.getUserStats(chatId);
    // Кэшируем на 10 минут
    await redis.set(cacheKey, JSON.stringify(users), 600);
  }

  if (users.length === 0) {
    await ctx.editMessageText('📭 В этом чате пока нет пользователей для анализа.', {
      reply_markup: {
        inline_keyboard: [[{ text: '⬅️ Назад к статистике', callback_data: 'stats:all' }]]
      }
    });
    return;
  }

  const usersPerPage = 5;
  const totalPages = Math.ceil(users.length / usersPerPage);
  const startIndex = page * usersPerPage;
  const endIndex = Math.min(startIndex + usersPerPage, users.length);
  const currentUsers = users.slice(startIndex, endIndex);

  let message = `👥 *Выберите пользователя для детальной статистики*\n\n`;
  message += `Показаны пользователи ${startIndex + 1}-${endIndex} из ${users.length}:\n\n`;

  const keyboard = currentUsers.map((user: any, index: number) => {
    const name = user.username || `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Без имени';
    const displayName = name.length > 30 ? name.substring(0, 27) + '...' : name;
    return [{
      text: `${displayName} (${user.message_count})`,
      callback_data: `user_stats:${user.user_id}`
    }];
  });

  // Добавляем кнопки пагинации
  const paginationRow = [];
  if (page > 0) {
    paginationRow.push({ text: '⬅️ Назад', callback_data: `users_page:${page - 1}` });
  }
  paginationRow.push({ text: `${page + 1}/${totalPages}`, callback_data: 'noop' });
  if (page < totalPages - 1) {
    paginationRow.push({ text: 'Вперёд ➡️', callback_data: `users_page:${page + 1}` });
  }

  keyboard.push(paginationRow);
  keyboard.push([{ text: '⬅️ Назад к статистике', callback_data: 'stats:all' }]);

  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: keyboard
    }
  });

  await ctx.answerCbQuery();
}

/**
 * Получает статистику пользователя с кэшированием
 */
async function getUserStatsData(chatId: number, userId: number, period: StatsPeriod): Promise<{
  user: any;
  stats: any;
  recentMessages: any[];
  cached: boolean;
}> {
  const cacheKey = redis.createUserStatsCacheKey(chatId, userId, period);
  const cachedData = await redis.get(cacheKey);

  if (cachedData) {
    const parsedData = JSON.parse(cachedData);
    parsedData.cached = true;
    return parsedData;
  }

  const user = await db.users.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  const daysLimit = getDaysLimit(period);
  const stats = await db.users.getStats(userId, daysLimit);
  const recentMessages = await db.messages.getRecentMessages(userId, 5);

  const data = {
    user,
    stats,
    recentMessages,
    cached: false
  };

  // Кэшируем на 10 минут
  await redis.set(cacheKey, JSON.stringify(data), 600);

  return data;
}

/**
 * Показывает статистику конкретного пользователя
 */
async function handleUserStats(ctx: Context, chatId: number, userId: number, period: StatsPeriod = 'all'): Promise<void> {
  try {
    const data = await getUserStatsData(chatId, userId, period);
    const { user, stats, recentMessages, cached } = data;

    if (!stats) {
      await ctx.answerCbQuery('❌ Статистика пользователя недоступна');
      return;
    }

    const name = user.username || `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Без имени';
    const periodText = getPeriodText(period);
    const cacheText = cached ? ' (из кэша)' : '';

    let message = `👤 *Статистика пользователя ${periodText}${cacheText}*\n`;
    message += `@${user.username || name}\n\n`;
    message += `📊 *Статистика:*\n`;
    message += `• Сообщений: ${stats.message_count}\n`;

    if (stats.first_message) {
      message += `• Первое сообщение: ${stats.first_message.toLocaleDateString('ru-RU')}\n`;
    }
    if (stats.last_message) {
      message += `• Последнее сообщение: ${stats.last_message.toLocaleDateString('ru-RU')}\n`;
    }

    if (recentMessages.length > 0) {
      message += `\n💬 *Последние сообщения:*\n`;
      recentMessages.slice(0, 3).forEach((msg, index) => {
        const preview = msg.text.length > 40 ? msg.text.substring(0, 37) + '...' : msg.text;
        message += `${index + 1}. ${preview}\n`;
      });
    }

    // Создаем клавиатуру с периодами, выделяя текущий
    const periods = [
      { key: 'all', text: '📅 Все время' },
      { key: 'today', text: '📆 Сегодня' },
      { key: 'week', text: '📊 Неделя' },
      { key: 'month', text: '📈 Месяц' }
    ];

    const keyboard = periods.map(p => [{
      text: p.key === period ? `✅ ${p.text}` : p.text,
      callback_data: `user_stats_period:${userId}:${p.key}`
    }]);

    keyboard.push([{ text: '⬅️ Назад к списку', callback_data: 'stats:users' }]);

    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: keyboard
      }
    });

    await ctx.answerCbQuery();

  } catch (error) {
    console.error('❌ Error getting user stats:', error);
    await ctx.answerCbQuery('❌ Ошибка при получении статистики пользователя');
  }
}