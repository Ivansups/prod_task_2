import { Pool } from 'pg';

export interface MessageData {
  id: number;
  user_id: number;
  chat_id: number;
  text: string;
  created_at: Date;
}

export interface CreateMessageData {
  user_id: number;
  chat_id: number;
  text: string;
}

export class Message {
  constructor(private pool: Pool) {}

  /**
   * Создает новое сообщение
   */
  async create(messageData: CreateMessageData): Promise<MessageData> {
    const query = `
      INSERT INTO messages (user_id, chat_id, text)
      VALUES ($1, $2, $3)
      RETURNING id, user_id, chat_id, text, created_at
    `;

    const values = [
      messageData.user_id,
      messageData.chat_id,
      messageData.text
    ];

    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Находит сообщение по ID
   */
  async findById(id: number): Promise<MessageData | null> {
    const query = 'SELECT id, user_id, chat_id, text, created_at FROM messages WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return result.rows[0] || null;
  }

  /**
   * Получает сообщения пользователя
   */
  async findByUserId(userId: number, limit: number = 100, offset: number = 0): Promise<MessageData[]> {
    const query = `
      SELECT id, user_id, chat_id, text, created_at
      FROM messages
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
    const result = await this.pool.query(query, [userId, limit, offset]);
    return result.rows;
  }

  /**
   * Получает сообщения из чата
   */
  async findByChatId(chatId: number, limit: number = 100, offset: number = 0): Promise<MessageData[]> {
    const query = `
      SELECT id, user_id, chat_id, text, created_at
      FROM messages
      WHERE chat_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
    const result = await this.pool.query(query, [chatId, limit, offset]);
    return result.rows;
  }

  /**
   * Получает сообщения за определенный период
   */
  async findByDateRange(chatId: number, startDate: Date, endDate: Date): Promise<MessageData[]> {
    const query = `
      SELECT id, user_id, chat_id, text, created_at
      FROM messages
      WHERE chat_id = $1 AND created_at BETWEEN $2 AND $3
      ORDER BY created_at DESC
    `;
    const result = await this.pool.query(query, [chatId, startDate, endDate]);
    return result.rows;
  }

  /**
   * Получает статистику сообщений по пользователям в чате
   */
  async getUserStats(chatId: number, daysLimit?: number): Promise<Array<{
    user_id: number;
    username: string | null;
    first_name: string | null;
    last_name: string | null;
    message_count: number;
  }>> {
    let dateFilter = '';
    const values = [chatId];

    if (daysLimit) {
      dateFilter = 'AND m.created_at >= CURRENT_TIMESTAMP - INTERVAL \'1 day\' * $2';
      values.push(daysLimit);
    }

    const query = `
      SELECT
        u.id as user_id,
        u.username,
        u.first_name,
        u.last_name,
        COUNT(m.id) as message_count
      FROM users u
      JOIN messages m ON u.id = m.user_id
      WHERE m.chat_id = $1 ${dateFilter}
      GROUP BY u.id, u.username, u.first_name, u.last_name
      ORDER BY message_count DESC
    `;

    const result = await this.pool.query(query, values);
    return result.rows;
  }

  /**
   * Получает топ пользователей по количеству сообщений
   */
  async getTopUsers(chatId: number, limit: number = 10, daysLimit?: number): Promise<Array<{
    user_id: number;
    username: string | null;
    first_name: string | null;
    last_name: string | null;
    message_count: number;
  }>> {
    const stats = await this.getUserStats(chatId, daysLimit);
    return stats.slice(0, limit);
  }

  /**
   * Получает общее количество сообщений в чате
   */
  async getTotalCount(chatId: number, daysLimit?: number): Promise<number> {
    let dateFilter = '';
    const values = [chatId];

    if (daysLimit) {
      dateFilter = 'AND created_at >= CURRENT_TIMESTAMP - INTERVAL \'1 day\' * $2';
      values.push(daysLimit);
    }

    const query = `SELECT COUNT(*) as count FROM messages WHERE chat_id = $1 ${dateFilter}`;
    const result = await this.pool.query(query, values);
    const count = result.rows[0]?.count;
    return typeof count === 'string' ? parseInt(count) : (count || 0);
  }

  /**
   * Получает последние сообщения пользователя для анализа
   */
  async getRecentMessages(userId: number, limit: number = 50): Promise<MessageData[]> {
    const query = `
      SELECT id, user_id, chat_id, text, created_at
      FROM messages
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;
    const result = await this.pool.query(query, [userId, limit]);
    return result.rows.reverse(); // Возвращаем в хронологическом порядке
  }

  /**
   * Удаляет сообщение
   */
  async delete(id: number): Promise<boolean> {
    const query = 'DELETE FROM messages WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return (result.rowCount || 0) > 0;
  }

  /**
   * Удаляет все сообщения пользователя
   */
  async deleteByUserId(userId: number): Promise<number> {
    const query = 'DELETE FROM messages WHERE user_id = $1';
    const result = await this.pool.query(query, [userId]);
    return result.rowCount || 0;
  }

  /**
   * Поиск сообщений по ключевым словам или регулярному выражению
   */
  async searchMessages(chatId: number, searchQuery: string, limit: number = 20, offset: number = 0): Promise<Array<{
    id: number;
    user_id: number;
    username: string | null;
    first_name: string | null;
    last_name: string | null;
    text: string;
    created_at: Date;
    highlighted_text: string;
  }>> {
    // Определяем, является ли запрос регулярным выражением (начинается и заканчивается слешем)
    const isRegex = searchQuery.startsWith('/') && searchQuery.endsWith('/') && searchQuery.length > 2;
    let searchCondition: string;
    let searchValue: string;

    if (isRegex) {
      // Используем регулярное выражение PostgreSQL
      const regexPattern = searchQuery.slice(1, -1); // Убираем слеши
      searchCondition = 'text ~ $2';
      searchValue = regexPattern;
    } else {
      // Используем поиск по подобию (ILIKE для регистронезависимого поиска)
      searchCondition = 'text ILIKE $2';
      searchValue = `%${searchQuery}%`;
    }

    const query = `
      SELECT
        m.id,
        m.user_id,
        u.username,
        u.first_name,
        u.last_name,
        m.text,
        m.created_at
      FROM messages m
      JOIN users u ON m.user_id = u.id
      WHERE m.chat_id = $1 AND ${searchCondition}
      ORDER BY m.created_at DESC
      LIMIT $3 OFFSET $4
    `;

    const values = [chatId, searchValue, limit, offset];
    const result = await this.pool.query(query, values);

    // Добавляем выделенный текст для отображения
    return result.rows.map(row => ({
      ...row,
      highlighted_text: this.highlightText(row.text, searchQuery, isRegex)
    }));
  }

  /**
   * Подсчет количества сообщений по поисковому запросу
   */
  async countSearchResults(chatId: number, searchQuery: string): Promise<number> {
    const isRegex = searchQuery.startsWith('/') && searchQuery.endsWith('/') && searchQuery.length > 2;
    let searchCondition: string;
    let searchValue: string;

    if (isRegex) {
      const regexPattern = searchQuery.slice(1, -1);
      searchCondition = 'text ~ $2';
      searchValue = regexPattern;
    } else {
      searchCondition = 'text ILIKE $2';
      searchValue = `%${searchQuery}%`;
    }

    const query = `
      SELECT COUNT(*) as count
      FROM messages m
      WHERE m.chat_id = $1 AND ${searchCondition}
    `;

    const values = [chatId, searchValue];
    const result = await this.pool.query(query, values);
    const count = result.rows[0]?.count;
    return typeof count === 'string' ? parseInt(count) : (count || 0);
  }

  /**
   * Выделяет найденный текст в сообщении
   */
  private highlightText(text: string, searchQuery: string, isRegex: boolean): string {
    if (isRegex) {
      try {
        const regex = new RegExp(searchQuery.slice(1, -1), 'gi');
        return text.replace(regex, '**$&**');
      } catch (error) {
        // Если регулярное выражение некорректное, возвращаем оригинальный текст
        return text;
      }
    } else {
      // Для обычного поиска выделяем все вхождения
      const words = searchQuery.split(/\s+/).filter(word => word.length > 0);
      let highlightedText = text;

      words.forEach(word => {
        const regex = new RegExp(`(${this.escapeRegExp(word)})`, 'gi');
        highlightedText = highlightedText.replace(regex, '**$1**');
      });

      return highlightedText;
    }
  }

  /**
   * Экранирует специальные символы для регулярных выражений
   */
  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}