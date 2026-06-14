// All skill definitions - shared + class-specific
import { dist, angle } from './utils.js';
import { calcDamage } from './combat.js';

// ─── Helper: build a skill object ───
function skill(id, name, desc, icon, type, cd, cost, classId, execute) {
    return { id, name, desc, icon, type, cd, cost, classId, execute };
}

// ══════════════════════════════════════════════
//  SHARED ACTIVE SKILLS (10)
// ══════════════════════════════════════════════

export const SHARED_ACTIVE_SKILLS = [
    skill('whirlwind_slash', '旋风斩', '对周围敌人造成范围伤害', '🌀', 'aoe', 3, 15, null, (player, enemies) => {
        const effs = [];
        for (const e of enemies) {
            if (!e.isDead && dist(player.x, player.y, e.x, e.y) < 80) {
                const { damage, crit } = calcDamage(player.atk * 1.5, e.def, player.crit, player.critMult);
                effs.push({ enemy: e, damage, crit });
            }
        }
        return { skillName: '旋风斩', effects: effs };
    }),

    skill('dash_slash', '冲刺斩', '向前冲刺并造成伤害', '⚡', 'dash_atk', 2, 10, null, (player, enemies, mx, my) => {
        const a = angle(player.x, player.y, mx, my);
        player.isDashing = true;
        player.dashDir = { x: Math.cos(a), y: Math.sin(a) };
        player.dashTimer = 0.15;
        player.invincibleTimer = 0.15;
        const cx = player.x + Math.cos(a) * 60;
        const cy = player.y + Math.sin(a) * 60;
        const effs = [];
        for (const e of enemies) {
            if (!e.isDead && dist(cx, cy, e.x, e.y) < 60) {
                const { damage, crit } = calcDamage(player.atk * 2, e.def, player.crit, player.critMult);
                effs.push({ enemy: e, damage, crit });
            }
        }
        return { skillName: '冲刺斩', effects: effs };
    }),

    skill('heal', '回血术', '恢复 30% 最大生命值', '💚', 'heal', 15, 25, null, (player) => {
        const heal = Math.floor(player.maxHp * 0.3);
        player.hp = Math.min(player.maxHp, player.hp + heal);
        return { skillName: '回血术', effects: [{ heal }] };
    }),

    skill('berserk', '狂暴', '5秒内攻击力翻倍', '🔥', 'buff', 20, 30, null, (player) => {
        player.berserkTimer = 5;
        return { skillName: '狂暴', effects: [{ buff: 'berserk' }] };
    }),

    skill('frost_nova', '冰霜新星', '冻结周围敌人 2 秒', '❄️', 'aoe', 8, 20, null, (player, enemies) => {
        const effs = [];
        for (const e of enemies) {
            if (!e.isDead && dist(player.x, player.y, e.x, e.y) < 100) {
                const { damage, crit } = calcDamage(player.atk * 1.2, e.def, player.crit, player.critMult);
                effs.push({ enemy: e, damage, crit, freeze: true });
            }
        }
        return { skillName: '冰霜新星', effects: effs };
    }),

    skill('shadow_step', '暗影步', '瞬移到鼠标位置', '🌑', 'blink', 4, 12, null, (player, enemies, mx, my) => {
        const d = dist(player.x, player.y, mx, my);
        const maxRange = 250;
        if (d <= maxRange) {
            player.x = mx;
            player.y = my;
        } else {
            const a = angle(player.x, player.y, mx, my);
            player.x += Math.cos(a) * maxRange;
            player.y += Math.sin(a) * maxRange;
        }
        player.invincibleTimer = 0.1;
        return { skillName: '暗影步', effects: [{ blink: true }] };
    }),

    skill('chain_lightning', '连锁闪电', '发射穿透闪电链', '⚡', 'projectile', 5, 18, null, (player, enemies, mx, my) => {
        const chainRange = 130;
        const maxBounces = 4;
        let dmgMult = 1.0;
        const hitSet = new Set();
        const alive = enemies.filter(e => !e.isDead);
        const effs = [];
        const chainTargets = [];

        let first = null;
        let firstDist = Infinity;
        for (const e of alive) {
            const d = dist(mx, my, e.x, e.y);
            if (d < chainRange && d < firstDist) { first = e; firstDist = d; }
        }
        if (first) {
            const { damage, crit } = calcDamage(player.atk * 1.8, first.def, player.crit, player.critMult);
            effs.push({ enemy: first, damage, crit, chain: true });
            hitSet.add(first);
            chainTargets.push({ x: first.x, y: first.y });
            let last = first;
            for (let b = 1; b < maxBounces; b++) {
                dmgMult *= 0.7;
                let next = null;
                let nextDist = chainRange;
                for (const e of alive) {
                    if (hitSet.has(e)) continue;
                    const d = dist(last.x, last.y, e.x, e.y);
                    if (d < nextDist) { next = e; nextDist = d; }
                }
                if (!next) break;
                const { damage: dmg, crit: cr } = calcDamage(Math.floor(player.atk * 1.8 * dmgMult), next.def, player.crit, player.critMult);
                effs.push({ enemy: next, damage: dmg, crit: cr, chain: true });
                chainTargets.push({ x: next.x, y: next.y });
                hitSet.add(next);
                last = next;
            }
        }
        return { skillName: '连锁闪电', effects: effs, chainOrigin: { x: player.x, y: player.y }, chainTargets };
    }),

    skill('thorns_aura', '荆棘光环', '10秒内反弹50%伤害', '🌿', 'buff', 25, 35, null, (player) => {
        player.thornsTimer = 10;
        return { skillName: '荆棘光环', effects: [{ buff: 'thorns' }] };
    }),

    skill('clone_jutsu', '分身术', '召唤2个分身战斗8秒', '👥', 'summon', 30, 40, null, (player, enemies, mx, my, game) => {
        if (game && game.spawnClones) game.spawnClones(2, 8);
        return { skillName: '分身术', effects: [{ buff: 'clones' }] };
    }),

    skill('meteor', '陨石', '召唤陨石造成大范围伤害', '☄️', 'aoe', 12, 35, null, (player, enemies, mx, my, game) => {
        if (game && game.addDelayedEffect) {
            game.addDelayedEffect({
                type: 'meteor', x: mx, y: my, delay: 0.8,
                damage: player.atk * 3, crit: player.crit, critMult: player.critMult,
                radius: 110, color: '#e74c3c'
            });
        }
        return { skillName: '陨石', effects: [{ buff: 'meteor' }] };
    })
];

// ══════════════════════════════════════════════
//  CLASS-SPECIFIC ACTIVE SKILLS (14)
// ══════════════════════════════════════════════

export const CLASS_ACTIVE_SKILLS = {

    // ── Human (2) ──
    human: [
        skill('battle_cry', '战吼', '提升15%攻击力，降低周围敌人10%防御6秒', '📯', 'buff', 18, 20, 'human', (player, enemies) => {
            player._battleCryTimer = 6;
            const effs = [{ buff: 'battle_cry' }];
            for (const e of enemies) {
                if (!e.isDead && dist(player.x, player.y, e.x, e.y) < 120) {
                    e._defDebuff = 0.9; e._defDebuffTimer = 6;
                    effs.push({ enemy: e, damage: 0, crit: false });
                }
            }
            return { skillName: '战吼', effects: effs };
        }),
        skill('roundhouse', '回旋击', '360度范围攻击并击退敌人', '💫', 'aoe', 4, 12, 'human', (player, enemies) => {
            const effs = [];
            for (const e of enemies) {
                if (!e.isDead && dist(player.x, player.y, e.x, e.y) < 75) {
                    const { damage, crit } = calcDamage(player.atk * 1.6, e.def, player.crit, player.critMult);
                    const a = angle(player.x, player.y, e.x, e.y);
                    e.x += Math.cos(a) * 40; e.y += Math.sin(a) * 40;
                    effs.push({ enemy: e, damage, crit });
                }
            }
            return { skillName: '回旋击', effects: effs };
        })
    ],

    // ── Saintess (3) ──
    saintess: [
        skill('holy_light', '圣光治愈', '恢复50%最大生命值，并治疗分身', '💛', 'heal', 12, 30, 'saintess', (player, enemies, mx, my, game) => {
            const heal = Math.floor(player.maxHp * 0.5);
            player.hp = Math.min(player.maxHp, player.hp + heal);
            // Also heal clones
            if (game && game.clones) {
                for (const c of game.clones) c.life = Math.min(c.life + 3, 8);
            }
            return { skillName: '圣光治愈', effects: [{ heal }] };
        }),
        skill('purification_aura', '净化光环', '8秒内对周围暗影敌人造成持续伤害', '✨', 'zone', 25, 35, 'saintess', (player) => {
            player._purificationTimer = 8;
            return { skillName: '净化光环', effects: [{ buff: 'purification' }] };
        }),
        skill('guardian_shield', '守护之盾', '10秒内吸收相当于40%最大生命的伤害', '🛡️', 'shield', 30, 40, 'saintess', (player) => {
            player._shieldHp = Math.floor(player.maxHp * 0.4);
            player._shieldTimer = 10;
            return { skillName: '守护之盾', effects: [{ buff: 'shield' }] };
        })
    ],

    // ── Knight (3) ──
    knight: [
        skill('shield_bash', '盾击', '前方扇形攻击，伤害2.5倍并眩晕1.5秒', '💥', 'aoe', 5, 15, 'knight', (player, enemies) => {
            const effs = [];
            const a = player.facingAngle;
            for (const e of enemies) {
                if (!e.isDead && dist(player.x, player.y, e.x, e.y) < 70) {
                    const da = angle(player.x, player.y, e.x, e.y);
                    let diff = da - a;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    if (Math.abs(diff) < Math.PI / 3) {
                        const { damage, crit } = calcDamage(player.atk * 2.5, e.def, player.crit, player.critMult);
                        e._stunTimer = 1.5;
                        effs.push({ enemy: e, damage, crit });
                    }
                }
            }
            return { skillName: '盾击', effects: effs };
        }),
        skill('iron_fortress', '钢铁要塞', '5秒内+60%防御，嘲讽200范围内敌人', '🏰', 'buff', 22, 30, 'knight', (player, enemies) => {
            player._ironFortressTimer = 5;
            const effs = [{ buff: 'iron_fortress' }];
            for (const e of enemies) {
                if (!e.isDead && dist(player.x, player.y, e.x, e.y) < 200) {
                    e._tauntTarget = { x: player.x, y: player.y };
                    e._tauntTimer = 5;
                }
            }
            return { skillName: '钢铁要塞', effects: effs };
        }),
        skill('holy_charge', '神圣冲锋', '向前冲锋120px，穿透敌人造成1.8倍伤害', '🏇', 'dash_atk', 6, 18, 'knight', (player, enemies) => {
            const a = player.facingAngle;
            player.isDashing = true;
            player.dashDir = { x: Math.cos(a), y: Math.sin(a) };
            player.dashTimer = 0.2;
            player.invincibleTimer = 0.2;
            const effs = [];
            for (const e of enemies) {
                if (!e.isDead && dist(player.x, player.y, e.x, e.y) < 130) {
                    const da = angle(player.x, player.y, e.x, e.y);
                    let diff = da - a;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    if (Math.abs(diff) < 0.5) {
                        const { damage, crit } = calcDamage(player.atk * 1.8, e.def, player.crit, player.critMult);
                        effs.push({ enemy: e, damage, crit });
                    }
                }
            }
            return { skillName: '神圣冲锋', effects: effs };
        })
    ],

    // ── Ninja (3) ──
    ninja: [
        skill('shadow_strike', '影袭', '瞬移到鼠标最近敌人背后造成4倍伤害', '🗡️', 'blink', 7, 20, 'ninja', (player, enemies, mx, my) => {
            const effs = [];
            let nearest = null, nearestDist = 200;
            for (const e of enemies) {
                if (e.isDead) continue;
                const d = dist(mx, my, e.x, e.y);
                if (d < nearestDist) { nearest = e; nearestDist = d; }
            }
            if (nearest) {
                const behind = angle(nearest.x, nearest.y, player.x, player.y);
                player.x = nearest.x + Math.cos(behind) * 30;
                player.y = nearest.y + Math.sin(behind) * 30;
                const { damage, crit } = calcDamage(player.atk * 4, nearest.def, player.crit, player.critMult);
                effs.push({ enemy: nearest, damage, crit });
            }
            return { skillName: '影袭', effects: effs };
        }),
        skill('smoke_bomb', '烟幕弹', '隐身3秒，下次攻击伤害翻倍', '💨', 'buff', 16, 25, 'ninja', (player) => {
            player._smokeTimer = 3;
            player.invincibleTimer = 3;
            player._nextAttackBonus = 2;
            return { skillName: '烟幕弹', effects: [{ buff: 'smoke' }] };
        }),
        skill('shuriken_barrage', '手里剑乱舞', '向鼠标方向发射8枚手里剑', '⭐', 'projectile', 4, 15, 'ninja', (player, enemies, mx, my, game) => {
            const a = angle(player.x, player.y, mx, my);
            for (let i = 0; i < 8; i++) {
                const spread = a + (i - 3.5) * 0.12;
                const proj = {
                    x: player.x, y: player.y,
                    vx: Math.cos(spread) * 280, vy: Math.sin(spread) * 280,
                    damage: Math.floor(player.atk * 0.6), color: '#aaa', size: 3,
                    life: 0.6, maxLife: 0.6, active: true
                };
                if (game && game.allProjectiles) game.allProjectiles.push(proj);
            }
            return { skillName: '手里剑乱舞', effects: [{ buff: 'shuriken' }] };
        })
    ],

    // ── Mage (3) ──
    mage: [
        skill('arcane_missiles', '奥术飞弹', '发射5枚自动追踪导弹', '💠', 'projectile', 3, 18, 'mage', (player, enemies, mx, my, game) => {
            const alive = enemies.filter(e => !e.isDead);
            const targets = alive.sort((a, b) => dist(player.x, player.y, a.x, a.y) - dist(player.x, player.y, b.x, b.y)).slice(0, 5);
            for (let i = 0; i < 5; i++) {
                const t = targets[i % targets.length] || { x: mx + (Math.random() - 0.5) * 200, y: my + (Math.random() - 0.5) * 200 };
                const a = angle(player.x, player.y, t.x, t.y);
                const proj = {
                    x: player.x, y: player.y,
                    vx: Math.cos(a) * 250, vy: Math.sin(a) * 250,
                    damage: Math.floor(player.atk * 0.8), color: '#a855f7', size: 4,
                    life: 1.2, maxLife: 1.2, active: true, homing: true, target: t
                };
                if (game && game.allProjectiles) game.allProjectiles.push(proj);
            }
            return { skillName: '奥术飞弹', effects: [{ buff: 'missiles' }] };
        }),
        skill('blizzard', '暴风雪', '在鼠标位置创造暴风雪，减速敌人50%并持续造成伤害，持续6秒', '🌨️', 'zone', 18, 40, 'mage', (player, enemies, mx, my, game) => {
            if (game && game.addDelayedEffect) {
                game.addDelayedEffect({
                    type: 'blizzard', x: mx, y: my, delay: 0.3,
                    damage: player.atk * 0.3, duration: 6, radius: 140,
                    slowAmount: 0.5, color: '#87ceeb'
                });
            }
            return { skillName: '暴风雪', effects: [{ buff: 'blizzard' }] };
        }),
        skill('mana_burst', '魔力爆发', '消耗所有法力造成范围伤害(伤害=消耗法力×攻击力)', '💥', 'aoe', 25, 0, 'mage', (player, enemies) => {
            const mp = player.mp;
            player.mp = 0;
            const totalDmg = Math.floor(mp * player.atk * 0.5);
            const effs = [];
            for (const e of enemies) {
                if (!e.isDead && dist(player.x, player.y, e.x, e.y) < 160) {
                    const { damage, crit } = calcDamage(totalDmg, e.def, player.crit, player.critMult);
                    effs.push({ enemy: e, damage, crit });
                }
            }
            return { skillName: '魔力爆发', effects: effs };
        })
    ]
};

// ══════════════════════════════════════════════
//  SHARED PASSIVE SKILLS (15)
// ══════════════════════════════════════════════

export const SHARED_PASSIVE_SKILLS = [
    { name: '坚韧', desc: '生命值上限 +10%', level: 5, icon: '❤️', stat: 'maxHp', value: 0.1, type: 'pct', id: 'fortitude' },
    { name: '锐利', desc: '攻击力 +15%', level: 10, icon: '⚔️', stat: 'atk', value: 0.15, type: 'pct', id: 'sharpness' },
    { name: '铁壁', desc: '防御力 +20%', level: 15, icon: '🛡️', stat: 'def', value: 0.2, type: 'pct', id: 'iron_wall' },
    { name: '疾步', desc: '移动速度 +12%', level: 20, icon: '💨', stat: 'spd', value: 0.12, type: 'pct', id: 'agility' },
    { name: '冥想', desc: '法力恢复 +50%', level: 25, icon: '🧘', stat: 'mpRegen', value: 0.5, type: 'pct', id: 'meditation' },
    { name: '会心', desc: '暴击率 +5%', level: 30, icon: '💥', stat: 'crit', value: 0.05, type: 'flat', id: 'precision' },
    { name: '生命源泉', desc: '每秒恢复 1% 生命', level: 35, icon: '💖', stat: 'hpRegen', value: 0.01, type: 'pct', id: 'regen' },
    { name: '强击', desc: '暴击伤害 +25%', level: 40, icon: '✨', stat: 'critMult', value: 0.25, type: 'flat', id: 'power_strike' },
    { name: '法力潮汐', desc: '最大法力 +30%', level: 45, icon: '🌊', stat: 'maxMp', value: 0.3, type: 'pct', id: 'mana_tide' },
    { name: '吸血', desc: '攻击恢复造成伤害 8% 的生命', level: 50, icon: '🩸', stat: 'lifesteal', value: 0.08, type: 'flat', id: 'lifesteal' },
    { name: '不朽', desc: '受到致命伤害时保留 1 点生命 (冷却 120 秒)', level: 60, icon: '⭐', stat: 'cheatDeath', value: 120, type: 'cd', id: 'immortality' },
    { name: '武器精通', desc: '攻击力 +25%', level: 70, icon: '🗡️', stat: 'atk', value: 0.25, type: 'pct', id: 'weapon_mastery' },
    { name: '金刚不坏', desc: '防御力 +30%', level: 80, icon: '🔰', stat: 'def', value: 0.3, type: 'pct', id: 'diamond_body' },
    { name: '无限法力', desc: '技能消耗 -30%', level: 90, icon: '♾️', stat: 'skillCost', value: -0.3, type: 'pct', id: 'limitless_mana' },
    { name: '超神', desc: '全属性 +15%', level: 100, icon: '👑', stat: 'all', value: 0.15, type: 'pct', id: 'transcendence' }
];

// ══════════════════════════════════════════════
//  CLASS-SPECIFIC PASSIVE SKILLS (18)
// ══════════════════════════════════════════════

export const CLASS_PASSIVE_SKILLS = {
    human: [
        { name: '适应力', desc: '全属性 +4%', level: 3, icon: '🌟', stat: 'all', value: 0.04, type: 'pct', id: 'adaptability' },
        { name: '不屈', desc: '生命低于20%时+30%防御+20%攻击(60s冷却)', level: 22, icon: '💪', stat: 'unyielding', value: 60, type: 'cd', id: 'unyielding' },
        { name: '领袖气质', desc: '分身伤害+30%，持续时间+3秒', level: 65, icon: '👑', stat: 'leadership', value: 0.3, type: 'flat', id: 'leadership' }
    ],
    saintess: [
        { name: '圣光亲和', desc: '治疗效果 +25%', level: 3, icon: '✨', stat: 'healBonus', value: 0.25, type: 'flat', id: 'light_affinity' },
        { name: '信仰之力', desc: '最大法力+20%，法力恢复+25%', level: 12, icon: '🙏', stat: 'faith_power', value: 0.2, type: 'pct', id: 'faith_power' },
        { name: '救赎', desc: '分身死亡时恢复15%最大生命', level: 42, icon: '💫', stat: 'redemption', value: 0.15, type: 'flat', id: 'redemption' },
        { name: '神圣新星', desc: '每30秒释放脉冲治疗10%HP并伤害暗影敌人', level: 78, icon: '🌟', stat: 'holy_nova', value: 30, type: 'cd', id: 'holy_nova' }
    ],
    knight: [
        { name: '重甲精通', desc: '装备提供的防御 +25%', level: 3, icon: '🛡️', stat: 'heavy_armor', value: 0.25, type: 'flat', id: 'heavy_armor' },
        { name: '格挡', desc: '15%几率完全格挡伤害', level: 12, icon: '✋', stat: 'block', value: 0.15, type: 'flat', id: 'block' },
        { name: '盾墙', desc: '静止1秒后+30%防御', level: 42, icon: '🧱', stat: 'shield_wall', value: 0.3, type: 'pct', id: 'shield_wall' },
        { name: '反击', desc: '格挡时对攻击者造成50%攻击力伤害', level: 78, icon: '↩️', stat: 'counter', value: 0.5, type: 'flat', id: 'counter' }
    ],
    ninja: [
        { name: '暗杀术', desc: '暴击伤害+15%，暴击率+8%', level: 3, icon: '🗡️', stat: 'assassination', value: 0.08, type: 'flat', id: 'assassination' },
        { name: '轻盈', desc: '移动速度+12%，闪避冷却-30%', level: 12, icon: '💨', stat: 'agility_ninja', value: 0.3, type: 'flat', id: 'agility_ninja' },
        { name: '弱点感知', desc: '攻击无视20%敌人防御', level: 42, icon: '👁️', stat: 'weak_point', value: 0.2, type: 'flat', id: 'weak_point' },
        { name: '影分身', desc: '闪避时留下分身嘲讽敌人1.5秒', level: 78, icon: '👥', stat: 'shadow_clone_passive', value: 1.5, type: 'flat', id: 'shadow_clone_passive' }
    ],
    mage: [
        { name: '奥术智慧', desc: '最大法力+30%，法力恢复+25%', level: 3, icon: '📖', stat: 'arcane_intellect', value: 0.3, type: 'pct', id: 'arcane_intellect' },
        { name: '元素掌握', desc: '技能伤害 +20%', level: 12, icon: '🔥', stat: 'elemental_mastery', value: 0.2, type: 'pct', id: 'elemental_mastery' },
        { name: '法力护盾', desc: '10%伤害由法力值吸收', level: 42, icon: '🔮', stat: 'mana_shield', value: 0.1, type: 'flat', id: 'mana_shield' },
        { name: '奥术风暴', desc: '法力>80%时技能冷却-30%', level: 78, icon: '🌀', stat: 'arcane_storm', value: 0.3, type: 'flat', id: 'arcane_storm' }
    ]
};

// ══════════════════════════════════════════════
//  ALL SKILLS BY ID (for fast lookup)
// ══════════════════════════════════════════════

export function buildSkillLookup() {
    const map = {};
    for (const s of SHARED_ACTIVE_SKILLS) map[s.id] = s;
    for (const cls of Object.values(CLASS_ACTIVE_SKILLS)) {
        for (const s of cls) map[s.id] = s;
    }
    return map;
}

export const ALL_SKILLS_BY_ID = buildSkillLookup();
