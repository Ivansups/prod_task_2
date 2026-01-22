import { GoogleGenerativeAI } from '@google/generative-ai';

export interface UserAnalysis {
  personality: string;
  topics: string[];
  communicationStyle: string;
  activity: string;
  recommendations: string[];
}

export class GeminiService {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is required for LLM analysis');
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
  }

  async analyzeUser(
    username: string,
    messages: Array<{ text: string; created_at: Date }>,
    totalMessages: number
  ): Promise<UserAnalysis> {
    try {
      const prompt = this.buildAnalysisPrompt(username, messages, totalMessages);
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      return this.parseAnalysisResponse(text);
    } catch (error) {
      console.error('Error analyzing user with Gemini:', error);
      throw new Error('Не удалось проанализировать пользователя');
    }
  }

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

  private parseAnalysisResponse(response: string): UserAnalysis {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

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
      return {
        personality: "Не удалось проанализировать личность пользователя",
        topics: ["Анализ недоступен"],
        communicationStyle: "Информация о стиле общения недоступна",
        activity: "Информация об активности недоступна",
        recommendations: ["Рекомендуется собрать больше данных для анализа"]
      };
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const result = await this.model.generateContent('Hello, test message');
      await result.response;
      return true;
    } catch (error) {
      console.error('Gemini API connection test failed:', error);
      return false;
    }
  }
}

export const geminiService = new GeminiService();