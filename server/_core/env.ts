export const ENV = {
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  isProduction: process.env.NODE_ENV === "production",

  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",

  localAiProvider: (process.env.LOCAL_AI_PROVIDER ?? "").toLowerCase(),
  localAiBaseUrl: process.env.LOCAL_AI_BASE_URL ?? "",
  localAiApiKey: process.env.LOCAL_AI_API_KEY ?? "ollama",
  localAiModel: process.env.LOCAL_AI_MODEL ?? "",

  aiAdvisorProvider: (process.env.AI_ADVISOR_PROVIDER ?? "ollama").toLowerCase(),
  omniRouteBaseUrl: process.env.OMNIROUTE_BASE_URL ?? "",
  omniRouteApiKey: process.env.OMNIROUTE_API_KEY ?? "",
  omniRouteModel: process.env.OMNIROUTE_MODEL ?? "",

  cardmarketPriceGuideUrl:
    process.env.CARDMARKET_PRICE_GUIDE_URL ?? "",
  cardmarketProductCatalogUrl:
    process.env.CARDMARKET_PRODUCT_CATALOG_URL ?? "",

  cardTraderToken: process.env.CARDTRADER_API_TOKEN ?? "",
  cardTraderExpansionIds: (process.env.CARDTRADER_EXPANSION_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
};
