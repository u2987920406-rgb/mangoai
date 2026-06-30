// Mango Quest — canvas rendering (pure drawing functions, no game state).
// Terrain/characters use Kenney Tiny Town + Tiny Dungeon sprite atlases (CC0,
// see sprites.js). Water, rocks, shadows and ambient lighting are drawn
// procedurally on top to add depth. Every draw falls back to a flat color if an
// atlas hasn't loaded yet — the loop redraws each frame, so art appears as soon
// as the images are ready.
import { TILE, COLORS, MAP_COLS, MAP_ROWS, TILE_SIZE, DIR, ZONE, xpToNextLevel } from "./constants.js";
import { TOWN, DUNGEON, drawSprite, atlasReady, variant, tileSpec, entitySprite, IDX } from "./sprites.js";
import { SPELL_INFO } from "./systems/spells.js";
import { activeQuests, QUEST_INFO } from "./systems/quests.js";

// Advanced once per rendered frame (in drawWorld); drives water shimmer, item
// bobbing and torch flicker. Module-scoped so all draw helpers can read it.
let frame = 0;

// Fallback tile colors (used only until the atlas finishes loading).
const TILE_COLORS = {
  [TILE.GRASS]: COLORS.grass,
  [TILE.TREE]: COLORS.grass,
  [TILE.PATH]: COLORS.path,
  [TILE.WALL]: COLORS.wall,
  [TILE.ROCK]: COLORS.floor,
  [TILE.FLOOR]: COLORS.floor,
  [TILE.DOOR_LOCKED]: COLORS.floor,
  [TILE.DOOR_OPEN]: COLORS.floor,
  [TILE.WATER]: COLORS.water,
  [TILE.SAND]: COLORS.sand,
};

function ellipse(ctx, cx, cy, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

// Configure a canvas for crisp pixel rendering at devicePixelRatio.
export function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const logicalW = MAP_COLS * TILE_SIZE;
  const logicalH = MAP_ROWS * TILE_SIZE;
  canvas.width = Math.round(logicalW * dpr);
  canvas.height = Math.round(logicalH * dpr);
  canvas.style.width = "100%";
  canvas.style.maxWidth = logicalW + "px";
  canvas.style.height = "auto";
  canvas.style.aspectRatio = `${logicalW} / ${logicalH}`;
  canvas.style.imageRendering = "pixelated";
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

// Shimmering water tile (no atlas sprite exists for water in these packs).
function drawWater(ctx, x, y) {
  const T = TILE_SIZE;
  ctx.fillStyle = "#2a5a86";
  ctx.fillRect(x, y, T, T);
  ctx.fillStyle = "#3a6e9e";
  ctx.fillRect(x, y + 3, T, T - 6);
  const t = frame * 0.06;
  ctx.fillStyle = "rgba(190,224,255,0.55)";
  const o1 = Math.round(Math.sin(t + (x + y) * 0.05) * 3);
  ctx.fillRect(x + 5 + o1, y + 9, 9, 2);
  const o2 = Math.round(Math.cos(t * 0.9 + x * 0.07) * 3);
  ctx.fillRect(x + 15 + o2, y + 20, 8, 2);
}

// Grey boulder drawn over a floor tile (cavern obstacle).
function drawRock(ctx, x, y) {
  const T = TILE_SIZE;
  const cx = x + T / 2;
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ellipse(ctx, cx, y + T - 5, 11, 4);
  ctx.fillStyle = "#6b6258";
  ellipse(ctx, cx, y + T / 2 + 1, 11, 9);
  ctx.fillStyle = "#857c70";
  ellipse(ctx, cx - 2, y + T / 2 - 2, 6, 4);
  ctx.fillStyle = "#4a433a";
  ctx.fillRect(cx + 1, y + T / 2, 5, 2);
}

function drawTileBase(ctx, spec, r, c, x, y) {
  if (spec.water) { drawWater(ctx, x, y); return; }
  if (spec.base && drawSprite(ctx, spec.atlas, variant(spec.base, r, c), x, y, TILE_SIZE, TILE_SIZE)) return;
  // fallback flat color
  const t = spec._tile;
  ctx.fillStyle = TILE_COLORS[t] != null ? TILE_COLORS[t] : COLORS.grass;
  ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
}

// Draw the tile grid of the current zone with sprites + procedural depth.
export function drawWorld(ctx, world, zoneName) {
  frame++;
  const zone = world.zones[zoneName];
  if (!zone) return;
  const T = TILE_SIZE;
  for (let r = 0; r < zone.rows; r++) {
    for (let c = 0; c < zone.cols; c++) {
      const t = zone.tiles[r][c];
      const x = c * T;
      const y = r * T;
      const spec = tileSpec(zoneName, t);
      spec._tile = t;
      drawTileBase(ctx, spec, r, c, x, y);
      if (spec.rock) drawRock(ctx, x, y);
      if (spec.obj != null) {
        // soft shadow under the object (tree/door) for grounding
        ctx.fillStyle = "rgba(0,0,0,0.22)";
        ellipse(ctx, x + T / 2, y + T - 4, T * 0.34, 3);
        // lift trees a few px so the canopy overhangs upward (top-down depth)
        const lift = t === TILE.TREE ? 3 : 0;
        if (!drawSprite(ctx, spec.atlas, spec.obj, x, y - lift, T, T)) {
          ctx.fillStyle = COLORS.tree;
          ctx.fillRect(x + 6, y + 4, T - 12, T - 8);
        }
      }
    }
  }
}

// Item pickups: bobbing sprite with a warm glow.
export function drawPickups(ctx, pickups, zoneName) {
  const T = TILE_SIZE;
  for (const p of pickups) {
    if (p.zone !== zoneName) continue;
    const cx = (p.x + 0.5) * T;
    const cy = (p.y + 0.5) * T;
    const bob = Math.sin(frame * 0.1 + (p.x + p.y)) * 2;
    ctx.fillStyle = "rgba(255,225,120,0.22)";
    ellipse(ctx, cx, cy + 8, 9, 4);
    const size = 20;
    const dx = cx - size / 2;
    const dy = cy - size / 2 + bob;
    let atlas = DUNGEON;
    let idx = IDX.dungeon.potion;
    if (p.item === "key") { atlas = TOWN; idx = IDX.town.key; }
    else if (p.item === "bomb") { atlas = TOWN; idx = IDX.town.bomb; }
    if (!drawSprite(ctx, atlas, idx, dx, dy, size, size)) {
      ctx.fillStyle = p.item === "key" ? "#f0c020" : p.item === "bomb" ? "#2a2a2a" : COLORS.hpFill;
      ctx.fillRect(cx - 6, cy - 6, 12, 12);
    }
  }
}

// Draw an entity as a Kenney character sprite, mirrored when facing left, with a
// drop shadow. Falls back to the old colored square until the atlas loads.
export function drawEntity(ctx, entity) {
  const T = TILE_SIZE;
  const cx = entity.x * T;
  const cy = entity.y * T;
  const size = entity.kind === "boss" ? T * 1.5 : T * 1.15;
  const dx = cx - size / 2;
  const dy = cy - size / 2 - 2;
  // drop shadow grounds the sprite
  ctx.fillStyle = "rgba(0,0,0,0.30)";
  ellipse(ctx, cx, cy + size * 0.34, size * 0.34, size * 0.15);
  // boss aura
  if (entity.kind === "boss") {
    ctx.fillStyle = "rgba(200,40,30,0.18)";
    ellipse(ctx, cx, cy, size * 0.6, size * 0.6);
  }
  const idx = entitySprite(entity);
  const flip = entity.dir === DIR.LEFT;
  let drawn = false;
  ctx.save();
  if (flip) { ctx.translate(cx, 0); ctx.scale(-1, 1); ctx.translate(-cx, 0); }
  drawn = drawSprite(ctx, DUNGEON, idx, dx, dy, size, size);
  ctx.restore();
  if (!drawn) {
    // fallback: colored body + facing eye (original look)
    let body = COLORS.player, dark = COLORS.playerDark;
    if (entity.kind === "enemy") {
      if (entity.type === "chase") { body = COLORS.enemyChase; dark = COLORS.enemyChaseDark; }
      else { body = COLORS.enemyPatrol; dark = COLORS.enemyPatrolDark; }
    } else if (entity.kind === "boss") { body = COLORS.boss; dark = COLORS.bossDark; }
    const s = entity.kind === "boss" ? T * 0.85 : T * 0.7;
    const ox = cx - s / 2, oy = cy - s / 2;
    ctx.fillStyle = dark; ctx.fillRect(ox, oy, s, s);
    ctx.fillStyle = body; ctx.fillRect(ox + 2, oy + 2, s - 4, s - 4);
  }
}

// Ambient lighting overlay: a vignette centered on the player, plus a warm,
// flickering torch glow in the cavern. Call after entities, before the HUD.
export function drawLighting(ctx, player, zoneName) {
  const T = TILE_SIZE;
  const W = MAP_COLS * T;
  const H = MAP_ROWS * T;
  const pcx = player.x * T;
  const pcy = player.y * T;
  const cavern = zoneName === ZONE.CAVERN;
  const r1 = cavern ? T * 5.5 : T * 11;
  const grd = ctx.createRadialGradient(pcx, pcy, T * 1.5, pcx, pcy, r1);
  grd.addColorStop(0, "rgba(0,0,0,0)");
  grd.addColorStop(1, cavern ? "rgba(6,3,0,0.80)" : "rgba(8,16,6,0.28)");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);
  if (cavern) {
    ctx.globalCompositeOperation = "lighter";
    const flick = 0.14 + 0.04 * Math.sin(frame * 0.2);
    const g2 = ctx.createRadialGradient(pcx, pcy, 0, pcx, pcy, T * 3);
    g2.addColorStop(0, `rgba(255,178,90,${flick})`);
    g2.addColorStop(1, "rgba(255,178,90,0)");
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
  }
}

// Draw the HUD overlay: HP bar, level/XP, item icons + counts, and a minimap.
export function drawHud(ctx, player, inventory, world, zoneName) {
  const W = MAP_COLS * TILE_SIZE;
  ctx.fillStyle = "rgba(26,20,16,0.85)";
  ctx.fillRect(0, 0, W, 30);
  ctx.fillStyle = COLORS.hudText;
  ctx.font = "bold 12px monospace";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  // HP bar
  const hpX = 8, hpY = 8, hpW = 90, hpH = 14;
  ctx.fillStyle = COLORS.hpBack;
  ctx.fillRect(hpX, hpY, hpW, hpH);
  ctx.fillStyle = COLORS.hpFill;
  ctx.fillRect(hpX, hpY, Math.round(hpW * Math.max(0, player.hp / player.maxHp)), hpH);
  ctx.fillStyle = COLORS.hudText;
  ctx.fillText(`HP ${player.hp}/${player.maxHp}`, hpX + 4, hpY + hpH / 2 + 1);
  // Level + XP bar
  ctx.fillText(`Lv ${player.level}`, 110, 16);
  const xpX = 150, xpW = 70, xpH = 8, xpY = 11;
  ctx.fillStyle = COLORS.xpBack;
  ctx.fillRect(xpX, xpY, xpW, xpH);
  ctx.fillStyle = COLORS.xpFill;
  const xpNeed = xpToNextLevel(player.level) || player.xpToNext || 1;
  ctx.fillRect(xpX, xpY, Math.round(xpW * Math.max(0, Math.min(1, player.xp / xpNeed))), xpH);
  // Item icons + counts (potion / bomb / key)
  drawHudItem(ctx, 232, IDX.dungeon.potion, DUNGEON, inventory.potion, "#e84030");
  drawHudItem(ctx, 270, IDX.town.bomb, TOWN, inventory.bomb, "#2a2a2a");
  drawHudItem(ctx, 308, IDX.town.key, TOWN, inventory.key, "#f0c020");
  drawMinimap(ctx, world, zoneName, player);
}

function drawHudItem(ctx, x, idx, atlas, count, fallbackColor) {
  const s = 16;
  if (!drawSprite(ctx, atlas, idx, x, 7, s, s)) {
    ctx.fillStyle = fallbackColor;
    ctx.fillRect(x + 3, 10, 10, 10);
  }
  ctx.fillStyle = COLORS.hudText;
  ctx.textBaseline = "middle";
  ctx.fillText(String(count ?? 0), x + s + 1, 16);
}

function drawMinimap(ctx, world, zoneName, player) {
  const cell = 3;
  const zone = world.zones[zoneName];
  if (!zone) return;
  const mw = zone.cols * cell;
  const mh = zone.rows * cell;
  const W = MAP_COLS * TILE_SIZE;
  const H = MAP_ROWS * TILE_SIZE;
  const mx = W - mw - 6;
  const my = H - mh - 6;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(mx - 2, my - 2, mw + 4, mh + 4);
  for (let r = 0; r < zone.rows; r++) {
    for (let c = 0; c < zone.cols; c++) {
      const t = zone.tiles[r][c];
      let col = "#222";
      if (t === TILE.GRASS) col = COLORS.grassDark;
      else if (t === TILE.PATH) col = COLORS.pathDark;
      else if (t === TILE.FLOOR) col = COLORS.floorDark;
      else if (t === TILE.WATER) col = COLORS.waterDark;
      else if (t === TILE.DOOR_OPEN) col = COLORS.doorOpen;
      else if (t === TILE.DOOR_LOCKED) col = COLORS.doorLocked;
      ctx.fillStyle = col;
      ctx.fillRect(mx + c * cell, my + r * cell, cell, cell);
    }
  }
  ctx.fillStyle = COLORS.player;
  ctx.fillRect(mx + player.x * cell - 1, my + player.y * cell - 1, 3, 3);
}

// ─── Sorts / quêtes / sauvegarde — surcouches HUD ────────────────────────────

const SPELL_SLOTS = [
  { id: "heal", key: "2", color: "#3ad07a" },
  { id: "fireball", key: "3", color: "#ff7a2a" },
  { id: "shield", key: "4", color: "#4aa3ff" },
];

// Hotbar de sorts (bas-gauche) : barre de mana + 3 emplacements avec touche,
// coût en mana, et voile de recharge. Grise un sort indisponible.
export function drawSpellBar(ctx, spells) {
  if (!spells) return;
  const H = MAP_ROWS * TILE_SIZE;
  const x0 = 8;
  const slotW = 30, slotH = 30, gap = 6;
  const barY = H - slotH - 8;
  const manaW = SPELL_SLOTS.length * slotW + (SPELL_SLOTS.length - 1) * gap;
  const manaY = barY - 12;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(x0 - 3, manaY - 3, manaW + 6, slotH + 21);
  // Barre de mana
  ctx.fillStyle = "#10243a";
  ctx.fillRect(x0, manaY, manaW, 7);
  ctx.fillStyle = "#37b6ff";
  ctx.fillRect(x0, manaY, Math.round(manaW * Math.max(0, Math.min(1, spells.mana / spells.maxMana))), 7);
  ctx.fillStyle = "#bfe6ff";
  ctx.font = "7px monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(`${Math.floor(spells.mana)}/${spells.maxMana}`, x0 + manaW, manaY + 3.5);
  // Emplacements
  ctx.textAlign = "center";
  SPELL_SLOTS.forEach((s, i) => {
    const x = x0 + i * (slotW + gap);
    const y = barY;
    const info = SPELL_INFO[s.id];
    const cd = spells.cooldowns[s.id] || 0;
    const ready = spells.mana >= info.manaCost && cd <= 0;
    ctx.fillStyle = ready ? "rgba(20,20,16,0.92)" : "rgba(20,20,16,0.65)";
    ctx.fillRect(x, y, slotW, slotH);
    ctx.strokeStyle = ready ? s.color : "rgba(120,120,120,0.6)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, slotW - 2, slotH - 2);
    ctx.fillStyle = ready ? s.color : "#888";
    ctx.font = "bold 15px monospace";
    ctx.fillText(s.key, x + slotW / 2, y + slotH / 2 - 2);
    ctx.fillStyle = "#9fdcff";
    ctx.font = "7px monospace";
    ctx.fillText(`${info.manaCost}`, x + slotW / 2, y + slotH - 5);
    if (cd > 0) {
      const frac = Math.min(1, cd / info.cooldown);
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(x, y, slotW, slotH * frac);
    }
  });
  ctx.textAlign = "left";
}

// Anneau de bouclier autour du joueur (quand le sort Bouclier est actif).
export function drawShieldRing(ctx, player) {
  const T = TILE_SIZE;
  const cx = player.x * T, cy = player.y * T;
  const r = T * 0.7 + Math.sin(frame * 0.2) * 1.5;
  ctx.save();
  ctx.strokeStyle = "rgba(150,210,255,0.35)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(90,170,255,0.85)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// Tracker de quêtes actives (haut-gauche, sous le HUD).
export function drawQuestTracker(ctx, quests) {
  if (!quests) return;
  const actives = activeQuests(quests).slice(0, 3);
  if (!actives.length) return;
  const x = 8, y = 36;
  const w = 176, h = 16 + actives.length * 13;
  ctx.fillStyle = "rgba(26,20,16,0.78)";
  ctx.fillRect(x, y, w, h);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#f0c060";
  ctx.font = "bold 9px monospace";
  ctx.fillText("QUÊTES", x + 6, y + 4);
  ctx.font = "10px monospace";
  actives.forEach((q, i) => {
    const info = QUEST_INFO[q.id];
    ctx.fillStyle = "#e8e0d0";
    ctx.fillText(`• ${info.name} ${q.progress}/${info.target}`, x + 6, y + 16 + i * 13);
  });
  ctx.textBaseline = "middle";
}

// Message transitoire centré (sort lancé, quête terminée, partie sauvegardée…).
export function drawToast(ctx, toast) {
  if (!toast) return;
  const W = MAP_COLS * TILE_SIZE;
  const alpha = Math.min(1, toast.ticks / 30);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = "bold 12px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const tw = ctx.measureText(toast.text).width + 24;
  const x = (W - tw) / 2, y = 44;
  ctx.fillStyle = "rgba(20,16,12,0.92)";
  ctx.fillRect(x, y, tw, 24);
  ctx.strokeStyle = "rgba(240,192,96,0.7)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, tw - 1, 23);
  ctx.fillStyle = "#ffe0a0";
  ctx.fillText(toast.text, W / 2, y + 12);
  ctx.restore();
  ctx.textAlign = "left";
}
