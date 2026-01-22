import { Pool } from 'pg';

export interface UserData {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  created_at: Date;
}

export class User {
  constructor(private pool: Pool) {}

  /**
   * Создает нового пользователя или обновляет существующего
   */
  async createOrUpdate(userData: Omit<UserData, 'created_at'>): Promise<UserData> {
    const query = `
      INSERT INTO users (id, username, first_name, last_name)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (id) DO UPDATE SET
        username = EXCLUDED.username,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name
      RETURNING id, username, first_name, last_name, created_at
    `;

    const values = [
      userData.id,
      userData.username,
      userData.first_name,
      userData.last_name
    ];

    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Находит пользователя по ID
   */
  async findById(id: number): Promise<UserData | null> {
    const query = 'SELECT id, username, first_name, last_name, created_at FROM users WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return result.rows[0] || null;
  }

  /**
   * Находит пользователя по username
   */
  async findByUsername(username: string): Promise<UserData | null> {
    const query = 'SELECT id, username, first_name, last_name, created_at FROM users WHERE username = $1';
    const result = await this.pool.query(query, [username]);
    return result.rows[0] || null;
  }

  /**
   * Получает всех пользователей
   */
  async findAll(): Promise<UserData[]> {
    const query = 'SELECT id, username, first_name, last_name, created_at FROM users ORDER BY created_at DESC';
    const result = await this.pool.query(query);
    return result.rows;
  }

  /**
   * Обновляет данные пользователя
   */
  async update(id: number, updates: Partial<Pick<UserData, 'username' | 'first_name' | 'last_name'>>): Promise<UserData | null> {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (updates.username !== undefined) {
      fields.push(`username = $${paramIndex++}`);
      values.push(updates.username);
    }
    if (updates.first_name !== undefined) {
      fields.push(`first_name = $${paramIndex++}`);
      values.push(updates.first_name);
    }
    if (updates.last_name !== undefined) {
      fields.push(`last_name = $${paramIndex++}`);
      values.push(updates.last_name);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    const query = `
      UPDATE users
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, username, first_name, last_name, created_at
    `;

    values.push(id);
    const result = await this.pool.query(query, values);
    return result.rows[0] || null;
  }

  /**
   * Удаляет пользователя
   */
  async delete(id: number): Promise<boolean> {
    const query = 'DELETE FROM users WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return (result.rowCount || 0) > 0;
  }

  /**
   * Получает статистику пользователя (используя функцию из БД)
   */
  async getStats(userId: number, daysLimit?: number): Promise<{
    message_count: number;
    first_message: Date | null;
    last_message: Date | null;
  } | null> {
    const query = 'SELECT * FROM get_user_stats($1, $2)';
    const result = await this.pool.query(query, [userId, daysLimit || null]);
    return result.rows[0] || null;
  }
}