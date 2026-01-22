import { Pool, QueryResult, QueryResultRow } from 'pg';
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
      max: 20, // Максимальное количество соединений
      idleTimeoutMillis: 30000, // Время ожидания неактивного соединения
      connectionTimeoutMillis: 2000, // Таймаут подключения
    });

    this.userModel = new User(this.pool);
    this.messageModel = new Message(this.pool);

    // Обработка ошибок подключения
    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
      process.exit(-1);
    });

    this.pool.on('connect', () => {
      console.log('Connected to PostgreSQL database');
    });
  }

  /**
   * Получает экземпляр пула соединений
   */
  getPool(): Pool {
    return this.pool;
  }

  /**
   * Получает модель пользователей
   */
  get users(): User {
    return this.userModel;
  }

  /**
   * Получает модель сообщений
   */
  get messages(): Message {
    return this.messageModel;
  }

  /**
   * Проверяет подключение к базе данных
   */
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

  /**
   * Закрывает все соединения с базой данных
   */
  async close(): Promise<void> {
    await this.pool.end();
    console.log('Database connections closed');
  }

  /**
   * Выполняет SQL запрос напрямую
   */
  async query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<T>> {
    return this.pool.query(text, params);
  }
}

// Создаем синглтон экземпляр сервиса базы данных
export const db = new DatabaseService();