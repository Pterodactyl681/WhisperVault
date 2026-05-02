import { agentBudgetPolicyAdapter } from "@/lib/agent-budget/server";
import { telegramLinkService } from "@/lib/telegram-link/server";
import { whisperPayServerService } from "@/lib/whisperpay-server/server";
import { createTelegramBotClient, type TelegramBotClient } from "./client";
import { TelegramCommandService } from "./commands";

type TelegramGlobal = typeof globalThis & {
  __whisperPayTelegramCommandService?: TelegramCommandService;
};

const globalForTelegram = globalThis as TelegramGlobal;

export const telegramCommandService =
  globalForTelegram.__whisperPayTelegramCommandService ??
  new TelegramCommandService({
    telegramLinkService,
    budgetPolicy: agentBudgetPolicyAdapter,
    paylinkService: whisperPayServerService
  });

export const getTelegramBotToken = (env: NodeJS.ProcessEnv = process.env): string | null => {
  const token = env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
  return token || null;
};

export const getTelegramWebhookSecret = (env: NodeJS.ProcessEnv = process.env): string | null => {
  const secret = env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? "";
  return secret || null;
};

export const getTelegramBotClient = (env: NodeJS.ProcessEnv = process.env): TelegramBotClient | null => {
  const token = getTelegramBotToken(env);

  if (!token) {
    return null;
  }

  return createTelegramBotClient({
    token
  });
};

if (process.env.NODE_ENV !== "production") {
  globalForTelegram.__whisperPayTelegramCommandService = telegramCommandService;
}
