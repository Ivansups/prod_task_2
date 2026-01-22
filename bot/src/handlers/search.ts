import { Context } from 'telegraf';
import { db } from '../services/database';
import { redis } from '../services/redis';

export interface SearchResult {
  query: string;
  totalResults: number;
  results: Array<{
    id: number;
    user_id: number;
    username: string | null;
    first_name: string | null;
    last_name: string | null;
    text: string;
    created_at: Date;
    highlighted_text: string;
  }>;
  page: number;
  totalPages: number;
  cached: boolean;
}

/**
 * Получает результаты поиска с кэшированием
 */
export async function getSearchResults(chatId: number, query: string, page: number = 0): Promise<SearchResult> {
  const cacheKey = redis.createSearchCacheKey(chatId, query, page);
  const cachedData = await redis.get(cacheKey);

  if (cachedData) {
    const parsedData = JSON.parse(cachedData);
    parsedData.cached = true;
    return parsedData;
  }

  const resultsPerPage = 5;
  const offset = page * resultsPerPage;

  // Получаем результаты поиска
  const results = await db.messages.searchMessages(chatId, query, resultsPerPage, offset);
  const totalResults = await db.messages.countSearchResults(chatId, query);
  const totalPages = Math.ceil(totalResults / resultsPerPage);

  const searchResult: SearchResult = {
    query,
    totalResults,
    results,
    page,
    totalPages,
    cached: false
  };

  // Кэшируем на 10 минут
  await redis.set(cacheKey, JSON.stringify(searchResult), 600);

  return searchResult;
}

/**
 * Создает клавиатуру для результатов поиска
 */
function createSearchKeyboard(searchResult: SearchResult) {
  const { page, totalPages, query } = searchResult;
  const keyboard = [];

  // Кнопки пагинации
  const paginationRow = [];
  if (page > 0) {
    paginationRow.push({ text: '⬅️ Назад', callback_data: `search_page:${page - 1}:${encodeURIComponent(query)}` });
  }
  paginationRow.push({ text: `${page + 1}/${totalPages}`, callback_data: 'noop' });
  if (page < totalPages - 1) {
    paginationRow.push({ text: 'Вперёд ➡️', callback_data: `search_page:${page + 1}:${encodeURIComponent(query)}` });
  }

  if (paginationRow.length > 1) {
    keyboard.push(paginationRow);
  }

  // Кнопка нового поиска
  keyboard.push([{ text: '🔍 Новый поиск', callback_data: 'search_new' }]);

  return keyboard;
}

/**
 * Форматирует сообщение с результатами поиска
 */
function formatSearchMessage(searchResult: SearchResult): string {
  const { query, totalResults, results, page, cached } = searchResult;
  const cacheText = cached ? ' (из кэша)' : '';
  const startIndex = page * 5 + 1;
  const endIndex = Math.min(startIndex + results.length - 1, totalResults);

  let message = `🔍 *Результаты поиска${cacheText}*\n\n`;
  message += `📝 Запрос: "${query}"\n`;
  message += `📊 Найдено: ${totalResults} сообщений\n`;
  message += `📄 Показаны: ${startIndex}-${endIndex}\n\n`;

  if (results.length === 0) {
    message += `❌ Сообщения не найдены.`;
  } else {
    message += `💬 *Результаты:*\n\n`;
    results.forEach((result, index) => {
      const userName = result.username || `${result.first_name || ''} ${result.last_name || ''}`.trim() || 'Без имени';
      const date = result.created_at.toLocaleDateString('ru-RU');
      const time = result.created_at.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

      message += `${startIndex + index}. **${userName}** (${date} ${time})\n`;
      message += `${result.highlighted_text}\n\n`;
    });
  }

  return message;
}

/**
 * Обработчик команды /search
 */
export async function handleSearchCommand(ctx: Context): Promise<void> {
  try {
    const chat = ctx.chat;

    if (chat?.type !== 'group' && chat?.type !== 'supergroup') {
      await ctx.reply('⚠️ Эта команда доступна только в групповых чатах!');
      return;
    }

    const message = ctx.message;
    const args = message && 'text' in message ? message.text.split(' ').slice(1) : [];
    const query = args.join(' ').trim();

    if (!query) {
      // Показываем инструкцию по использованию
      const keyboard = [
        [{ text: '🔍 Начать поиск', callback_data: 'search_new' }]
      ];

      await ctx.replyWithMarkdown(
        '🔍 *Поиск сообщений*\n\n' +
        'Использование:\n' +
        '`/search ключевое_слово` - поиск по словам\n' +
        '`/search /регулярное выражение/` - поиск по regex\n\n' +
        'Примеры:\n' +
        '`/search привет` - найти сообщения со словом "привет"\n' +
        '`/search /прив.*мир/` - найти regex "прив" + любые символы + "мир"\n\n' +
        'Результаты будут выделены **жирным шрифтом**.',
        {
          reply_markup: {
            inline_keyboard: keyboard
          }
        }
      );
      return;
    }

    // Выполняем поиск
    await ctx.reply('🔍 Выполняю поиск...');
    const searchResult = await getSearchResults(chat.id, query);

    if (searchResult.totalResults === 0) {
      await ctx.reply(`❌ По запросу "${query}" ничего не найдено.`);
      return;
    }

    const messageText = formatSearchMessage(searchResult);
    const keyboard = createSearchKeyboard(searchResult);

    await ctx.replyWithMarkdown(messageText, {
      reply_markup: {
        inline_keyboard: keyboard
      }
    });

  } catch (error) {
    console.error('❌ Error in /search command:', error);
    await ctx.reply('❌ Произошла ошибка при поиске сообщений.');
  }
}

/**
 * Обработчик callback-запросов для поиска
 */
export async function handleSearchCallback(ctx: Context): Promise<void> {
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

    // Новый поиск
    if (data === 'search_new') {
      await ctx.answerCbQuery();
      await handleSearchCommand(ctx);
      return;
    }

    // Пагинация результатов
    if (data.startsWith('search_page:')) {
      const [, pageStr, encodedQuery] = data.split(':');
      const page = parseInt(pageStr);
      const query = decodeURIComponent(encodedQuery);

      const searchResult = await getSearchResults(chatId, query, page);
      const message = formatSearchMessage(searchResult);
      const keyboard = createSearchKeyboard(searchResult);

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: keyboard
        }
      });

      await ctx.answerCbQuery(`Страница ${page + 1} из ${searchResult.totalPages}`);
      return;
    }

    await ctx.answerCbQuery('❌ Неизвестная команда');

  } catch (error) {
    console.error('❌ Error in search callback:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка');
  }
}