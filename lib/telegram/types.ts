export interface TelegramUser {
  id: number | string;
  username?: string;
}

export interface TelegramChat {
  id: number | string;
  type?: string;
}

export interface TelegramMessage {
  message_id?: number;
  text?: string;
  chat?: TelegramChat | null;
  from?: TelegramUser | null;
}

export interface TelegramUpdate {
  update_id?: number;
  message?: TelegramMessage | null;
}

export interface ParsedTelegramCommand {
  name: string;
  args: string[];
  rawArgs: string;
}

export interface TelegramCommandContext {
  chatId: string;
  telegramUserId: string | null;
  text: string | null;
  username: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const asOptionalString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
};

const asOptionalId = (value: unknown): string | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return null;
};

export const parseTelegramUpdate = (value: unknown): TelegramUpdate | null => {
  if (!isRecord(value)) {
    return null;
  }

  const message = isRecord(value.message) ? value.message : null;
  const chat = message && isRecord(message.chat) ? message.chat : null;
  const from = message && isRecord(message.from) ? message.from : null;

  return {
    update_id: typeof value.update_id === "number" ? value.update_id : undefined,
    message: message
      ? {
          message_id: typeof message.message_id === "number" ? message.message_id : undefined,
          text: asOptionalString(message.text) ?? undefined,
          chat: chat
            ? {
                id: asOptionalId(chat.id) ?? "",
                type: asOptionalString(chat.type) ?? undefined
              }
            : null,
          from: from
            ? {
                id: asOptionalId(from.id) ?? "",
                username: asOptionalString(from.username) ?? undefined
              }
            : null
        }
      : null
  };
};

export const getTelegramCommandContext = (update: TelegramUpdate): TelegramCommandContext | null => {
  const chatId = asOptionalId(update.message?.chat?.id);

  if (!chatId) {
    return null;
  }

  return {
    chatId,
    telegramUserId: asOptionalId(update.message?.from?.id),
    text: asOptionalString(update.message?.text),
    username: asOptionalString(update.message?.from?.username)
  };
};

export const parseTelegramCommand = (text: string): ParsedTelegramCommand | null => {
  const normalized = text.trim();

  if (!normalized.startsWith("/")) {
    return null;
  }

  const [head, ...tail] = normalized.split(/\s+/);
  const commandName = head.slice(1).split("@")[0]?.trim().toLowerCase() ?? "";

  if (!commandName) {
    return null;
  }

  return {
    name: commandName,
    args: tail,
    rawArgs: tail.join(" ").trim()
  };
};
