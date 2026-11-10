import { telegramProvider } from "./telegram";
import { websiteProvider } from "./website";
import {
  facebookProvider,
  instagramProvider,
  whatsappProvider,
} from "./meta";
import { gmailProvider, outlookProvider } from "./email";
import type { ProviderDefinition } from "./types";
import type { channelTypes } from "@/lib/db/schema";

export type ChannelType = (typeof channelTypes)[number];

const registry: Record<ChannelType, ProviderDefinition> = {
  telegram: telegramProvider,
  website: websiteProvider,
  facebook: facebookProvider,
  instagram: instagramProvider,
  whatsapp: whatsappProvider,
  gmail: gmailProvider,
  outlook: outlookProvider,
};

export function getProvider(type: ChannelType): ProviderDefinition {
  const provider = registry[type];
  if (!provider) throw new Error(`Unknown channel type: ${type}`);
  return provider;
}

export function listProviders(): ProviderDefinition[] {
  return Object.values(registry);
}

export function providerCatalog() {
  return listProviders()
    .filter((p) => p.type !== "website")
    .map((p) => ({
      type: p.type,
      label: p.label,
      description: p.description,
      requiresOAuth: p.requiresOAuth,
      setupFields: p.setupFields,
      docsUrl: p.docsUrl,
    }));
}

export * from "./types";
