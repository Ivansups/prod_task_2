import { Pool } from 'pg';
import { User } from '../models/User';
import { Message } from '../models/Message';

export class DatabaseService {
  private pool: Pool;
  private userModel: User;
  private messageModel: Message;

  constructor() {
    this.pool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'chat_analytics',
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'password',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.userModel = new User(this.pool);
    this.messageModel = new Message(this.pool);

    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
      process.exit(-1);
    });

    this.pool.on('connect', () => {
      console.log('Connected to PostgreSQL database');
    });
  }

  getPool(): Pool {
    return this.pool;
  }

  get users(): User {
    return this.userModel;
  }

  get messages(): Message {
    return this.messageModel;
  }

  async testConnection(): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      return true;
    } catch (error) {
      console.error('Database connection test failed:', error);
      return false;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
    console.log('Database connections closed');
  }

  async query(text: string, params?: any[]): Promise<any> {
    return this.pool.query(text, params);
  }
}

export const db = new DatabaseService();