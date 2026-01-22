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

  async findById(id: number): Promise<UserData | null> {
    const query = 'SELECT id, username, first_name, last_name, created_at FROM users WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return result.rows[0] || null;
  }

  async findByUsername(username: string): Promise<UserData | null> {
    const query = 'SELECT id, username, first_name, last_name, created_at FROM users WHERE username = $1';
    const result = await this.pool.query(query, [username]);
    return result.rows[0] || null;
  }

  async findAll(): Promise<UserData[]> {
    const query = 'SELECT id, username, first_name, last_name, created_at FROM users ORDER BY created_at DESC';
    const result = await this.pool.query(query);
    return result.rows;
  }

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