import { isValidSolanaPublicKey } from "../solana-validation";
import {
  errorResponse,
  handleKnownError,
  isRecord,
  json,
  parseJsonObject,
  requireOwner
} from "../agent-vault/http";
import { TelegramLinkService } from "./service";
import type { TelegramLinkedAccountResult } from "./types";

interface TelegramLinkHttpHandlers {
  createLinkCode: (request: Request) => Promise<Response>;
  consumeLinkCode: (request: Request) => Promise<Response>;
}

interface TelegramLinkHttpOptions {
  service?: TelegramLinkService;
}

const handleTelegramLinkError = (error: unknown): Response => {
  if (error instanceof Error) {
    if (error.message.includes("expired") || error.message.includes("already been consumed")) {
      return errorResponse(400, "invalid_request", error.message);
    }
  }

  return handleKnownError(error);
};

const parseControllerWallet = (
  body: Record<string, unknown>,
  fallback: string
): { controllerWallet: string; usedRequestBodyWallet: boolean } => {
  if (typeof body.controllerWallet !== "string" || !body.controllerWallet.trim()) {
    return {
      controllerWallet: fallback,
      usedRequestBodyWallet: false
    };
  }

  return {
    controllerWallet: body.controllerWallet.trim(),
    usedRequestBodyWallet: true
  };
};

const parseConsumeBody = (body: Record<string, unknown>): { telegramUserId: string; code: string } => {
  const telegramUserId = typeof body.telegramUserId === "string" ? body.telegramUserId.trim() : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";

  if (!telegramUserId) {
    throw new Error("telegramUserId is required.");
  }

  if (!code) {
    throw new Error("code is required.");
  }

  return {
    telegramUserId,
    code
  };
};

const responseForLinkedResult = (result: TelegramLinkedAccountResult): Response =>
  json({
    telegramUserId: result.telegramUserId,
    controllerWallet: result.controllerWallet,
    linkedAt: result.linkedAt
  });

export const createTelegramLinkHttpHandlers = (options: TelegramLinkHttpOptions = {}): TelegramLinkHttpHandlers => {
  const service = options.service ?? new TelegramLinkService();

  return {
    createLinkCode: async (request) => {
      const auth = requireOwner(request);

      if (auth instanceof Response) {
        return auth;
      }

      try {
        const body = await (async () => {
          try {
            return await parseJsonObject(request);
          } catch (error) {
            if (
              error instanceof Error &&
              (error.message.includes("valid JSON") || error.message.includes("JSON object"))
            ) {
              return {};
            }

            throw error;
          }
        })();
        const parsed = isRecord(body) ? body : {};
        const { controllerWallet, usedRequestBodyWallet } = parseControllerWallet(parsed, auth.owner);

        if (usedRequestBodyWallet && controllerWallet !== auth.owner) {
          return errorResponse(
            403,
            "owner_mismatch",
            "Authenticated owner does not match request body controllerWallet."
          );
        }

        if (!isValidSolanaPublicKey(controllerWallet)) {
          return errorResponse(400, "invalid_request", "controllerWallet must be a valid Solana wallet address.");
        }

        const result = await service.createLinkCode(controllerWallet);

        return json(result, 201);
      } catch (error) {
        return handleTelegramLinkError(error);
      }
    },
    consumeLinkCode: async (request) => {
      try {
        const { telegramUserId, code } = parseConsumeBody(await parseJsonObject(request));
        const linked = await service.consumeLinkCode(telegramUserId, code);
        return responseForLinkedResult(linked);
      } catch (error) {
        return handleTelegramLinkError(error);
      }
    }
  };
};
