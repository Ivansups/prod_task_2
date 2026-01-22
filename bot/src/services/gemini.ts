import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { config } from '../config';

export interface UserAnalysis {
  personality: string;
  topics: string[];
  communicationStyle: string;
  activity: string;
  recommendations: string[];
}

export class GeminiService {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;

  constructor() {
    if (!config.gemini.apiKey) {
      throw new Error('GEMINI_API_KEY is required for LLM analysis');
    }

    this.genAI = new GoogleGenerativeAI(config.gemini.apiKey);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
  }

  /**
   * Анализирует поведение пользователя на основе его сообщений
   */
  async analyzeUser(
    username: string,
    messages: Array<{ text: string; created_at: Date }>,
    totalMessages: number
  ): Promise<UserAnalysis> {
    try {
      // Подготавливаем промпт для анализа
      const prompt = this.buildAnalysisPrompt(username, messages, totalMessages);

      // Получаем ответ от Gemini
      const result = await this.model!.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // Парсим ответ в структурированный формат
      return this.parseAnalysisResponse(text);
    } catch (error) {
      console.error('Error analyzing user with Gemini:', error);
      throw new Error('Не удалось проанализировать пользователя');
    }
  }

  /**
   * Строит промпт для анализа пользователя
   */
  private buildAnalysisPrompt(
    username: string,
    messages: Array<{ text: string; created_at: Date }>,
    totalMessages: number
  ): string {
    const messagesText = messages
      .map(msg => `[${msg.created_at.toISOString()}] ${msg.text}`)
      .join('\n');

    return `Ты - эксперт по анализу поведения пользователей в Telegram чатах. Проанализируй пользователя @${username} на основе следующих данных:

ОБЩАЯ ИНФОРМАЦИЯ:
- Всего сообщений в чате: ${totalMessages}
- Анализируемые сообщения: ${messages.length} последних

ПОСЛЕДНИЕ СООБЩЕНИЯ (в хронологическом порядке):
${messagesText}

ЗАДАЧА: Проанализируй стиль общения, темы, активность и личность пользователя. Дай структурированный анализ в формате JSON:

{
  "personality": "Краткое описание характера и типа личности (1-2 предложения)",
  "topics": ["Основные темы обсуждения (3-5 пунктов)"],
  "communicationStyle": "Стиль общения: формальный/неформальный, длинные/короткие сообщения, эмодзи и т.д. (1-2 предложения)",
  "activity": "Уровень активности и паттерны поведения (когда пишет, как часто) (1-2 предложения)",
  "recommendations": ["Рекомендации по взаимодействию с пользователем (2-3 пункта)"]
}

Ответь ТОЛЬКО в формате JSON, без дополнительного текста.`;
  }

  /**
   * Парсит ответ от Gemini в структурированный формат
   */
  private parseAnalysisResponse(response: string): UserAnalysis {
    try {
      // Ищем JSON в ответе (на случай если Gemini добавит лишний текст)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Валидируем структуру
      if (!parsed.personality || !parsed.topics || !parsed.communicationStyle ||
          !parsed.activity || !parsed.recommendations) {
        throw new Error('Invalid analysis structure');
      }

      return {
        personality: parsed.personality,
        topics: Array.isArray(parsed.topics) ? parsed.topics : [],
        communicationStyle: parsed.communicationStyle,
        activity: parsed.activity,
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : []
      };
    } catch (error) {
      console.error('Error parsing Gemini response:', error);
      // Возвращаем дефолтный анализ в случае ошибки парсинга
      return {
        personality: "Не удалось проанализировать личность пользователя",
        topics: ["Анализ недоступен"],
        communicationStyle: "Информация о стиле общения недоступна",
        activity: "Информация об активности недоступна",
        recommendations: ["Рекомендуется собрать больше данных для анализа"]
      };
    }
  }

  /**
   * Тестирует подключение к Gemini API
   */
  async testConnection(): Promise<boolean> {
    try {
      const result = await this.model!.generateContent('Hello, test message');
      await result.response;
      return true;
    } catch (error) {
      console.error('Gemini API connection test failed:', error);
      return false;
    }
  }
}

// Создаем singleton экземпляр сервиса
export const geminiService = new GeminiService();