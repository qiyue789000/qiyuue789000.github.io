import { SLOTS, SLOT_NAMES, SLOT_ICONS } from './items.js';
import { generateItem, rollRarity, createHpPotion, createMpPotion } from './items.js';
import { CLASS_DEFINITIONS, ALL_CLASS_IDS } from './classes.js';
import { ProfileManager } from './profile.js';
import { ChatService } from './chat.js';

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
        this._hudFrameSkip = 0;
        this._profile = null;
        this._chat = null;

        // Profile & Chat panels
        this.profilePanel = document.getElementById('profile-panel');
        this.chatPanel = document.getElementById('chat-panel');

        document.addEventListener('keydown', (e) => {
            if (e.code === 'KeyI') this.toggleInventory();
            if (e.code === 'KeyP') this.toggleProfile();
            if (e.code === 'Enter' && !e.target.closest('#chat-input')) {
                e.preventDefault();
                this.toggleChat();
            }
            if (e.code === 'Escape') { this.hideInventory(); this.hideShop(); }
        });
    }

    // ─── HUD ───────────────────────────────────────
    updateHUD(player, dungeon, currentRoom, fps) {
        // Throttle HUD updates to every 3 frames (~20fps for DOM)
        this._hudFrameSkip++;
        if (this._hudFrameSkip < 3) return;
        this._hudFrameSkip = 0;

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

        const classIcon = player.classDef ? player.classDef.icon : '⚔️';
        const className = player.classDef ? player.classDef.name : '冒险者';
        this.hudEl.innerHTML = `
            <div style="font-size:20px;font-weight:bold;margin-bottom:4px;">
                ${classIcon} ${className} <span style="color:#f1c40f;">Lv.${player.level}</span>
                <span style="font-size:11px;color:#888;"> B${dungeon.floor}</span>
            </div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                <div style="flex:1;min-width:140px;">
                    <div class="hp-bar-bg"><div class="hp-bar-fill" style="width:${hpPct}%"></div><span class="bar-label">❤ ${Math.floor(player.hp)}/${player.maxHp}</span></div>
                </div>
                <div style="flex:1;min-width:140px;">
                    <div class="mp-bar-bg"><div class="mp-bar-fill" style="width:${mpPct}%"></div><span class="bar-label">💎 ${Math.floor(player.mp)}/${player.maxMp}</span></div>
                </div>
                <span style="font-size:13px;color:#f1c40f;">🪙${player.gold}</span>
            </div>
            <div style="margin-top:2px;font-size:11px;color:#aaa;">
                ⚔${player.atk} 🛡${player.def} 💨${Math.floor(player.spd)} 💥${Math.floor(player.crit*100)}%
                <span style="margin-left:8px;font-size:12px;">${skillsHtml || ''}</span>
            </div>
            <div style="font-size:10px;color:#555;margin-top:2px;">
                [WASD]移 [右键]寻路 [左键/J]攻 [空格]闪 [Q]药 [I]包 [B/N/M]技 [E]店 [F5]存 [F9]读
            </div>
            ${currentRoom && currentRoom.type === 'shop' ? '<div style="font-size:13px;color:#f1c40f;animation:pulse 1s infinite;">🏪 按 [E] 打开商店</div>' : ''}
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
            html += '<div style="margin:10px 0;"><b>背包物品 (点击装备/使用):</b></div>';
            for (let i = 0; i < p.inventory.length; i++) {
                const item = p.inventory[i];
                const isPotion = item.type === 'consumable';
                const icon = isPotion ? '🧪' : (SLOT_ICONS[item.slot] || '📦');
                const actionHint = isPotion ? '点击使用' : '点击装备';
                html += `<div class="inv-slot inv-item" data-idx="${i}" style="cursor:pointer;">
                    <span style="color:${item.color || '#ccc'};">${icon} ${item.name}</span>
                    <span class="value" style="font-size:9px;">${item.desc} <span style="color:#2ecc71;">${actionHint}</span></span>
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

        html += '<div style="text-align:center;margin-top:10px;font-size:10px;color:#555;">按 I/ESC 关闭 | 点击装备 | [Q]快速使用药水</div>';

        this.invPanel.innerHTML = html;
        this.invPanel.style.display = 'block';

        this.invPanel.querySelectorAll('.inv-item').forEach(el => {
            el.addEventListener('click', () => {
                const idx = parseInt(el.dataset.idx);
                if (p && p.inventory[idx]) {
                    const item = p.inventory[idx];
                    if (item.type === 'consumable') {
                        // Use potion immediately
                        if (p.usePotion(item)) {
                            p.inventory.splice(idx, 1);
                        }
                    } else {
                        p.equipItem(p.inventory.splice(idx, 1)[0]);
                    }
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
            // Always add potions
            this._shopPotions = [
                createHpPotion(floor),
                createMpPotion(floor)
            ];
            for (let i = 0; i < 4; i++) {
                const item = generateItem(floor);
                item.price = this._calcBuyPrice(item);
                this._shopItems.push(item);
            }
        }

        let html = '<h3>🏪 地下商店</h3>';
        html += `<div style="font-size:11px;color:#888;margin-bottom:6px;">你有 🪙${p.gold} 金币</div>`;

        // Potions section
        html += '<div style="margin-bottom:6px;"><b>🧪 药水:</b></div>';
        for (let i = 0; i < this._shopPotions.length; i++) {
            const pot = this._shopPotions[i];
            const canBuy = p.gold >= pot.price;
            html += `<div class="shop-item potion-item ${canBuy ? '' : 'no-afford'}" data-potion-idx="${i}" style="cursor:${canBuy ? 'pointer' : 'not-allowed'};">
                <span style="color:${pot.color};">🧪 ${pot.name}</span>
                <span style="font-size:9px;color:#888;">${pot.desc}</span>
                <span style="color:${canBuy ? '#f1c40f' : '#e74c3c'};font-weight:bold;">🪙${pot.price}</span>
            </div>`;
        }

        html += '<div style="margin:10px 0;"><b>出售中的装备:</b></div>';
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
                const isPotion = item.type === 'consumable';
                const icon = isPotion ? '🧪' : (SLOT_ICONS[item.slot] || '📦');
                const sellPrice = isPotion ? Math.floor(item.price * 0.4) : this._calcSellPrice(item);
                html += `<div class="shop-item sell-item" data-sell-idx="${i}" style="cursor:pointer;">
                    <span style="color:${item.color || '#ccc'};">${icon} ${item.name}</span>
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

        // Potion purchase handlers (potions stay in shop, can buy multiple)
        this.shopPanel.querySelectorAll('.potion-item').forEach(el => {
            el.addEventListener('click', () => {
                const idx = parseInt(el.dataset.potionIdx);
                const pot = this._shopPotions[idx];
                if (p && p.gold >= pot.price) {
                    p.gold -= pot.price;
                    // Create a fresh copy of the potion for inventory
                    const newPot = pot.subType === 'hp' ? createHpPotion(floor) : createMpPotion(floor);
                    p.inventory.push(newPot);
                    this.showShop(p, floor);
                }
            });
        });

        this.shopPanel.querySelectorAll('.shop-item:not(.sell-item):not(.potion-item)').forEach(el => {
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
                    const sellPrice = item.type === 'consumable' ? Math.floor(item.price * 0.4) : this._calcSellPrice(item);
                    p.gold += sellPrice;
                    p.inventory.splice(idx, 1);
                    this.showShop(p, floor);
                }
            });
        });
    }

    hideShop() {
        this.shopPanel.style.display = 'none';
        this._shopItems = null;
        this._shopPotions = null;
    }

    _calcBuyPrice(item) {
        const base = { COMMON: 30, RARE: 80, EPIC: 180, LEGENDARY: 400 }[item.rarity] || 30;
        return base + Math.floor(Object.values(item.stats).reduce((s, v) => s + v * 5, 0));
    }

    _calcSellPrice(item) {
        return Math.floor(this._calcBuyPrice(item) * 0.4);
    }

    setProfileManager(profile) { this._profile = profile; }
    setChatService(chat) { this._chat = chat; }

    showSaveConfirm() {
        this._flashNotify('💾 游戏已保存');
    }
    showLoadConfirm() {
        this._flashNotify('📂 存档已加载');
    }
    _flashNotify(msg) {
        const el = document.getElementById('level-up-notify');
        el.textContent = msg;
        el.style.opacity = '1';
        el.style.color = '#2ecc71';
        if (this.levelUpTimeout) clearTimeout(this.levelUpTimeout);
        this.levelUpTimeout = setTimeout(() => {
            el.style.opacity = '0';
            el.style.color = '#f1c40f';
        }, 1200);
    }

    // ─── Profile Panel ─────────────────────────────
    toggleProfile() {
        if (this.profilePanel.classList.contains('active')) {
            this.hideProfile();
        } else {
            this.showProfile();
        }
    }

    showProfile() {
        if (!this._profile) return;
        const stats = this._profile.getStats();
        const fmtTime = (s) => {
            const m = Math.floor(s / 60);
            const h = Math.floor(m / 60);
            return h > 0 ? `${h}时${m % 60}分` : `${m}分${Math.floor(s % 60)}秒`;
        };

        let html = `<div class="stat-row"><span class="label">游玩次数</span><span class="value">${stats.totalGames}</span></div>`;
        html += `<div class="stat-row"><span class="label">总游戏时间</span><span class="value">${fmtTime(stats.totalPlayTime)}</span></div>`;
        html += `<div class="stat-row"><span class="label">累计杀敌</span><span class="value">${stats.totalEnemiesKilled}</span></div>`;
        html += `<div class="stat-row"><span class="label">击败Boss</span><span class="value">${stats.totalBossesKilled}</span></div>`;
        html += `<div class="stat-row"><span class="label">累计金币</span><span class="value">🪙 ${stats.totalGold}</span></div>`;
        html += `<div class="stat-row"><span class="label">最深层数</span><span class="value">地下 ${stats.maxFloor} 层</span></div>`;
        html += `<div class="stat-row"><span class="label">最高等级</span><span class="value">${stats.maxLevel} 级</span></div>`;
        if (stats.classesPlayed.length > 0) {
            html += `<div class="stat-row"><span class="label">使用职业</span><span class="value">${stats.classesPlayed.map(c => CLASS_DEFINITIONS[c]?.icon || c).join(' ')}</span></div>`;
        }

        // Achievements
        html += '<h4>🏆 成就</h4><div class="ach-grid">';
        for (const ach of stats.achievements) {
            const cls = ach.unlocked ? 'unlocked' : 'locked';
            html += `<div class="ach-item ${cls}">
                <span class="ach-icon">${ach.unlocked ? ach.icon : '🔒'}</span>
                <div class="ach-name">${ach.name}</div>
                <div class="ach-desc">${ach.desc}</div>
            </div>`;
        }
        html += '</div>';

        // Recent runs
        if (stats.runHistory.length > 0) {
            html += '<h4>📜 近期冒险</h4>';
            for (const run of stats.runHistory.slice(0, 5)) {
                const clsIcon = CLASS_DEFINITIONS[run.classId]?.icon || '⚔️';
                const date = new Date(run.date).toLocaleDateString('zh-CN');
                html += `<div class="history-item">
                    ${clsIcon} <span>${date}</span> | Lv.${run.level} | 地下${run.floor}层 | 🪙${run.gold}
                    ${run.deathCause ? `| 💀${run.deathCause}` : ''}
                </div>`;
            }
        }

        document.getElementById('profile-content').innerHTML = html;
        this.profilePanel.classList.add('active');
        document.getElementById('profile-close').onclick = () => this.hideProfile();
    }

    hideProfile() {
        this.profilePanel.classList.remove('active');
    }

    // ─── Chat Panel ────────────────────────────────
    toggleChat() {
        if (this.chatPanel.classList.contains('active')) {
            this.hideChat();
        } else {
            this.showChat();
        }
    }

    showChat() {
        if (!this._chat) return;
        this.chatPanel.classList.add('active');
        this._renderChat();
        document.getElementById('chat-close').onclick = () => this.hideChat();
        document.getElementById('chat-send').onclick = () => this._sendChatMessage();
        document.getElementById('chat-input').onkeydown = (e) => {
            if (e.code === 'Enter') this._sendChatMessage();
        };
    }

    hideChat() {
        this.chatPanel.classList.remove('active');
    }

    _renderChat() {
        if (!this._chat) return;
        const msgs = this._chat.getMessages();
        const container = document.getElementById('chat-messages');
        let html = '';
        for (const m of msgs.slice(-50)) {
            const time = new Date(m.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
            html += `<div class="msg ${m.channel}"><span class="time">${time}</span>${m.content}</div>`;
        }
        container.innerHTML = html || '<div style="color:#555;">暂无消息</div>';
        container.scrollTop = container.scrollHeight;
    }

    _sendChatMessage() {
        const input = document.getElementById('chat-input');
        const text = input.value.trim();
        if (!text || !this._chat) return;
        const result = this._chat.sendChat(text);
        if (result.blocked) {
            input.style.borderColor = '#e74c3c';
            input.style.background = '#2a1a1a';
            setTimeout(() => {
                input.style.borderColor = '#444';
                input.style.background = '#1a1a2e';
            }, 1500);
            input.value = '⚠ ' + result.reason;
            input.select();
            setTimeout(() => { input.value = ''; }, 2000);
        } else {
            input.value = '';
        }
        this._renderChat();
    }

    setPlayerRef(player) {
        this._player = player;
    }

    // ─── Tutorial ─────────────────────────────────
    _initTutorial() {
        this.tutorialOverlay = document.getElementById('tutorial-overlay');
        this.tutorialTitle = document.getElementById('tutorial-title');
        this.tutorialText = document.getElementById('tutorial-text');
        this.tutorialIcon = document.getElementById('tutorial-icon');
        this.tutorialHint = document.getElementById('tutorial-hint');
        this.tutorialProgress = document.getElementById('tutorial-progress');
        this.tutorialPrev = document.getElementById('tutorial-prev');
        this.tutorialNext = document.getElementById('tutorial-next');
        this.tutorialSkip = document.getElementById('tutorial-skip');
        this.tutorialStep = 0;
        this.tutorialCallback = null;

        this._tutorialSteps = [
            {
                icon: '🏰',
                title: '欢迎来到深渊探索者！',
                text: '这是一款俯视角肉鸽地牢游戏。你将深入随机生成的地下城，击败敌人、收集装备、挑战强大的 Boss。让我们快速学习基本操作吧！',
                hint: null
            },
            {
                icon: '⬆️',
                title: '移动（WASD）',
                text: '使用 W A S D 键或方向键来控制角色移动。探索每个房间，发现宝藏、商店和敌人。小地图在右上角帮助你导航。',
                hint: '💡 试试用 WASD 移动角色探索起始房间'
            },
            {
                icon: '⚔️',
                title: '攻击（鼠标左键）',
                text: '按住鼠标左键朝敌人方向攻击。不同武器有不同的攻击形态——剑类劈砍、魔杖远程、拳套爆发等。暴击时伤害翻倍并有金色特效！',
                hint: '💡 按住鼠标左键即可持续攻击'
            },
            {
                icon: '💨',
                title: '闪避翻滚（空格键）',
                text: '按空格键向面朝方向翻滚。翻滚期间你处于无敌状态，可以穿过敌人和弹幕。冷却时间仅 1.5 秒，是生存的关键技巧！',
                hint: '💡 危险时刻用空格翻滚脱离包围'
            },
            {
                icon: '🔥',
                title: '主动技能（B / N / M 键）',
                text: '每 10 级解锁一个新技能。按 B、N、M 键释放对应的技能。技能消耗法力值（蓝条），不同技能有不同的冷却时间。法力会随时间自动恢复。',
                hint: '💡 技能有蓝耗，注意法力管理。按 I 查看所有技能'
            },
            {
                icon: '🧪',
                title: '药水（Q 键）',
                text: '按 Q 键快速使用背包中的生命药水。法力药水需要在背包中点击使用。药水可以在商店购买，也会出现在商店房间。',
                hint: '💡 开局赠送 1 瓶生命药水，紧急时按 Q 救命'
            },
            {
                icon: '🎒',
                title: '背包与装备（I 键）',
                text: '按 I 键打开背包。共 7 个装备槽：武器、头盔、护甲、鞋子、手套、项链、戒指。点击背包中的装备即可穿上。装备有普通/稀有/史诗/传说四种品质。',
                hint: '💡 装备会影响角色外观！如武器改变攻击形态'
            },
            {
                icon: '🏪',
                title: '商店（E 键）',
                text: '找到商店房间后（小地图黄色标记，屏幕有提示），按 E 键打开商店。可以购买装备和药水，也可以出售背包中不需要的物品换取金币。',
                hint: '💡 商店每层只有一间，好好利用！'
            },
            {
                icon: '💀',
                title: '挑战深渊！',
                text: '击败 Boss 房间的地牢守卫即可进入下一层。每层地牢随机生成，难度递增。达到 100 级即为巅峰！祝你探索愉快，深渊在等待着你...',
                hint: '🎮 分享链接给你的好友，一起挑战深渊吧！'
            }
        ];
    }

    showTutorial(callback) {
        if (!this.tutorialOverlay) this._initTutorial();
        this.tutorialStep = 0;
        this.tutorialCallback = callback;
        this.tutorialOverlay.classList.add('active');
        this._renderTutorialStep();

        this.tutorialPrev.onclick = () => {
            if (this.tutorialStep > 0) {
                this.tutorialStep--;
                this._renderTutorialStep();
            }
        };
        this.tutorialNext.onclick = () => {
            if (this.tutorialStep < this._tutorialSteps.length - 1) {
                this.tutorialStep++;
                this._renderTutorialStep();
            } else {
                this.hideTutorial();
            }
        };
        this.tutorialSkip.onclick = () => this.hideTutorial();
    }

    _renderTutorialStep() {
        const step = this._tutorialSteps[this.tutorialStep];
        const total = this._tutorialSteps.length;
        this.tutorialIcon.textContent = step.icon;
        this.tutorialTitle.textContent = `(${this.tutorialStep + 1}/${total}) ${step.title}`;
        this.tutorialText.textContent = step.text;
        this.tutorialHint.innerHTML = step.hint || '&nbsp;';
        this.tutorialHint.style.display = step.hint ? 'block' : 'none';

        // Progress dots
        let dots = '';
        for (let i = 0; i < total; i++) {
            let cls = 'tutorial-dot';
            if (i < this.tutorialStep) cls += ' done';
            else if (i === this.tutorialStep) cls += ' active';
            dots += `<span class="${cls}"></span>`;
        }
        this.tutorialProgress.innerHTML = dots;

        this.tutorialPrev.style.display = this.tutorialStep === 0 ? 'none' : '';
        const isLast = this.tutorialStep === total - 1;
        this.tutorialNext.textContent = isLast ? '开始冒险！' : '下一步';
        this.tutorialSkip.textContent = this.tutorialStep === 0 ? '跳过教程' : '跳过剩余';
    }

    hideTutorial() {
        if (this.tutorialOverlay) {
            this.tutorialOverlay.classList.remove('active');
        }
        if (this.tutorialCallback) {
            const cb = this.tutorialCallback;
            this.tutorialCallback = null;
            cb();
        }
    }

    // ─── Class Select ─────────────────────────────
    showClassSelect(callback) {
        const overlay = document.getElementById('class-select-overlay');
        const grid = document.getElementById('class-grid');
        const confirmBtn = document.getElementById('class-confirm-btn');
        let selectedClass = 'human';

        // Build class cards
        let html = '';
        for (const id of ALL_CLASS_IDS) {
            const cls = CLASS_DEFINITIONS[id];
            const stats = cls.baseStats;
            const statsStr = `❤${stats.maxHp} ⚔${stats.atk} 🛡${stats.def} 💨${stats.spd}`;
            const skillCount = cls.uniqueActiveSkillIds.length;
            const skillsStr = `专属技能:${skillCount}个`;
            html += `<div class="class-card ${id === 'human' ? 'selected' : ''}" data-class="${id}">
                <span class="class-icon">${cls.icon}</span>
                <div class="class-name">${cls.name}</div>
                <div class="class-desc">${cls.desc}</div>
                <div class="class-stats">${statsStr}</div>
                <div class="class-skills">${skillsStr}</div>
            </div>`;
        }
        grid.innerHTML = html;
        overlay.classList.add('active');
        confirmBtn.disabled = false;

        // Click handlers
        grid.querySelectorAll('.class-card').forEach(card => {
            card.addEventListener('click', () => {
                grid.querySelectorAll('.class-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                selectedClass = card.dataset.class;
            });
        });

        confirmBtn.onclick = () => {
            overlay.classList.remove('active');
            if (callback) callback(selectedClass);
        };
    }
}
