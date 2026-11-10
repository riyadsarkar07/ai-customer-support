import type { ProviderDefinition } from "./types";

export const websiteProvider: ProviderDefinition = {
  type: "website",
  label: "Website Live Chat",
  description:
    "Embed a chat widget on your website. Messages appear in your unified inbox and AI can answer instantly.",
  requiresOAuth: false,
  setupFields: [
    {
      key: "allowedOrigins",
      label: "Allowed website origins",
      type: "text",
      required: false,
      hint: "Comma-separated list, e.g. https://example.com, https://shop.example.com. Leave blank to allow all.",
    },
  ],
  async send({ message }) {
    // Website messages are delivered in realtime through the widget's polling
    // stream, so no external API call is required.
    void message;
    return {
      status: "sent",
      externalMessageId: `web_${Date.now().toString(36)}`,
    };
  },
};
