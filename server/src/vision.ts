// Advanced vision mode — the agent's eyes on the live preview.
// Transposed from Hermes Agent's briques: the browser/CDP tool becomes an
// in-process MCP tool (createSdkMcpServer) backed by Playwright, and
// IterationBudget becomes a per-turn snapshot counter with Hermes' soft-stop
// stance (the tool answers "budget exhausted", it never throws).
// The closed loop itself (patch → snapshot → critique → crop → re-patch)
// lives in the system prompt (VISION_RULES in agent.ts) — the model loops,
// this tool only captures.
import path from "node:path";
import fs from "node:fs";
import { z } from "zod";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { chromium, type Browser } from "playwright";

export const SNAPSHOTS_DIR_NAME = ".snapshots";

// Hermes' IterationBudget concept: hard cap per turn, soft stop when spent.
// Two ceilings, picked per turn by the effort mode (idea 12): Élite gets the
// full budget for its patch→snapshot→crop loop; MVP gets a tight one (a single
// control snapshot is enough) to stay fast and cheap.
const BUDGET_ELITE = Number(process.env.VISION_BUDGET ?? 10);
const BUDGET_MVP = Number(process.env.VISION_BUDGET_MVP ?? 3);
// 1280×800 ≈ 1.0 MP ≈ ~1 400 vision tokens per global snapshot — cheap enough
// to loop, small enough never to hit Anthropic's 5 MB / 8 000 px limits.
const VIEWPORT = { width: 1280, height: 800 };
const FULL_PAGE_MAX_HEIGHT = 6000;
const MAX_IMAGE_BYTES = 4_000_000; // Hermes' proactive 4 MB embed cap
const IDLE_CLOSE_MS = 60_000;
// Idea #53 follow-up: a snapshot can drive an interactive app (canvas game…)
// with a short input sequence before capturing, so the image shows an
// interacted state (movement, combat) instead of the idle first frame. Capped
// so a sequence can never hang a turn.
const MAX_INPUT_STEPS = 24; // steps per snapshot sequence
const MAX_INPUT_MS_TOTAL = 8_000; // total hold/wait budget per snapshot
const MAX_STEP_MS = 2_000; // ceiling on a single hold/wait

// One agent turn at a time (agentBusy upstream) → simple module state.
let projectDir: string | null = null;
let previewUrl: string | null = null;
let used = 0;
let budget = BUDGET_ELITE;
let counter = 0;
let browser: Browser | null = null;
let idleTimer: NodeJS.Timeout | null = null;

// ── Sharingan color helpers (pure — exported for unit tests) ─────────────────

/** Converts a CSS color string (rgb/rgba/hex) to a lowercase #rrggbb hex, or
 *  null for transparent/invalid/default values. Pure → unit-testable. */
export function cssColorToHex(color: string): string | null {
  if (!color) return null;
  const s = color.trim();
  if (s === "transparent" || s === "initial" || s === "inherit" || s === "none" || s === "currentColor") return null;
  const m = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (m) {
    const a = m[4] !== undefined ? parseFloat(m[4]) : 1;
    if (a === 0) return null; // fully transparent
    return `#${[parseInt(m[1]), parseInt(m[2]), parseInt(m[3])].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
  }
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
  return null;
}

function _isNearBlack(hex: string): boolean {
  return parseInt(hex.slice(1, 3), 16) < 12 && parseInt(hex.slice(3, 5), 16) < 12 && parseInt(hex.slice(5, 7), 16) < 12;
}
function _isNearWhite(hex: string): boolean {
  return parseInt(hex.slice(1, 3), 16) > 243 && parseInt(hex.slice(3, 5), 16) > 243 && parseInt(hex.slice(5, 7), 16) > 243;
}

/** Deduplicates CSS color strings, filters near-black/near-white, sorts by
 *  frequency, returns up to 8 design colors as #rrggbb hex. Pure → unit-testable. */
export function dedupeColors(rawColors: string[]): string[] {
  const freq = new Map<string, number>();
  for (const c of rawColors) {
    const hex = cssColorToHex(c);
    if (!hex || hex.length !== 7) continue;
    if (_isNearBlack(hex) || _isNearWhite(hex)) continue;
    freq.set(hex, (freq.get(hex) ?? 0) + 1);
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([h]) => h);
}

/** Called at the start of each /api/chat turn: binds the tool to the active
 * project, sets the snapshot budget for the chosen effort mode, resets the
 * counter and purges the previous turn's files. */
export function setVisionContext(
  dir: string,
  url: string,
  mode: "mvp" | "elite" | "finition" | "nocturne" | "esthetique" | "discuss" | "projet" | "compose" | "uxui" | "layout" = "elite",
): void {
  projectDir = dir;
  previewUrl = url;
  used = 0;
  // Finition runs the full visual loop like Élite (it hardens states/responsive).
  budget = mode === "mvp" ? BUDGET_MVP : BUDGET_ELITE;
  try {
    fs.rmSync(path.join(dir, SNAPSHOTS_DIR_NAME), { recursive: true, force: true });
  } catch (err) {
    console.warn("[vision] purge:", err instanceof Error ? err.message : err);
  }
}

export function visionStatus(): { used: number; budget: number } {
  return { used, budget };
}

/** URL de la preview liée au tour courant (null si aucune). Lecture seule —
 * idée #80 (capture avant/après) en a besoin sans toucher au contexte vision. */
export function getPreviewUrl(): string | null {
  return previewUrl;
}

/** Capture pleine fenêtre d'une URL INTERNE de confiance (la preview locale) en
 * JPEG q80. Réutilise getBrowser(). Contrairement à captureExternal, PAS de garde
 * isCloneableUrl (qui bloque localhost) — l'URL vient de la preview de l'app, pas
 * de l'utilisateur. Lève si le navigateur est indisponible → l'appelant catch.
 * Utilisé par la capture avant/après (#80), hors de la boucle MCP. */
export async function capturePreview(url: string, opts: { fullPage?: boolean } = {}): Promise<Buffer> {
  const b = await getBrowser();
  const context = await b.newContext({ viewport: VIEWPORT });
  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "load", timeout: 10_000 });
    await page.waitForLoadState("networkidle", { timeout: 4_000 }).catch(() => {});
    await page.waitForTimeout(300); // settle animations / HMR
    // Nuit 2026-07-03 — fullPage optionnel : sans lui, tout ce qui vit sous la ligne
    // de flottaison (sections basses, footer) n'était JAMAIS vu par aucun œil.
    return await page.screenshot({ type: "jpeg", quality: 80, fullPage: opts.fullPage === true });
  } finally {
    await context.close().catch(() => {});
    touchIdleTimer();
  }
}

/** (É2, render-integrity — 2026-07-07) Variante ADDITIVE de capturePreview : mesure
 *  la casse DÉTERMINISTE (débordement/chevauchement/images cassées, render-integrity.ts)
 *  sur la page LIVE avant de la fermer, en plus du screenshot. N'affecte AUCUN appelant
 *  existant de capturePreview (fonction séparée, jamais appelée par défaut). */
export async function capturePreviewWithIntegrity(
  url: string,
  opts: { fullPage?: boolean } = {},
): Promise<{ buf: Buffer; integrity: import("./render-integrity.js").IntegrityReport }> {
  const { measureIntegrity } = await import("./render-integrity.js");
  const b = await getBrowser();
  const context = await b.newContext({ viewport: VIEWPORT });
  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "load", timeout: 10_000 });
    await page.waitForLoadState("networkidle", { timeout: 4_000 }).catch(() => {});
    await page.waitForTimeout(300);
    const integrity = await measureIntegrity(page).catch(
      (): import("./render-integrity.js").IntegrityReport => ({ broken: false, faults: [] }),
    );
    const buf = await page.screenshot({ type: "jpeg", quality: 80, fullPage: opts.fullPage === true });
    return { buf, integrity };
  } finally {
    await context.close().catch(() => {});
    touchIdleTimer();
  }
}

// The browser is a subprocess (jalon 1 isolation stance): a Playwright crash
// surfaces as a tool error, never as a server crash. Closed after idle so a
// finished turn doesn't keep Edge in memory.
// (N23, nuit 2026-07-03) on mémoïse la PROMESSE de launch, pas seulement
// l'instance : deux appels concurrents lançaient DEUX Chromium — le premier
// était écrasé par l'assignation et fuyait (jamais fermé, l'idle timer ne
// référençant que le nouveau).
let launchInFlight: Promise<Browser> | null = null;
export async function getBrowser(): Promise<Browser> {
  if (browser?.isConnected()) return browser;
  if (!launchInFlight) {
    launchInFlight = chromium
      .launch({ channel: "msedge", headless: true })
      .then((b) => {
        browser = b;
        return b;
      })
      .finally(() => {
        launchInFlight = null;
      });
  }
  return launchInFlight;
}

/** (N20) Fermeture propre au shutdown du backend — sans elle, tuer le process
 * laissait un msedge headless orphelin en mémoire (avec les Vite du pool). */
export async function closeBrowser(): Promise<void> {
  const b = browser;
  browser = null;
  await b?.close().catch(() => undefined);
}

function touchIdleTimer(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    browser?.close().catch(() => {});
    browser = null;
  }, IDLE_CLOSE_MS);
  idleTimer.unref();
}

const snapshotTool = tool(
  "snapshot",
  "Captures the live preview of the app as an image you can SEE (the rendered result, not the code). " +
    "Use it to verify your visual work: first a global snapshot, then — if a zone looks wrong, dense or unreadable " +
    "(table, chart, small text, alignment) — a zoomed crop of that zone via `selector` or `box` with `scale` 2-3. " +
    "For an INTERACTIVE app (canvas game, anything needing keys/clicks to leave its idle screen), pass `inputs`: a short " +
    "sequence of key presses/holds, clicks and waits played BEFORE the capture, so the image shows movement/combat/an " +
    "interacted state instead of the inert first frame. To start a game whose Start button is a DOM element, click it with " +
    "`clickText` (e.g. 'JOUER') or `clickSelector` — more reliable than guessing pixel coordinates — then drive with keys " +
    "(e.g. hold ArrowRight 600ms to move, press z to attack). Keys go to the canvas; a focused text/number input would otherwise eat them.",
  {
    selector: z
      .string()
      .optional()
      .describe("CSS selector of one element to capture (crop + zoom on it)"),
    inputs: z
      .array(
        z.object({
          key: z
            .string()
            .optional()
            .describe("Keyboard key to send (Playwright name: ArrowRight, Enter, w, z, ' ' for space)"),
          hold: z
            .number()
            .optional()
            .describe("Hold the key for this many ms (max 2000); omit for a single tap"),
          click: z
            .object({ x: z.number(), y: z.number() })
            .optional()
            .describe("Click at these viewport pixel coordinates (1280×800 base)"),
          clickSelector: z
            .string()
            .optional()
            .describe("Click a DOM element by CSS selector (robust — prefer this over `click` to press a Start/Play button)"),
          clickText: z
            .string()
            .optional()
            .describe("Click the first element containing this text (e.g. 'JOUER', 'Start') — robust for buttons without a stable selector"),
          wait: z.number().optional().describe("Wait this many ms before the next step (max 2000)"),
        }),
      )
      .optional()
      .describe("Input sequence played on the preview BEFORE capturing (max 24 steps, ~8s total) — drive a game/interactive app into a meaningful state"),
    box: z
      .object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
      .optional()
      .describe("Pixel bounding box to crop, in base viewport coordinates (1280×800)"),
    scale: z
      .number()
      .min(1)
      .max(3)
      .optional()
      .describe("Device scale factor for a high-resolution zoom (default 1; use 2-3 with selector/box)"),
    fullPage: z
      .boolean()
      .optional()
      .describe("Capture the whole page height (max 6000px; scale forced to 1)"),
  },
  async (args) => {
    if (!projectDir || !previewUrl) {
      return text("Aucun aperçu actif — impossible de capturer.", true);
    }
    if (used >= budget) {
      return text(
        `Budget vision épuisé pour ce tour (${budget} snapshots). N'en demande plus : livre l'état actuel et résume textuellement les écarts restants.`,
      );
    }
    used += 1;
    try {
      const effScale = args.fullPage ? 1 : Math.round(args.scale ?? 1);
      const b = await getBrowser();
      const context = await b.newContext({ viewport: VIEWPORT, deviceScaleFactor: effScale });
      try {
        const page = await context.newPage();
        await page.goto(previewUrl, { waitUntil: "load", timeout: 10_000 });
        await page.waitForLoadState("networkidle", { timeout: 4_000 }).catch(() => {});
        await page.waitForTimeout(300); // settle animations/HMR

        // Drive an interactive app before capturing. Most games listen on
        // window keydown, which catches bubbled events whatever has focus, so a
        // body/canvas focus is enough — no click needed (a stray click could be
        // read as a game action). Each step is isolated: a bad key is skipped,
        // never aborts the snapshot; held keys are always released.
        if (args.inputs?.length) {
          await page
            .evaluate(() => (document.querySelector("canvas") ?? document.body)?.focus?.())
            .catch(() => {});
          let spent = 0;
          for (const step of args.inputs.slice(0, MAX_INPUT_STEPS)) {
            if (spent >= MAX_INPUT_MS_TOTAL) break;
            try {
              if (step.clickSelector) {
                await page.locator(step.clickSelector).first().click({ timeout: 2_000 });
              } else if (step.clickText) {
                await page.getByText(step.clickText, { exact: false }).first().click({ timeout: 2_000 });
              } else if (step.click) {
                await page.mouse.click(step.click.x, step.click.y);
              } else if (step.key) {
                if (step.hold && step.hold > 0) {
                  const ms = Math.min(step.hold, MAX_STEP_MS);
                  await page.keyboard.down(step.key);
                  try {
                    await page.waitForTimeout(ms);
                  } finally {
                    await page.keyboard.up(step.key).catch(() => {});
                  }
                  spent += ms;
                } else {
                  await page.keyboard.press(step.key);
                }
              }
              if (step.wait && step.wait > 0) {
                const w = Math.min(step.wait, MAX_STEP_MS);
                await page.waitForTimeout(w);
                spent += w;
              }
            } catch {
              /* skip a bad step, keep the sequence going */
            }
          }
          await page.waitForTimeout(150); // let the final frame render
        }

        const jpeg = { type: "jpeg" as const, quality: 80 };
        let buf: Buffer;
        let zone: string;
        if (args.selector) {
          const locator = page.locator(args.selector).first();
          await locator.waitFor({ state: "visible", timeout: 3_000 });
          buf = await locator.screenshot(jpeg);
          zone = `élément « ${args.selector} »`;
        } else if (args.box) {
          buf = await page.screenshot({ ...jpeg, clip: args.box });
          zone = `zone ${args.box.width}×${args.box.height} @ (${args.box.x}, ${args.box.y})`;
        } else {
          const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
          const height = args.fullPage
            ? Math.min(pageHeight, FULL_PAGE_MAX_HEIGHT)
            : VIEWPORT.height;
          buf = await page.screenshot({
            ...jpeg,
            clip: { x: 0, y: 0, width: VIEWPORT.width, height },
          });
          zone = args.fullPage ? `page entière (${height}px de haut)` : "aperçu (vue initiale)";
        }
        if (buf.length > MAX_IMAGE_BYTES) {
          return text(
            `Snapshot trop lourd (${Math.round(buf.length / 1024)} Ko) — capture une zone plus petite (selector/box) ou baisse le scale.`,
            true,
          );
        }

        // Kept on disk for debugging, purged at the start of the next turn.
        const dir = path.join(projectDir, SNAPSHOTS_DIR_NAME);
        fs.mkdirSync(dir, { recursive: true });
        const file = `snap-${++counter}.jpg`;
        fs.writeFileSync(path.join(dir, file), buf);

        return {
          content: [
            { type: "image" as const, data: buf.toString("base64"), mimeType: "image/jpeg" },
            {
              type: "text" as const,
              text:
                `Snapshot de ${zone} (scale ${effScale})` +
                `${args.inputs?.length ? ` après ${args.inputs.length} action(s) jouée(s)` : ""}` +
                ` — budget restant : ${budget - used}/${budget}. ` +
                `Analyse l'image puis résume textuellement ce que tu constates.`,
            },
          ],
        };
      } finally {
        await context.close().catch(() => {});
        touchIdleTimer();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
      return text(`Échec du snapshot : ${msg}`, true);
    }
  },
);

/** User-initiated zone capture (the chat's Snap button): renders the preview
 * at the exact viewport size the user sees (the iframe's CSS size) and crops
 * to the drawn box, so the capture matches the screen. PNG for crisp text
 * (the agent may OCR code/text from it). Does NOT consume the agent's vision
 * budget — this is the user's hand, not the agent's eyes. */
export async function snapZone(
  url: string,
  viewport: { width: number; height: number },
  box: { x: number; y: number; width: number; height: number },
): Promise<Buffer> {
  const b = await getBrowser();
  const context = await b.newContext({
    viewport: {
      width: Math.max(50, Math.round(viewport.width)),
      height: Math.max(50, Math.round(viewport.height)),
    },
    deviceScaleFactor: 2, // crisp text for OCR
  });
  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "load", timeout: 10_000 });
    await page.waitForLoadState("networkidle", { timeout: 4_000 }).catch(() => {});
    await page.waitForTimeout(300);
    return await page.screenshot({
      type: "png",
      clip: {
        x: Math.max(0, Math.round(box.x)),
        y: Math.max(0, Math.round(box.y)),
        width: Math.max(8, Math.round(box.width)),
        height: Math.max(8, Math.round(box.height)),
      },
    });
  } finally {
    await context.close().catch(() => {});
    touchIdleTimer();
  }
}

function text(message: string, isError = false) {
  return { content: [{ type: "text" as const, text: message }], ...(isError ? { isError: true } : {}) };
}

// ── Clone-from-URL (native alternative to Figma): screenshot a LIVE site so the
// agent can SEE its design and rebuild it. Reuses the same Playwright browser.
const CLONE_VIEWPORT = { width: 1280, height: 900 };
const CLONE_MAX_HEIGHT = 5000; // stay well under Anthropic's image limits

// Accepts only public http(s) URLs — blocks localhost/private ranges so the tool
// can't be turned against the user's own preview/backend (light SSRF hygiene).
// Pure → unit-testable.
export function isCloneableUrl(s: string): boolean {
  let u: URL;
  try {
    u = new URL((s ?? "").trim());
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h === "::1") return false;
  if (/^(127\.|10\.|0\.0\.0\.0|169\.254\.|192\.168\.)/.test(h)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
  return true;
}

/** Full-page screenshot of an external website (JPEG). Reuses getBrowser(). */
export async function captureExternal(url: string): Promise<{ buf: Buffer; height: number }> {
  const b = await getBrowser();
  const context = await b.newContext({ viewport: CLONE_VIEWPORT, deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "load", timeout: 20_000 });
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(600); // let fonts/hero images settle
    const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    const height = Math.min(pageHeight || CLONE_VIEWPORT.height, CLONE_MAX_HEIGHT);
    const buf = await page.screenshot({
      type: "jpeg",
      quality: 80,
      clip: { x: 0, y: 0, width: CLONE_VIEWPORT.width, height },
    });
    return { buf, height };
  } finally {
    await context.close().catch(() => {});
    touchIdleTimer();
  }
}

const cloneTool = tool(
  "clone_url",
  "Captures a full-page screenshot of a LIVE website from its URL so you can SEE its design and rebuild it. " +
    "Call this FIRST when the user gives a website URL and asks to clone/reproduce it or build something 'like this site'. " +
    "Then recreate its structure, palette and typography in React + Tailwind v4 — never copy its text/content.",
  { url: z.string().describe("Public http(s) URL of the website to capture") },
  async (args) => {
    if (!isCloneableUrl(args.url)) {
      return text("URL invalide pour le clonage — fournis une adresse http(s) publique (pas localhost).", true);
    }
    try {
      const { buf, height } = await captureExternal(args.url);
      if (buf.length > MAX_IMAGE_BYTES) {
        return text(
          `Capture trop lourde (${Math.round(buf.length / 1024)} Ko) — réessaie ; si ça persiste, décris le design.`,
          true,
        );
      }
      return {
        content: [
          { type: "image" as const, data: buf.toString("base64"), mimeType: "image/jpeg" },
          {
            type: "text" as const,
            text:
              `Capture de ${args.url} (${height}px de haut). Reproduis fidèlement sa structure, sa palette et sa ` +
              "typographie en React + Tailwind v4 — recrée le DESIGN, ne copie pas le contenu textuel.",
          },
        ],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
      return text(`Échec de la capture du site : ${msg}`, true);
    }
  },
);

// ── Scrape-from-URL : aspire l'INFORMATION d'une page publique (texte + liens),
// pas seulement ses pixels. Réutilise le même Chromium que captureExternal : un
// seul chargement de page rend le texte (pour répondre) ET, en option, l'image
// (pour le layout). Bien plus puissant qu'un screenshot pour « aspirer des infos
// et les retranscrire en local » → Claude synthétise ensuite la réponse.
export const SCRAPE_MAX_TEXT = 16_000; // caractères — borne le coût en tokens
export const SCRAPE_MAX_LINKS = 60;

export interface ScrapedPage {
  title: string;
  text: string;
  links: { href: string; label: string }[];
  truncated: boolean;
}

/** Post-traitement PUR du brut extrait du DOM (→ testable sans réseau) :
 * tronque le texte à la borne, dédoublonne les liens par href, écarte les
 * `javascript:`/href vides, et plafonne le nombre. */
export function processScraped(
  rawText: string,
  rawLinks: { href: string; label: string }[],
): { text: string; links: { href: string; label: string }[]; truncated: boolean } {
  const truncated = rawText.length > SCRAPE_MAX_TEXT;
  const text = truncated ? rawText.slice(0, SCRAPE_MAX_TEXT) : rawText;
  const seen = new Set<string>();
  const links: { href: string; label: string }[] = [];
  for (const l of rawLinks) {
    if (!l.href || l.href.startsWith("javascript:") || seen.has(l.href)) continue;
    seen.add(l.href);
    links.push(l);
    if (links.length >= SCRAPE_MAX_LINKS) break;
  }
  return { text, links, truncated };
}

/** Charge une page publique et en extrait titre + texte visible + liens.
 * `withImage` ajoute une capture pleine page (layout). Réutilise getBrowser(). */
export async function scrapeExternal(
  url: string,
  withImage = false,
): Promise<ScrapedPage & { image?: Buffer }> {
  const b = await getBrowser();
  const context = await b.newContext({ viewport: CLONE_VIEWPORT, deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "load", timeout: 20_000 });
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(400);

    const { title, rawText, rawLinks } = await page.evaluate(() => {
      // innerText respecte le rendu (ignore <script>/<style>, garde les sauts).
      const t = (document.body?.innerText ?? "").replace(/\n{3,}/g, "\n\n").trim();
      const links = [...document.querySelectorAll("a[href]")].map((a) => ({
        href: (a as HTMLAnchorElement).href,
        label: (a.textContent ?? "").replace(/\s+/g, " ").trim(),
      }));
      return { title: document.title ?? "", rawText: t, rawLinks: links };
    });

    const { text, links, truncated } = processScraped(rawText, rawLinks);

    let image: Buffer | undefined;
    if (withImage) {
      const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      const height = Math.min(pageHeight || CLONE_VIEWPORT.height, CLONE_MAX_HEIGHT);
      image = await page.screenshot({
        type: "jpeg",
        quality: 80,
        clip: { x: 0, y: 0, width: CLONE_VIEWPORT.width, height },
      });
    }
    return { title, text, links, truncated, image };
  } finally {
    await context.close().catch(() => {});
    touchIdleTimer();
  }
}

const scrapeTool = tool(
  "scrape_url",
  "Aspire l'INFORMATION d'une page web publique (titre + texte visible + liens) pour répondre à une demande de l'utilisateur. " +
    "Préfère-le à clone_url dès que tu veux le CONTENU/des données d'une page (pas son design). " +
    "Mets `withImage` à true seulement si la mise en page visuelle compte. Synthétise ensuite la réponse en local ; cite la source.",
  {
    url: z.string().describe("URL http(s) publique de la page à aspirer"),
    query: z
      .string()
      .optional()
      .describe("Ce que l'utilisateur cherche dans la page (focalise ta synthèse)"),
    withImage: z
      .boolean()
      .optional()
      .describe("Joindre aussi une capture pleine page (layout) — false par défaut"),
  },
  async (args) => {
    if (!isCloneableUrl(args.url)) {
      return text("URL invalide — fournis une adresse http(s) publique (pas localhost).", true);
    }
    try {
      const r = await scrapeExternal(args.url, args.withImage === true);
      const header =
        `Source : ${args.url}\nTitre : ${r.title || "(sans titre)"}` +
        (args.query ? `\nDemande : ${args.query}` : "") +
        (r.truncated ? `\n(texte tronqué à ${SCRAPE_MAX_TEXT} caractères)` : "");
      const linksBlock = r.links.length
        ? "\n\nLiens :\n" + r.links.map((l) => `- ${l.label || "(sans libellé)"} → ${l.href}`).join("\n")
        : "";
      const body =
        `${header}\n\n--- TEXTE DE LA PAGE ---\n${r.text}${linksBlock}\n\n` +
        "Réponds à la demande à partir de ces informations, en local. Cite la source ; n'invente rien d'absent du texte.";

      const content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[] = [];
      if (r.image && r.image.length <= MAX_IMAGE_BYTES) {
        content.push({ type: "image", data: r.image.toString("base64"), mimeType: "image/jpeg" });
      }
      content.push({ type: "text", text: body });
      return { content };
    } catch (err) {
      const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
      return text(`Échec de l'aspiration de la page : ${msg}`, true);
    }
  },
);

// ── Sharingan (Chantier #8): 6-layer deep extraction of a live site ──────────
// Layer 1: Pixels (screenshot). Layer 2: Computed CSS (typography + key styles).
// Layer 3: CSS Variables (design tokens). Layer 4: Semantic structure (sections,
// nav, headings, CTAs, ARIA landmarks). Layer 5: Assets (fonts). Layer 6: Color
// palette deduced from computed CSS (faster and more design-accurate than
// pixel-level k-means). Plus bonus: network font interception, pseudo-elements.

export interface SharinganResult {
  url: string;
  screenshot: Buffer;
  screenshotHeight: number;
  palette: string[];
  cssVars: Record<string, string>;
  typography: { families: string[]; sizes: string[]; weights: string[] };
  structure: {
    title: string;
    sections: string[];
    navItems: string[];
    headings: { level: number; text: string }[];
    ctaTexts: string[];
    landmarks: { role: string; label: string; heading: string }[];
  };
  fonts: string[];
  pseudoElements: { selector: string; pseudo: string; content: string; color: string; background: string }[];
}

/** Formats a SharinganResult into an agent-friendly Markdown analysis text. */
function formatSharinganAnalysis(r: SharinganResult): string {
  const lines: string[] = [
    `# Sharingan Analysis — ${r.url}`,
    `Screenshot : 1280×${r.screenshotHeight}px`,
    "",
    "## Palette CSS (couleurs dominantes)",
    r.palette.length ? r.palette.join(", ") : "(aucune couleur de design détectée)",
    "",
  ];

  const usefulVars = Object.entries(r.cssVars).filter(([k]) =>
    /color|bg|background|primary|secondary|accent|text|border|font|shadow|radius|spacing|size|gap|weight/i.test(k),
  ).slice(0, 30);
  if (usefulVars.length > 0) {
    lines.push("## Variables CSS (design tokens)");
    lines.push(...usefulVars.map(([k, v]) => `  ${k}: ${v}`));
    lines.push("");
  }

  lines.push(
    "## Typographie",
    `Familles : ${r.typography.families.join(", ") || "(non détectées)"}`,
    `Tailles  : ${r.typography.sizes.slice(0, 5).join(", ") || "(non détectées)"}`,
    `Graisses : ${r.typography.weights.join(", ") || "(non détectées)"}`,
    "",
    "## Fonts détectées",
    r.fonts.length ? r.fonts.join(", ") : "(système uniquement)",
    "",
    "## Structure sémantique",
    `Titre page : ${r.structure.title || "(aucun)"}`,
    `Nav items  : ${r.structure.navItems.join(" | ") || "(aucun)"}`,
    `Sections   : ${r.structure.sections.join(", ") || "(non détectées)"}`,
    `CTAs       : ${r.structure.ctaTexts.join(" | ") || "(aucun)"}`,
    "",
    "## Headings",
    ...r.structure.headings.map((h) => `  H${h.level}: ${h.text}`),
    "",
    "## Landmarks ARIA",
    ...r.structure.landmarks.map((l) => `  [${l.role}] ${l.label || l.heading || ""}`),
  );

  if (r.pseudoElements.length > 0) {
    lines.push("", "## Pseudo-éléments détectés");
    lines.push(...r.pseudoElements.slice(0, 8).map((p) => `  ${p.selector}${p.pseudo} → content: ${p.content} | color: ${p.color}`));
  }

  lines.push(
    "",
    "## Instructions de génération",
    "- Utilise TOUTES les couleurs de palette et CSS variables dans le code généré.",
    "- Injecte les variables comme propriétés :root dans index.css ou dans le composant.",
    "- Reproduis la structure des sections dans l'ordre des headings détectés.",
    "- Importe les fonts via Google Fonts si absentes du système.",
    "- Objectif : comparaison côte à côte avec l'original < 20 % d'écart visuel.",
  );

  return lines.join("\n");
}

const SHARINGAN_VIEWPORT = { width: 1280, height: 900 };

/** Runs the 6-layer Sharingan extraction on a public URL. All layers are
 *  collected in a single Playwright page load for efficiency. */
export async function sharinganAnalyze(url: string): Promise<SharinganResult> {
  const b = await getBrowser();
  const networkFontUrls: string[] = [];

  const ctx = await b.newContext({ viewport: SHARINGAN_VIEWPORT, deviceScaleFactor: 1 });
  try {
    const page = await ctx.newPage();

    // Layer 5 — network font interception (before navigating)
    page.on("response", (response) => {
      const u = response.url();
      if (/\.(woff2?|ttf|otf|eot)(\?|$)/i.test(u) || u.includes("fonts.googleapis") || u.includes("fonts.gstatic")) {
        networkFontUrls.push(u);
      }
    });

    await page.goto(url, { waitUntil: "load", timeout: 25_000 });
    await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => {});
    await page.waitForTimeout(800); // settle fonts and lazy images

    // Layers 2, 3, 4, 5 — single evaluate call to avoid multiple round-trips.
    const domData = await page.evaluate(() => {
      // Layer 3: CSS custom properties from :root
      const rootCs = window.getComputedStyle(document.documentElement);
      const cssVars: Record<string, string> = {};
      for (const prop of rootCs) {
        if (prop.startsWith("--")) {
          const v = rootCs.getPropertyValue(prop).trim();
          if (v) cssVars[prop] = v;
        }
      }

      // Layer 2: computed styles from key selectors
      const rawColors: string[] = [];
      const fontFamilies: string[] = [];
      const fontSizes: string[] = [];
      const fontWeights: string[] = [];
      const KEY_SEL = "h1,h2,h3,p,a,button,nav,header,footer,section,main,article,aside,[class*='hero'],[class*='card'],[class*='btn'],[class*='primary'],[class*='accent'],[class*='banner'],[class*='container']";
      document.querySelectorAll<HTMLElement>(KEY_SEL).forEach((el) => {
        const cs = window.getComputedStyle(el);
        rawColors.push(cs.color, cs.backgroundColor, cs.borderColor);
        const ff = cs.fontFamily.split(",")[0].replace(/['"]/g, "").trim();
        if (ff && !fontFamilies.includes(ff)) fontFamilies.push(ff);
        if (cs.fontSize && !fontSizes.includes(cs.fontSize)) fontSizes.push(cs.fontSize);
        if (cs.fontWeight && !fontWeights.includes(cs.fontWeight)) fontWeights.push(cs.fontWeight);
      });

      // Sweep all elements for colors (capped to 300 for performance)
      const allEls = [...document.querySelectorAll<HTMLElement>("*")].slice(0, 300);
      for (const el of allEls) {
        const cs = window.getComputedStyle(el);
        rawColors.push(cs.backgroundColor, cs.color);
      }

      // Layer 5: @font-face families from stylesheets
      const cssFontFamilies: string[] = [];
      for (const sheet of [...document.styleSheets]) {
        try {
          for (const rule of [...sheet.cssRules]) {
            if (rule instanceof CSSFontFaceRule) {
              const fam = rule.style.getPropertyValue("font-family").replace(/['"]/g, "").trim();
              if (fam && !cssFontFamilies.includes(fam)) cssFontFamilies.push(fam);
            }
          }
        } catch { /* cross-origin sheet — inaccessible */ }
      }

      // Layer 4: semantic structure
      const title = document.title || "";
      const sections: string[] = [...document.querySelectorAll("section,[id*='section'],[class*='section']")]
        .map((el) => el.querySelector("h1,h2,h3")?.textContent?.trim().slice(0, 60) || (el as HTMLElement).id || "")
        .filter(Boolean).slice(0, 8);

      const navItems: string[] = [...document.querySelectorAll("nav a,header a,[class*='nav'] a")]
        .map((a) => a.textContent?.trim()).filter(Boolean).slice(0, 10) as string[];

      const headings = [...document.querySelectorAll("h1,h2,h3,h4")]
        .map((h) => ({ level: parseInt(h.tagName[1]), text: h.textContent?.trim().slice(0, 80) || "" }))
        .filter((h) => h.text).slice(0, 14);

      const ctaTexts: string[] = [...document.querySelectorAll("button,a[class*='btn'],[class*='cta'],[class*='button']")]
        .map((el) => el.textContent?.trim()).filter(Boolean).slice(0, 8) as string[];

      const landmarks = [...document.querySelectorAll("[role],main,nav,header,footer,aside,article")]
        .map((el) => ({
          role: el.getAttribute("role") || el.tagName.toLowerCase(),
          label: el.getAttribute("aria-label") || "",
          heading: el.querySelector("h1,h2,h3")?.textContent?.trim().slice(0, 60) || "",
        })).slice(0, 10);

      // Bonus: pseudo-elements (sample from focused elements)
      const pseudoElements: { selector: string; pseudo: string; content: string; color: string; background: string }[] = [];
      [...document.querySelectorAll<HTMLElement>("[class*='icon'],[class*='badge'],[class*='tag'],li,a,button")].slice(0, 60).forEach((el) => {
        for (const pseudo of ["::before", "::after"]) {
          const cs = window.getComputedStyle(el, pseudo);
          const content = cs.content;
          if (content && content !== "none" && content !== '""' && content !== "''") {
            const sel = el.className ? `.${el.className.split(" ")[0]}` : el.tagName.toLowerCase();
            pseudoElements.push({ selector: sel, pseudo, content, color: cs.color, background: cs.backgroundColor });
          }
        }
      });

      return { cssVars, rawColors, fontFamilies, fontSizes, fontWeights, cssFontFamilies, title, sections, navItems, headings, ctaTexts, landmarks, pseudoElements: pseudoElements.slice(0, 12) };
    });

    // Layer 1: screenshot
    const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    const height = Math.min(pageHeight || SHARINGAN_VIEWPORT.height, CLONE_MAX_HEIGHT);
    const screenshot = await page.screenshot({
      type: "jpeg", quality: 82,
      clip: { x: 0, y: 0, width: SHARINGAN_VIEWPORT.width, height },
    });

    // Layer 6: deduplicated color palette from CSS
    const palette = dedupeColors(domData.rawColors);

    // Merge CSS @font-face names + network-intercepted Google Fonts names
    const gFontNames = networkFontUrls
      .map((u) => { const m = u.match(/family=([^&:]+)/); return m ? decodeURIComponent(m[1]).replace(/\+/g, " ") : null; })
      .filter((n): n is string => Boolean(n));
    const allFontSources = [...domData.fontFamilies, ...domData.cssFontFamilies, ...gFontNames];
    const fonts = [...new Set(allFontSources)].filter(Boolean).slice(0, 6);

    return {
      url,
      screenshot,
      screenshotHeight: height,
      palette,
      cssVars: domData.cssVars,
      typography: {
        families: domData.fontFamilies.slice(0, 5),
        sizes: domData.fontSizes.slice(0, 6),
        weights: domData.fontWeights.slice(0, 4),
      },
      structure: {
        title: domData.title,
        sections: domData.sections,
        navItems: domData.navItems,
        headings: domData.headings,
        ctaTexts: domData.ctaTexts,
        landmarks: domData.landmarks,
      },
      fonts,
      pseudoElements: domData.pseudoElements,
    };
  } finally {
    await ctx.close().catch(() => {});
    touchIdleTimer();
  }
}

const sharinganTool = tool(
  "sharingan_url",
  "6-layer deep extraction of a live website: pixels (screenshot) + computed CSS + CSS variables (design tokens) + " +
    "semantic structure (sections, nav, headings, CTAs, ARIA) + font detection (CSS @font-face + Google Fonts interception) + " +
    "color palette from computed styles. Returns BOTH a screenshot AND a rich structured analysis. " +
    "Call when the user wants maximum-fidelity cloning (says 'pixel-perfect', 'Sharingan', 'exact copy', 'deep clone', or after a first clone that looks off). " +
    "Use ALL returned data: inject CSS variables as :root props, match palette exactly, use detected fonts, reproduce semantic structure.",
  { url: z.string().describe("Public http(s) URL of the website to analyse") },
  async (args) => {
    if (!isCloneableUrl(args.url)) {
      return text("URL invalide pour le Sharingan — fournis une adresse http(s) publique (pas localhost).", true);
    }
    try {
      const result = await sharinganAnalyze(args.url);
      const analysis = formatSharinganAnalysis(result);
      const content: ({ type: "image"; data: string; mimeType: string } | { type: "text"; text: string })[] = [];
      if (result.screenshot.length <= MAX_IMAGE_BYTES) {
        content.push({ type: "image" as const, data: result.screenshot.toString("base64"), mimeType: "image/jpeg" });
      }
      content.push({ type: "text" as const, text: analysis });
      return { content };
    } catch (err) {
      const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
      return text(`Échec de l'analyse Sharingan : ${msg}`, true);
    }
  },
);

// ── Sharingan-on-image (Idea #51): palette + ambiance from an attached image ──
// Same design extraction philosophy as sharingan_url, but applied to a local
// image file (PNG/JPEG/WebP/GIF) deposited by uploads.ts in .assets/.
// Uses Playwright's canvas API so no extra npm dependency is needed.
// All quantification/ambiance helpers are PURE (exported) for unit tests.

/** Supported image MIME types for sharingan_image. */
const IMAGE_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/** RGBA pixel data from sampling an image via Playwright canvas (64×64 grid). */
export interface RgbaPixel {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Quantizes a list of RGBA pixels using 5-bit buckets per channel.
 *  Returns a map of bucket-key → frequency, ignoring fully-transparent pixels.
 *  Pure → unit-testable. */
export function quantizePixels(pixels: RgbaPixel[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const { r, g, b, a } of pixels) {
    if (a < 10) continue; // ignore near-transparent
    // 5-bit bucket: shift right by 3 → 0-31 range per channel
    const key = `${r >> 3},${g >> 3},${b >> 3}`;
    freq.set(key, (freq.get(key) ?? 0) + 1);
  }
  return freq;
}

/** Converts a quantization bucket key back to a #rrggbb hex string.
 *  Mid-point of the bucket is used (shift left 3, add 4 for centre).
 *  Pure → unit-testable. */
export function bucketKeyToHex(key: string): string {
  const [rb, gb, bb] = key.split(",").map(Number);
  const r = Math.min(255, (rb << 3) + 4);
  const g = Math.min(255, (gb << 3) + 4);
  const b = Math.min(255, (bb << 3) + 4);
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

/** Picks the top-N most frequent non-black/non-white buckets, returns hex strings.
 *  Pure → unit-testable. */
export function topColorsFromBuckets(freq: Map<string, number>, topN = 8): string[] {
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => bucketKeyToHex(key))
    .filter((hex) => !_isNearBlack(hex) && !_isNearWhite(hex))
    .slice(0, topN);
}

/** Describes the luminosity of a pixel list: "clair" if avg luminance > 0.55,
 *  "sombre" otherwise. Pure → unit-testable. */
export function luminosityLabel(pixels: RgbaPixel[]): "clair" | "sombre" {
  if (pixels.length === 0) return "clair";
  let sum = 0;
  for (const { r, g, b } of pixels) {
    // Relative luminance (perceptual, 0-1)
    sum += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }
  return sum / pixels.length > 0.55 ? "clair" : "sombre";
}

/** Describes the saturation of a pixel list: "vif" if avg saturation > 0.25,
 *  "sourd" otherwise. Pure → unit-testable. */
export function saturationLabel(pixels: RgbaPixel[]): "vif" | "sourd" {
  if (pixels.length === 0) return "sourd";
  let sum = 0;
  for (const { r, g, b } of pixels) {
    const max = Math.max(r, g, b) / 255;
    const min = Math.min(r, g, b) / 255;
    sum += max === 0 ? 0 : (max - min) / max;
  }
  return sum / pixels.length > 0.25 ? "vif" : "sourd";
}

/** Describes the colour temperature of a pixel list: "chaud" if avg R ≥ avg B,
 *  "froid" otherwise. Returns "chaud" for an empty list (neutral default).
 *  Pure → unit-testable. */
export function temperatureLabel(pixels: RgbaPixel[]): "chaud" | "froid" {
  if (pixels.length === 0) return "chaud";
  let sumR = 0, sumB = 0;
  for (const { r, b } of pixels) { sumR += r; sumB += b; }
  return sumR / pixels.length >= sumB / pixels.length ? "chaud" : "froid";
}

/** Combines the three perceptual labels into a short descriptor string.
 *  Pure → unit-testable. */
export function ambianceDescriptor(pixels: RgbaPixel[]): string {
  return `${luminosityLabel(pixels)} · ${saturationLabel(pixels)} · ${temperatureLabel(pixels)}`;
}

/** Samples an image file via Playwright canvas (64×64 grid) and returns RGBA pixels.
 *  Uses getBrowser() — NOT pure (browser required), not exported for tests. */
async function sampleImagePixels(dataUrl: string): Promise<RgbaPixel[]> {
  const b = await getBrowser();
  const context = await b.newContext({ viewport: { width: 200, height: 200 } });
  try {
    const page = await context.newPage();
    // Load image into a canvas, sample 64×64 pixels
    await page.setContent(`<!DOCTYPE html><html><body style="margin:0;background:#fff">
      <canvas id="c" width="64" height="64"></canvas>
      <img id="img" style="display:none" src="${dataUrl}">
    </body></html>`);
    await page.waitForSelector("#img", { state: "attached" });

    const pixels = await page.evaluate(() => {
      const img = document.getElementById("img") as HTMLImageElement;
      const canvas = document.getElementById("c") as HTMLCanvasElement;
      const ctx = canvas.getContext("2d")!;
      // Wait for image to be complete (synchronous check — already loaded)
      ctx.drawImage(img, 0, 0, 64, 64);
      const data = ctx.getImageData(0, 0, 64, 64).data;
      const result: { r: number; g: number; b: number; a: number }[] = [];
      for (let i = 0; i < data.length; i += 4) {
        result.push({ r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] });
      }
      return result;
    });
    return pixels;
  } finally {
    await context.close().catch(() => {});
    touchIdleTimer();
  }
}

/** File path → dominant palette + perceptual ambiance — the IMAGE mouth of the
 *  Sharingan, factored out of sharingan_image so the Moteur de Goût (#149) can reuse
 *  it directly (no MCP tool). Throws on unsupported format / missing file. */
export async function analyzeImageFile(absPath: string): Promise<{ palette: string[]; ambiance: string; samples: number }> {
  const ext = path.extname(absPath).toLowerCase();
  const mime = IMAGE_MIME[ext];
  if (!mime) throw new Error(`Format d'image non supporté : ${ext || "(sans extension)"}`);
  if (!fs.existsSync(absPath)) throw new Error(`Fichier introuvable : ${absPath}`);
  const imgBuf = fs.readFileSync(absPath);
  const dataUrl = `data:${mime};base64,${imgBuf.toString("base64")}`;
  const pixels = await sampleImagePixels(dataUrl);
  const opaque = pixels.filter((p) => p.a >= 10);
  const palette = dedupeColors(topColorsFromBuckets(quantizePixels(pixels)));
  return { palette, ambiance: ambianceDescriptor(opaque), samples: opaque.length };
}

const sharinganImageTool = tool(
  "sharingan_image",
  "Extracts a structured color palette + perceptual ambiance (luminosity, saturation, temperature) from an attached image file. " +
    "Use when the user provides a reference image (screenshot, photo, mockup) and wants the design anchored on its REAL colors " +
    "rather than a visual description only. Complements native vision reading — gives exact hex values and a compact ambiance descriptor. " +
    "Accepts PNG, JPEG, WebP, GIF from the project's .assets/ folder (deposited by the upload button).",
  { path: z.string().describe("Absolute or project-relative path to the image file (e.g. .assets/ref.png)") },
  async (args) => {
    // Resolve and validate path
    const ext = path.extname(args.path).toLowerCase();
    const mime = IMAGE_MIME[ext];
    if (!mime) {
      return text(`Format non supporté (${ext || "sans extension"}) — utilise PNG, JPEG, WebP ou GIF.`, true);
    }
    const resolved = path.isAbsolute(args.path)
      ? args.path
      : projectDir
        ? path.join(projectDir, args.path)
        : args.path;
    if (!fs.existsSync(resolved)) {
      return text(`Fichier introuvable : ${resolved}`, true);
    }
    try {
      const imgBuf = fs.readFileSync(resolved);
      const dataUrl = `data:${mime};base64,${imgBuf.toString("base64")}`;

      const pixels = await sampleImagePixels(dataUrl);
      const freq = quantizePixels(pixels);
      const palette = topColorsFromBuckets(freq);
      // Apply dedupeColors as a second-pass normalisation (normalises hex casing,
      // removes any near-black/white that bucketKeyToHex mid-point landed on).
      const finalPalette = dedupeColors(palette);
      const ambiance = ambianceDescriptor(pixels.filter((p) => p.a >= 10));

      const lines = [
        `# Sharingan image — ${path.basename(resolved)}`,
        "",
        "## Palette dominante",
        finalPalette.length ? finalPalette.join(", ") : "(aucune couleur de design détectée — image trop sombre/claire ?)",
        "",
        "## Ambiance perceptuelle",
        ambiance,
        "",
        "## Instructions de génération",
        "- Utilise ces couleurs hex comme base de la palette CSS (:root custom properties ou Tailwind config).",
        "- Ajuste les teintes légèrement si le contraste l'exige, mais reste fidèle à l'ambiance capturée.",
        "- L'ambiance perceptuelle oriente les décisions de fond, typographie et espacement.",
      ];

      const analysisText = lines.join("\n");
      const content: ({ type: "image"; data: string; mimeType: string } | { type: "text"; text: string })[] = [];
      // Embed the original image if within size limits (helps the model cross-reference)
      if (imgBuf.length <= MAX_IMAGE_BYTES) {
        content.push({ type: "image" as const, data: imgBuf.toString("base64"), mimeType: mime });
      }
      content.push({ type: "text" as const, text: analysisText });
      return { content };
    } catch (err) {
      const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
      return text(`Échec de l'analyse Sharingan image : ${msg}`, true);
    }
  },
);

export const visionServer = createSdkMcpServer({
  name: "vision",
  version: "1.0.0",
  // Core mechanism: always in the prompt, never deferred behind ToolSearch
  // (saves one discovery round-trip per visual turn).
  alwaysLoad: true,
  tools: [snapshotTool, cloneTool, scrapeTool, sharinganTool, sharinganImageTool],
});
