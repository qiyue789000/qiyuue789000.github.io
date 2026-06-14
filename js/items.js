import { rand, randFloat, choice, uid } from './utils.js';

export const RARITY = {
    COMMON:    { name: '普通', color: '#aaa', weight: 60, mult: 1.0 },
    RARE:      { name: '稀有', color: '#3498db', weight: 25, mult: 1.3 },
    EPIC:      { name: '史诗', color: '#9b59b6', weight: 10, mult: 1.7 },
    LEGENDARY: { name: '传说', color: '#e67e22', weight: 5, mult: 2.2 }
};

export const SLOTS = ['weapon', 'helmet', 'armor', 'boots', 'gloves', 'amulet', 'ring'];
export const SLOT_NAMES = {
    weapon: '武器', helmet: '头盔', armor: '护甲',
    boots: '鞋子', gloves: '手套', amulet: '项链', ring: '戒指'
};
export const SLOT_ICONS = {
    weapon: '⚔️', helmet: '⛑️', armor: '🛡️',
    boots: '👢', gloves: '🧤', amulet: '📿', ring: '💍'
};

const ITEM_NAMES = {
    weapon:  ['短剑', '长剑', '战斧', '匕首', '魔杖', '巨锤', '镰刀', '拳套', '弯刀', '长矛', '双刃', '刺剑'],
    helmet:  ['布帽', '铁盔', '秘银冠', '龙鳞头巾', '暗影兜帽', '角盔', '圣光冠', '暗盔'],
    armor:   ['皮甲', '链甲', '板甲', '暗影长袍', '龙鳞铠', '骨铠', '符文甲', '血鳞甲'],
    boots:   ['草鞋', '皮靴', '铁靴', '疾风靴', '暗影鞋', '龙鳞靴', '圣光鞋'],
    gloves:  ['布手套', '皮手套', '铁护手', '力量护手', '暗影手套', '龙鳞护手'],
    amulet:  ['骨链', '银链', '金链', '生命护符', '暗影坠', '龙心坠', '圣光符'],
    ring:    ['铜戒', '银戒', '金戒', '力量之戒', '疾风之戒', '暗影戒', '龙鳞戒', '圣光戒']
};

const STAT_NAMES = ['atk', 'def', 'maxHp', 'maxMp', 'crit', 'spd', 'mpRegen'];

export function rollRarity() {
    const total = Object.values(RARITY).reduce((s, r) => s + r.weight, 0);
    let roll = rand(1, total);
    for (const [key, r] of Object.entries(RARITY)) {
        roll -= r.weight;
        if (roll <= 0) return { key, ...r };
    }
    return { key: 'COMMON', ...RARITY.COMMON };
}

export function generateItem(floor = 1, slot = null) {
    const s = slot || choice(SLOTS);
    const rarity = rollRarity();
    const baseName = choice(ITEM_NAMES[s]);
    const floorScale = 1 + (floor - 1) * 0.1;

    const stats = {};
    const statCount = rand(1, rarity.key === 'LEGENDARY' ? 3 : 2);

    // Slot-specific stat biases
    const slotStats = {
        weapon: ['atk', 'crit'],
        helmet: ['def', 'maxHp'],
        armor:  ['def', 'maxHp'],
        boots:  ['spd', 'def'],
        gloves: ['atk', 'crit'],
        amulet: ['maxMp', 'mpRegen', 'maxHp'],
        ring:   ['crit', 'spd', 'maxMp']
    };

    const preferred = slotStats[s] || STAT_NAMES;
    for (let i = 0; i < statCount; i++) {
        const stat = i === 0 ? choice(preferred) : choice(STAT_NAMES);
        const baseValue = stat === 'maxHp' ? rand(10, 30) :
                          stat === 'maxMp' ? rand(10, 25) :
                          stat === 'mpRegen' ? randFloat(0.5, 2) :
                          stat === 'crit' ? randFloat(0.01, 0.04) :
                          stat === 'spd' ? randFloat(0.1, 0.5) :
                          rand(1, 5);
        stats[stat] = Math.floor(baseValue * rarity.mult * floorScale * 100) / 100;
    }

    return {
        id: uid(),
        name: `${rarity.name} ${baseName}`,
        slot: s,
        rarity: rarity.key,
        rarityName: rarity.name,
        color: rarity.color,
        stats,
        desc: Object.entries(stats).map(([k, v]) => {
            const label = { atk: '攻击', def: '防御', maxHp: '生命', maxMp: '法力', crit: '暴击率', spd: '速度', mpRegen: '回蓝' }[k];
            return `+${v} ${label}`;
        }).join(', ')
    };
}

// ─── Potions ───
export function createHpPotion(floor = 1) {
    return {
        id: uid(),
        name: '生命药水',
        type: 'consumable',
        subType: 'hp',
        slot: 'consumable',
        rarity: 'COMMON',
        rarityName: '普通',
        color: '#e74c3c',
        healPercent: 0.35 + floor * 0.03,
        desc: `恢复 ${Math.floor((0.35 + floor * 0.03) * 100)}% 最大生命值`,
        price: 20 + floor * 6
    };
}

export function createMpPotion(floor = 1) {
    return {
        id: uid(),
        name: '法力药水',
        type: 'consumable',
        subType: 'mp',
        slot: 'consumable',
        rarity: 'COMMON',
        rarityName: '普通',
        color: '#3498db',
        manaPercent: 0.35 + floor * 0.03,
        desc: `恢复 ${Math.floor((0.35 + floor * 0.03) * 100)}% 最大法力值`,
        price: 15 + floor * 5
    };
}

export function generateDrop(floor) {
    const items = [];
    const count = rand(0, 3);
    for (let i = 0; i < count; i++) {
        items.push(generateItem(floor));
    }
    const gold = rand(floor * 8, floor * 20);
    return { items, gold };
}

// ─── Equipment Icon Drawing (unique per item) ───
// Returns a function that draws the icon on a canvas context at (cx, cy, size)
export function drawItemIcon(ctx, cx, cy, size, item) {
    const s = size;
    ctx.save();
    ctx.translate(cx, cy);

    // Background rarity glow
    const rarityAlpha = { COMMON: 0.1, RARE: 0.2, EPIC: 0.3, LEGENDARY: 0.45 }[item.rarity] || 0.1;
    ctx.fillStyle = item.color + Math.floor(rarityAlpha * 255).toString(16).padStart(2, '0');
    ctx.beginPath();
    ctx.roundRect(-s/2 - 3, -s/2 - 3, s + 6, s + 6, 4);
    ctx.fill();

    // Background
    ctx.fillStyle = '#1a1a2e';
    ctx.strokeStyle = item.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-s/2, -s/2, s, s, 3);
    ctx.fill();
    ctx.stroke();

    // Draw slot-specific icon
    ctx.fillStyle = item.color;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;

    switch (item.slot) {
        case 'weapon': _drawWeaponIcon(ctx, item, s); break;
        case 'helmet': _drawHelmetIcon(ctx, s); break;
        case 'armor':  _drawArmorIcon(ctx, s); break;
        case 'boots':  _drawBootsIcon(ctx, s); break;
        case 'gloves': _drawGlovesIcon(ctx, s); break;
        case 'amulet': _drawAmuletIcon(ctx, s); break;
        case 'ring':   _drawRingIcon(ctx, s); break;
    }

    // Rarity stars in corner
    const stars = { COMMON: 0, RARE: 1, EPIC: 2, LEGENDARY: 3 }[item.rarity] || 0;
    ctx.fillStyle = '#f1c40f';
    ctx.font = `${s * 0.25}px sans-serif`;
    for (let i = 0; i < stars; i++) {
        ctx.fillText('★', s/2 - s * 0.3, -s/2 + s * 0.2 + i * s * 0.22);
    }

    // Level requirement hint
    ctx.fillStyle = '#888';
    ctx.font = `${s * 0.16}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(item.slot === 'weapon' ? SLOT_NAMES[item.slot] : '', 0, s/2 + s * 0.2);

    ctx.restore();
}

function _drawWeaponIcon(ctx, item, s) {
    const name = item.name;
    ctx.strokeStyle = item.color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';

    if (name.includes('剑') || name.includes('刃') || name.includes('刺')) {
        // Sword: vertical blade
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.35);
        ctx.lineTo(0, s * 0.3);
        ctx.stroke();
        ctx.fillStyle = item.color;
        ctx.fillRect(-s * 0.15, -s * 0.15, s * 0.3, s * 0.1);
    } else if (name.includes('斧')) {
        // Axe: wide head
        ctx.beginPath();
        ctx.moveTo(-s * 0.35, -s * 0.15);
        ctx.lineTo(s * 0.35, -s * 0.15);
        ctx.lineTo(s * 0.2, s * 0.05);
        ctx.lineTo(-s * 0.2, s * 0.05);
        ctx.closePath();
        ctx.fill();
        ctx.fillRect(-s * 0.03, -s * 0.05, s * 0.06, s * 0.4);
    } else if (name.includes('锤')) {
        // Hammer: rectangular head
        ctx.fillStyle = item.color;
        ctx.fillRect(-s * 0.3, -s * 0.25, s * 0.6, s * 0.25);
        ctx.fillRect(-s * 0.04, -s * 0.05, s * 0.08, s * 0.4);
    } else if (name.includes('杖')) {
        // Wand: thin stick with orb
        ctx.beginPath();
        ctx.moveTo(0, s * 0.35);
        ctx.lineTo(0, -s * 0.15);
        ctx.stroke();
        ctx.fillStyle = item.color;
        ctx.beginPath();
        ctx.arc(0, -s * 0.22, s * 0.15, 0, Math.PI * 2);
        ctx.fill();
    } else if (name.includes('匕首')) {
        // Dagger: short diagonal
        ctx.beginPath();
        ctx.moveTo(-s * 0.1, -s * 0.3);
        ctx.lineTo(s * 0.2, s * 0.1);
        ctx.stroke();
        ctx.fillRect(-s * 0.1, -s * 0.05, s * 0.2, s * 0.08);
    } else if (name.includes('镰')) {
        // Scythe: curved
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.3, -Math.PI * 0.6, Math.PI * 0.3);
        ctx.stroke();
        ctx.fillRect(-s * 0.03, -s * 0.05, s * 0.06, s * 0.35);
    } else if (name.includes('矛')) {
        // Spear: long with tip
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.4);
        ctx.lineTo(0, s * 0.2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.4);
        ctx.lineTo(-s * 0.12, -s * 0.25);
        ctx.lineTo(s * 0.12, -s * 0.25);
        ctx.closePath();
        ctx.fill();
    } else if (name.includes('拳套')) {
        // Fist: circle
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.25, 0, Math.PI * 2);
        ctx.fill();
    } else {
        // Default sword
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.35);
        ctx.lineTo(0, s * 0.3);
        ctx.stroke();
    }
    ctx.lineCap = 'butt';
}

function _drawHelmetIcon(ctx, s) {
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.arc(0, -s * 0.05, s * 0.28, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(-s * 0.28, -s * 0.05, s * 0.56, s * 0.15);
    ctx.fillStyle = '#111';
    ctx.fillRect(-s * 0.2, -s * 0.12, s * 0.4, s * 0.04);
}

function _drawArmorIcon(ctx, s) {
    ctx.fillStyle = ctx.strokeStyle;
    // Shoulders
    ctx.fillRect(-s * 0.35, -s * 0.25, s * 0.15, s * 0.15);
    ctx.fillRect(s * 0.2, -s * 0.25, s * 0.15, s * 0.15);
    // Body
    ctx.beginPath();
    ctx.moveTo(-s * 0.2, -s * 0.1);
    ctx.lineTo(-s * 0.3, s * 0.3);
    ctx.lineTo(s * 0.3, s * 0.3);
    ctx.lineTo(s * 0.2, -s * 0.1);
    ctx.closePath();
    ctx.fill();
}

function _drawBootsIcon(ctx, s) {
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fillRect(-s * 0.3, s * 0.05, s * 0.25, s * 0.25);
    ctx.fillRect(s * 0.05, s * 0.05, s * 0.25, s * 0.25);
    ctx.fillRect(-s * 0.3, -s * 0.15, s * 0.6, s * 0.2);
}

function _drawGlovesIcon(ctx, s) {
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.arc(-s * 0.15, 0, s * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(s * 0.15, 0, s * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-s * 0.25, -s * 0.15, s * 0.5, s * 0.08);
}

function _drawAmuletIcon(ctx, s) {
    // Chain
    ctx.beginPath();
    ctx.arc(0, -s * 0.15, s * 0.25, Math.PI, 0);
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Gem
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.moveTo(0, s * 0.2);
    ctx.lineTo(-s * 0.18, 0);
    ctx.lineTo(0, -s * 0.1);
    ctx.lineTo(s * 0.18, 0);
    ctx.closePath();
    ctx.fill();
}

function _drawRingIcon(ctx, s) {
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.22, 0, Math.PI * 2);
    ctx.stroke();
    // Gem
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.arc(0, -s * 0.22, s * 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1;
}
