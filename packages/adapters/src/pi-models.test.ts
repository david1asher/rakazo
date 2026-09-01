import { afterEach, describe, expect, it, vi } from "vitest";
import { catalogModelLabel, listPiCatalog, scriptedCatalogEntry } from "./pi-models.js";

describe("Pi model catalog", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("lists real Pi providers instead of a two-option dropdown", () => {
    const catalog = listPiCatalog();
    const providers = new Set(catalog.map((entry) => entry.provider));
    expect(catalog.length).toBeGreaterThan(20);
    expect(providers.has("openrouter")).toBe(true);
    expect(providers.size).toBeGreaterThan(5);
    expect(
      catalog.some(
        (entry) => entry.auth === "oauth" || entry.auth === "both" || entry.subscription,
      ),
    ).toBe(true);
    const chatgpt = catalog.find((entry) => entry.provider === "openai-codex");
    expect(chatgpt?.signIn).toBe("device-code");
    expect(chatgpt?.billing).toMatch(/ChatGPT Plus or Pro/);
    const copilot = catalog.find((entry) => entry.provider === "github-copilot");
    expect(copilot?.signIn).toBe("device-code");
    const grok = catalog.find((entry) => entry.provider === "xai");
    expect(grok?.signIn).toBe("device-code");
    const claude = catalog.find((entry) => entry.provider === "anthropic");
    expect(claude).toMatchObject({
      signIn: "auth-url",
      authHint: "Claude Pro/Max / key",
      oauthLabel: "Sign in with Claude Pro/Max",
    });
    expect(scriptedCatalogEntry.provider).toBe("scripted");
  });

  it("lists current xAI and OpenCode Go models from the Pi catalog", () => {
    const catalog = listPiCatalog();
    const ids = (provider: string) =>
      catalog.filter((entry) => entry.provider === provider).map((entry) => entry.id);
    expect(ids("xai")).toContain("grok-4.6");
    expect(ids("opencode-go")).toContain("glm-5.3");
    const grok46 = catalog.find((entry) => entry.provider === "xai" && entry.id === "grok-4.6");
    expect(grok46).toMatchObject({
      reasoning: true,
      thinkingLevels: ["low", "medium", "high", "xhigh"],
    });
    const openAiCompatible = catalog.find((entry) => entry.provider === "openai-compatible");
    expect(openAiCompatible).toMatchObject({ id: "custom", placeholder: true });
  });

  it("adds a configured OpenRouter model that is newer than the static catalog", async () => {
    vi.stubEnv("PI_DEFAULT_PROVIDER", " openrouter ");
    vi.stubEnv("PI_DEFAULT_MODEL", " rakazo-test/unknown-future-model ");
    vi.resetModules();

    const { listPiCatalog: listConfiguredCatalog } = await import("./pi-models.js");
    expect(listConfiguredCatalog()[0]).toMatchObject({
      provider: "openrouter",
      id: "rakazo-test/unknown-future-model",
      label: "rakazo-test/unknown-future-model",
    });
  });

  it("normalizes a PI_DEFAULT_MODEL id that ends in -latest", async () => {
    vi.stubEnv("PI_DEFAULT_PROVIDER", "openrouter");
    vi.stubEnv("PI_DEFAULT_MODEL", "foo-latest");
    vi.resetModules();

    const { listPiCatalog: listConfiguredCatalog } = await import("./pi-models.js");
    expect(listConfiguredCatalog()[0]).toMatchObject({
      provider: "openrouter",
      id: "foo-latest",
      label: "foo (auto-updates)",
    });
  });

  it("does not advertise a synthetic model for providers the runtime cannot synthesize", async () => {
    vi.stubEnv("PI_DEFAULT_PROVIDER", "anthropic");
    vi.stubEnv("PI_DEFAULT_MODEL", "future/unknown-model");
    vi.resetModules();

    const { listPiCatalog: listConfiguredCatalog } = await import("./pi-models.js");
    expect(
      listConfiguredCatalog().some(
        (entry) => entry.provider === "anthropic" && entry.id === "future/unknown-model",
      ),
    ).toBe(false);
  });

  it('never labels a model "latest" when newer models are in the catalog', () => {
    const anthropic = listPiCatalog().filter((entry) => entry.provider === "anthropic");
    expect(anthropic.some((entry) => entry.id === "claude-opus-5")).toBe(true);
    expect(anthropic.find((entry) => entry.id === "claude-opus-4-5")?.label).toBe(
      "Claude Opus 4.5 (auto-updates)",
    );
    expect(listPiCatalog().some((entry) => /\blatest\b/i.test(entry.label))).toBe(false);
  });

  it("keeps an alias distinguishable from the snapshot it points at", () => {
    const anthropic = listPiCatalog().filter((entry) => entry.provider === "anthropic");
    const alias = anthropic.find((entry) => entry.id === "claude-haiku-4-5");
    const snapshot = anthropic.find((entry) => entry.id === "claude-haiku-4-5-20251001");
    expect(alias?.label).toBe("Claude Haiku 4.5 (auto-updates)");
    expect(snapshot?.label).toBe("Claude Haiku 4.5");
  });
});

describe("catalogModelLabel", () => {
  it("marks alias ids as auto-updating instead of latest", () => {
    expect(
      catalogModelLabel("claude-opus-4-5", "Claude Opus 4.5 (latest)", [
        "claude-opus-4-5",
        "claude-opus-4-5-20251101",
      ]),
    ).toBe("Claude Opus 4.5 (auto-updates)");
    expect(catalogModelLabel("gemini-flash-latest", "Gemini Flash Latest", [])).toBe(
      "Gemini Flash (auto-updates)",
    );
    expect(catalogModelLabel("mistral-large-latest", "Mistral Large (latest)", [])).toBe(
      "Mistral Large (auto-updates)",
    );
  });

  it("does not treat a variant sibling as proof the id is an alias", () => {
    // `-preview` is its own pinned model, not a dated snapshot of `foo`.
    expect(catalogModelLabel("foo", "Foo Latest", ["foo", "foo-preview"])).toBe("Foo");
    expect(
      catalogModelLabel("some-model", "Some Model Latest", ["some-model", "some-model-20251001"]),
    ).toBe("Some Model (auto-updates)");
    expect(
      catalogModelLabel("mistral-medium", "Mistral Medium Latest", [
        "mistral-medium",
        "mistral-medium-2508",
      ]),
    ).toBe("Mistral Medium (auto-updates)");
  });

  it("strips id separators when the name is the bare -latest or /latest id", () => {
    expect(catalogModelLabel("foo-latest", "foo-latest", [])).toBe("foo (auto-updates)");
    expect(catalogModelLabel("foo/latest", "foo/latest", [])).toBe("foo (auto-updates)");
  });

  it("drops a latest marker from a pinned id rather than promising updates", () => {
    expect(
      catalogModelLabel("mistral/mistral-medium-3.5", "Mistral Medium Latest", [
        "mistral/mistral-medium-3.5",
      ]),
    ).toBe("Mistral Medium");
  });

  it("leaves ordinary labels alone and falls back to the id", () => {
    expect(catalogModelLabel("claude-opus-5", "Claude Opus 5", [])).toBe("Claude Opus 5");
    expect(catalogModelLabel("some-model", undefined, [])).toBe("some-model");
    expect(catalogModelLabel("latest", "latest", [])).toBe("latest");
  });
});
