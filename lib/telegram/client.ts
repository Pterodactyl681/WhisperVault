export interface TelegramSendMessageOptions {
  parseMode?: "Markdown" | "MarkdownV2" | "HTML";
  disableWebPagePreview?: boolean;
}

export interface TelegramBotClient {
  sendMessage(chatId: string, text: string, options?: TelegramSendMessageOptions): Promise<void>;
}

export interface TelegramBotClientOptions {
  token: string;
  apiBaseUrl?: string;
  fetch?: typeof fetch;
}

const DEFAULT_API_BASE_URL = "https://api.telegram.org";

const assertNonEmptyString = (value: string, fieldName: string): string => {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${fieldName} is required.`);
  }

  return normalized;
};

const getRuntimeFetch = (): typeof fetch => {
  if (typeof fetch !== "function") {
    throw new Error("Telegram bot client requires fetch support at runtime.");
  }

  return fetch;
};

export const createTelegramBotClient = (options: TelegramBotClientOptions): TelegramBotClient => {
  const token = assertNonEmptyString(options.token, "TELEGRAM_BOT_TOKEN");
  const apiBaseUrl = (options.apiBaseUrl ?? DEFAULT_API_BASE_URL).replace(/\/+$/, "");
  const runtimeFetch = options.fetch ?? getRuntimeFetch();

  return {
    async sendMessage(chatId, text, sendOptions = {}) {
      const normalizedChatId = assertNonEmptyString(String(chatId), "chatId");
      const normalizedText = assertNonEmptyString(text, "text");
      const response = await runtimeFetch(`${apiBaseUrl}/bot${token}/sendMessage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          chat_id: normalizedChatId,
          text: normalizedText,
          ...(sendOptions.parseMode ? { parse_mode: sendOptions.parseMode } : {}),
          ...(sendOptions.disableWebPagePreview ? { disable_web_page_preview: true } : {})
        })
      });

      if (!response.ok) {
        throw new Error(`Telegram sendMessage failed with ${response.status} ${response.statusText}.`);
      }
    }
  };
};
