import { getStorageMode } from "@/lib/storage/config";
import { SupabaseGhostTabRepository } from "./database-repository";
import { DevFileGhostTabRepository, InMemoryGhostTabRepository } from "./repository";
import { GhostTabService } from "./service";

type GhostTabGlobal = typeof globalThis & {
  __whisperVaultGhostTabService?: GhostTabService;
};

const globalForGhostTab = globalThis as GhostTabGlobal;

const createGhostTabRepository = () => {
  if (getStorageMode() === "database") {
    return new SupabaseGhostTabRepository();
  }

  return process.env.NODE_ENV === "development"
    ? new DevFileGhostTabRepository()
    : new InMemoryGhostTabRepository();
};

export const ghostTabService =
  globalForGhostTab.__whisperVaultGhostTabService ??
  new GhostTabService({
    repository: createGhostTabRepository()
  });

if (process.env.NODE_ENV !== "production") {
  globalForGhostTab.__whisperVaultGhostTabService = ghostTabService;
}
