import { createTelegramWebhookHandler } from "@/lib/telegram/webhook";
import { getTelegramBotClient, getTelegramWebhookSecret, telegramCommandService } from "@/lib/telegram/server";

export const POST = async (request: Request): Promise<Response> =>
  createTelegramWebhookHandler({
    commandService: telegramCommandService,
    client: getTelegramBotClient(),
    webhookSecret: getTelegramWebhookSecret()
  })(request);
