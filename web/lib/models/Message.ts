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

  async findById(id: number): Promise<MessageData | null> {
    const query = 'SELECT id, user_id, chat_id, text, created_at FROM messages WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return result.rows[0] || null;
  }

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
}