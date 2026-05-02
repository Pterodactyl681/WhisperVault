import type { TelegramBotClient } from "./client";
import type { TelegramCommandService } from "./commands";
import { getTelegramCommandContext, parseTelegramUpdate } from "./types";

export const TELEGRAM_SECRET_HEADER = "x-telegram-bot-api-secret-token";

interface TelegramWebhookHandlerOptions {
  commandService: TelegramCommandService;
  client?: TelegramBotClient | null;
  webhookSecret?: string | null;
}

const json = (body: unknown, status = 200): Response =>
  Response.json(body, {
    status
  });

const unauthorized = (): Response =>
  json(
    {
      ok: false,
      error: "invalid_telegram_secret"
    },
    401
  );

const normalizeSecret = (value: string | null | undefined): string | null => {
  const normalized = value?.trim() ?? "";
  return normalized || null;
};

export const createTelegramWebhookHandler = (options: TelegramWebhookHandlerOptions) => {
  const commandService = options.commandService;

  return async (request: Request): Promise<Response> => {
    const expectedSecret = normalizeSecret(options.webhookSecret);

    if (expectedSecret) {
      const receivedSecret = normalizeSecret(request.headers.get(TELEGRAM_SECRET_HEADER));

      if (receivedSecret !== expectedSecret) {
        return unauthorized();
      }
    }

    let payload: unknown;

    try {
      payload = await request.json();
    } catch {
      return json(
        {
          ok: false,
          error: "invalid_json"
        },
        400
      );
    }

    const update = parseTelegramUpdate(payload);

    if (!update) {
      return json(
        {
          ok: false,
          error: "invalid_update"
        },
        400
      );
    }

    const context = getTelegramCommandContext(update);

    if (!context) {
      return json({
        ok: true,
        handled: false
      });
    }

    const messageText = context.text;
    const replyText =
      messageText === null
        ? "Text commands only right now. Send /help."
        : await (async () => {
            try {
              return await commandService.handleTextCommand({
                telegramUserId: context.telegramUserId,
                telegramChatId: context.chatId,
                text: messageText,
                username: context.username
              });
            } catch {
              return "WhisperVault hit an internal error while handling that command. Please try again.";
            }
          })();

    if (!options.client) {
      return json({
        ok: true,
        handled: true,
        delivered: false,
        replyPreview: replyText
      });
    }

    try {
      await options.client.sendMessage(context.chatId, replyText, {
        disableWebPagePreview: true
      });

      return json({
        ok: true,
        handled: true,
        delivered: true
      });
    } catch {
      return json({
        ok: true,
        handled: true,
        delivered: false
      });
    }
  };
};
