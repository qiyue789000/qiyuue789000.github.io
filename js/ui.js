import { SLOTS, SLOT_NAMES, SLOT_ICONS } from './items.js';
import { generateItem, rollRarity } from './items.js';

const SKILL_KEYS = ['B', 'N', 'M'];

export class UI {
    constructor() {
        this.levelUpNotifyEl = document.getElementById('level-up-notify');
        this.gameOverEl = document.getElementById('game-over-screen');
        this.invPanel = document.getElementById('inventory-panel');
        this.shopPanel = document.getElementById('shop-panel');
        this.equipBarEl = document.getElementById('equip-bar');
        this.floorIndicator = document.getElementById('floor-indicator');
        this.hudEl = document.getElementById('hud');
        this.levelUpTimeout = null;
        this.floorIndicatorTimeout = null;
        this._player = null;

        document.addEventListener('keydown', (e) => {
            if (e.code === 'KeyI') this.toggleInventory();
            if (e.code === 'Escape') { this.hideInventory(); this.hideShop(); }
        });
    }

    // ─── HUD ───────────────────────────────────────
    updateHUD(player, dungeon, currentRoom, fps) {
        const xpPct = player.level >= 100 ? 100 : (player.xp / player.xpToNext * 100);
        const hpPct = (player.hp / player.maxHp * 100);
        const mpPct = (player.mp / player.maxMp * 100);

        // Active skills with mana costs
        let skillsHtml = '';
        for (let i = 0; i < Math.min(player.skills.length, 3); i++) {
            const s = player.skills[i];
            const cd = player.skillCooldowns[s.name] || 0;
            const key = SKILL_KEYS[i];
            const cdStr = cd > 0 ? ` [${cd.toFixed(1)}s]` : '';
            const costStr = ` ${s.cost}魔`;
            const enoughMp = player.mp >= Math.ceil(s.cost * player.skillCostMultiplier);
            const color = cd > 0 ? '#555' : (enoughMp ? '#f1c40f' : '#e74c3c');
            skillsHtml += `<span style="color:${color}">[${key}]${s.icon}${s.name}${costStr}${cdStr}</span> `;
        }
        if (player.skills.length > 3) {
            skillsHtml += `<span style="color:#555">+${player.skills.length - 3}</span>`;
        }

        // Passive skills summary
        let passivesHtml = '';
        if (player.passives.length > 0) {
            const shown = player.passives.slice(-3);
            passivesHtml = shown.map(p => `<span style="color:#2ecc71;font-size:8px;">${p.icon}${p.name}</span>`).join(' ');
            if (player.passives.length > 3) passivesHtml += ` <span style="color:#555">+${player.passives.length-3}</span>`;
        }

        this.hudEl.innerHTML = `
            <div style="font-size:18px;font-weight:bold;">深渊探索者 Lv.${player.level}</div>
            <div style="font-size:12px;color:#888;">地下 ${dungeon.floor} 层</div>
            <div style="margin-top:3px;">
                <div class="hp-bar-bg"><div class="hp-bar-fill" style="width:${hpPct}%"></div></div>
                <span style="font-size:10px;color:#e74c3c;">❤️ ${Math.floor(player.hp)}/${player.maxHp}</span>
            </div>
            <div style="margin-top:1px;">
                <div class="mp-bar-bg"><div class="mp-bar-fill" style="width:${mpPct}%"></div></div>
                <span style="font-size:10px;color:#3498db;">💎 ${Math.floor(player.mp)}/${player.maxMp} (${player.mpRegen.toFixed(1)}/秒)</span>
            </div>
            <div style="margin-top:1px;">
                <div class="xp-bar-bg"><div class="xp-bar-fill" style="width:${xpPct}%"></div></div>
                <span style="font-size:10px;color:#f1c40f;">⭐ ${player.xp}/${player.xpToNext}</span>
            </div>
            <div style="font-size:10px;color:#888;margin-top:3px;">
                ⚔${player.atk} 🛡${player.def} 💨${Math.floor(player.spd)} 💥${Math.floor(player.crit*100)}% 🪙${player.gold}
            </div>
            <div style="font-size:9px;color:#666;margin-top:2px;">
                ${skillsHtml || '暂无技能'}
            </div>
            ${passivesHtml ? `<div style="margin-top:1px;">${passivesHtml}</div>` : ''}
            <div style="font-size:9px;color:#444;margin-top:1px;">
                [WASD]移动 [鼠标左键]攻击 [空格]翻滚 [I]背包 [B/N/M]技能 [E]互动
            </div>
            ${currentRoom && currentRoom.type === 'shop' ? '<div style="font-size:13px;color:#f1c40f;margin-top:3px;animation:pulse 1s infinite;">🏪 按 [E] 打开商店</div>' : ''}
        `;

        this.updateEquipBar(player);
    }

    // ─── Equipment Bar ─────────────────────────────
    updateEquipBar(player) {
        let html = '';
        for (const slot of SLOTS) {
            const item = player.equipment[slot];
            if (item) {
                html += `<div class="eq-slot equipped rarity-${item.rarity.toLowerCase()}" title="${item.name}: ${item.desc}">
                    <div class="eq-icon">${SLOT_ICONS[slot]}</div>
                    <div style="font-size:9px;">${item.name}</div>
                </div>`;
            } else {
                html += `<div class="eq-slot empty" title="${SLOT_NAMES[slot]}">
                    <div class="eq-icon" style="opacity:0.3;">${SLOT_ICONS[slot]}</div>
                    <div style="font-size:9px;color:#555;">${SLOT_NAMES[slot]}</div>
                </div>`;
            }
        }
        this.equipBarEl.innerHTML = html;
    }

    // ─── Level Up / Floor / Game Over ──────────────
    showLevelUp(level) {
        if (level > 100) return;
        this.levelUpNotifyEl.textContent = level === 100 ? '🏆 满级！已达巅峰！🏆' : `⬆ 升级！${level}级 ⬆`;
        this.levelUpNotifyEl.style.opacity = '1';
        if (this.levelUpTimeout) clearTimeout(this.levelUpTimeout);
        this.levelUpTimeout = setTimeout(() => {
            this.levelUpNotifyEl.style.opacity = '0';
        }, 1500);
    }

    showFloorIndicator(floor) {
        this.floorIndicator.textContent = `—— 地下 ${floor} 层 ——`;
        this.floorIndicator.style.opacity = '1';
        if (this.floorIndicatorTimeout) clearTimeout(this.floorIndicatorTimeout);
        this.floorIndicatorTimeout = setTimeout(() => {
            this.floorIndicator.style.opacity = '0';
        }, 2000);
    }

    showGameOver(player, dungeon) {
        this.gameOverEl.innerHTML = `
            <h1>你死了</h1>
            <p>达到等级: ${player.level}</p>
            <p>深入层数: 地下 ${dungeon.floor} 层</p>
            <p>收集金币: ${player.gold}</p>
            <p style="color:#888;">被动技能: ${player.passives.length}个 | 主动技能: ${player.skills.length}个</p>
            <button onclick="location.reload()">重新开始</button>
        `;
        this.gameOverEl.style.display = 'block';
    }

    hideGameOver() {
        this.gameOverEl.style.display = 'none';
    }

    // ─── Inventory ─────────────────────────────────
    toggleInventory() {
        if (this.invPanel.style.display === 'block') {
            this.hideInventory();
        } else {
            this.showInventory();
        }
    }

    showInventory(player) {
        const p = player || this._player;
        this._player = p;
        if (!p) return;

        let html = '<h3>🎒 背包与装备</h3>';

        // Equipment
        html += '<div style="margin-bottom:6px;"><b>已装备:</b></div>';
        for (const slot of SLOTS) {
            const item = p.equipment[slot];
            html += `<div class="inv-slot">
                <span class="label">${SLOT_ICONS[slot]} ${SLOT_NAMES[slot]}</span>
                <span class="${item ? 'rarity-' + item.rarity.toLowerCase() : ''} value">
                    ${item ? `${item.name} (${item.desc})` : '空'}
                </span>
            </div>`;
        }

        // Inventory
        if (p.inventory.length > 0) {
            html += '<div style="margin:10px 0;"><b>背包物品 (点击装备):</b></div>';
            for (let i = 0; i < p.inventory.length; i++) {
                const item = p.inventory[i];
                html += `<div class="inv-slot inv-item" data-idx="${i}" style="cursor:pointer;">
                    <span class="rarity-${item.rarity.toLowerCase()}">${SLOT_ICONS[item.slot]} ${item.name}</span>
                    <span class="value" style="font-size:9px;">${item.desc}</span>
                </div>`;
            }
        }

        // Active skills
        if (p.skills.length > 0) {
            html += '<div style="margin:10px 0;"><b>主动技能:</b></div>';
            for (let i = 0; i < p.skills.length; i++) {
                const s = p.skills[i];
                const key = i < 3 ? `[${SKILL_KEYS[i]}]` : `[${i+1}]`;
                const cd = p.skillCooldowns[s.name] || 0;
                html += `<div class="inv-slot">
                    <span>${key} ${s.icon} ${s.name} <span style="color:#3498db;font-size:9px;">消耗${s.cost}魔</span></span>
                    <span class="value" style="font-size:9px;">${s.desc} ${cd > 0 ? `(CD:${cd.toFixed(1)}s)` : ''}</span>
                </div>`;
            }
        }

        // Passive skills
        if (p.passives.length > 0) {
            html += '<div style="margin:10px 0;"><b>被动技能:</b></div>';
            for (const ps of p.passives) {
                html += `<div class="inv-slot" style="color:#2ecc71;">
                    <span>${ps.icon} ${ps.name} (${ps.level}级)</span>
                    <span style="font-size:9px;">${ps.desc}</span>
                </div>`;
            }
        }

        html += '<div style="text-align:center;margin-top:10px;font-size:10px;color:#555;">按 I 或 ESC 关闭 | 点击背包物品装备</div>';

        this.invPanel.innerHTML = html;
        this.invPanel.style.display = 'block';

        this.invPanel.querySelectorAll('.inv-item').forEach(el => {
            el.addEventListener('click', () => {
                const idx = parseInt(el.dataset.idx);
                if (p && p.inventory[idx]) {
                    p.equipItem(p.inventory.splice(idx, 1)[0]);
                    this.showInventory(p);
                }
            });
        });
    }

    hideInventory() {
        this.invPanel.style.display = 'none';
    }

    // ─── Shop ─────────────────────────────────────
    showShop(player, floor) {
        const p = player || this._player;
        this._player = p;
        if (!p) return;

        if (!this._shopItems) {
            this._shopItems = [];
            for (let i = 0; i < 4; i++) {
                const item = generateItem(floor);
                item.price = this._calcBuyPrice(item);
                this._shopItems.push(item);
            }
        }

        let html = '<h3>🏪 地下商店</h3>';
        html += `<div style="font-size:11px;color:#888;margin-bottom:6px;">你有 🪙${p.gold} 金币</div>`;

        html += '<div style="margin-bottom:6px;"><b>出售中的装备:</b></div>';
        for (let i = 0; i < this._shopItems.length; i++) {
            const item = this._shopItems[i];
            const canBuy = p.gold >= item.price;
            html += `<div class="shop-item ${canBuy ? '' : 'no-afford'}" data-shop-idx="${i}" style="cursor:${canBuy ? 'pointer' : 'not-allowed'};">
                <span class="rarity-${item.rarity.toLowerCase()}">${SLOT_ICONS[item.slot]} ${item.name}</span>
                <span style="font-size:9px;color:#888;">${item.desc}</span>
                <span style="color:${canBuy ? '#f1c40f' : '#e74c3c'};font-weight:bold;">🪙${item.price}</span>
            </div>`;
        }

        html += '<div style="margin:10px 0;"><b>你的背包 (点击出售):</b></div>';
        if (p.inventory.length > 0) {
            for (let i = 0; i < p.inventory.length; i++) {
                const item = p.inventory[i];
                const sellPrice = this._calcSellPrice(item);
                html += `<div class="shop-item sell-item" data-sell-idx="${i}" style="cursor:pointer;">
                    <span class="rarity-${item.rarity.toLowerCase()}">${SLOT_ICONS[item.slot]} ${item.name}</span>
                    <span style="font-size:9px;color:#888;">${item.desc}</span>
                    <span style="color:#2ecc71;font-weight:bold;">出售 🪙${sellPrice}</span>
                </div>`;
            }
        } else {
            html += '<div style="font-size:11px;color:#555;">背包空空如也</div>';
        }

        html += '<div style="text-align:center;margin-top:10px;font-size:10px;color:#555;">按 E 或 ESC 关闭 | 点击商品购买 | 点击背包物品出售</div>';

        this.shopPanel.innerHTML = html;
        this.shopPanel.style.display = 'block';
        this.hideInventory();

        this.shopPanel.querySelectorAll('.shop-item:not(.sell-item)').forEach(el => {
            el.addEventListener('click', () => {
                const idx = parseInt(el.dataset.shopIdx);
                const item = this._shopItems[idx];
                if (p && p.gold >= item.price) {
                    p.gold -= item.price;
                    p.inventory.push(item);
                    this._shopItems.splice(idx, 1);
                    this.showShop(p, floor);
                }
            });
        });

        this.shopPanel.querySelectorAll('.sell-item').forEach(el => {
            el.addEventListener('click', () => {
                const idx = parseInt(el.dataset.sellIdx);
                if (p && p.inventory[idx]) {
                    const item = p.inventory[idx];
                    p.gold += this._calcSellPrice(item);
                    p.inventory.splice(idx, 1);
                    this.showShop(p, floor);
                }
            });
        });
    }

    hideShop() {
        this.shopPanel.style.display = 'none';
        this._shopItems = null;
    }

    _calcBuyPrice(item) {
        const base = { COMMON: 30, RARE: 80, EPIC: 180, LEGENDARY: 400 }[item.rarity] || 30;
        return base + Math.floor(Object.values(item.stats).reduce((s, v) => s + v * 5, 0));
    }

    _calcSellPrice(item) {
        return Math.floor(this._calcBuyPrice(item) * 0.4);
    }

    setPlayerRef(player) {
        this._player = player;
    }
}
