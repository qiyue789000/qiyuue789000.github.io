import { xpForLevel, clamp, angle, dist } from './utils.js';
import { calcDamage, meleeHit } from './combat.js';

const BASE_STATS = {
    maxHp: 100,
    maxMp: 60,
    atk: 10,
    def: 3,
    spd: 180,
    crit: 0.05,
    critMult: 1.5,
    attackRange: 45,
    attackSpeed: 0.4,
    mpRegen: 3  // MP per second
};

// Active skills with mana costs
const ACTIVE_SKILLS = [
    { name: '旋风斩', desc: '对周围敌人造成范围伤害', cd: 3, cost: 15, icon: '🌀', type: 'aoe' },
    { name: '冲刺斩', desc: '向前冲刺并造成伤害', cd: 2, cost: 10, icon: '⚡', type: 'dash_atk' },
    { name: '回血术', desc: '恢复 30% 最大生命值', cd: 15, cost: 25, icon: '💚', type: 'heal' },
    { name: '狂暴', desc: '5秒内攻击力翻倍', cd: 20, cost: 30, icon: '🔥', type: 'buff' },
    { name: '冰霜新星', desc: '冻结周围敌人 2 秒', cd: 8, cost: 20, icon: '❄️', type: 'aoe' },
    { name: '暗影步', desc: '瞬移到鼠标位置', cd: 4, cost: 12, icon: '🌑', type: 'blink' },
    { name: '连锁闪电', desc: '发射穿透闪电链', cd: 5, cost: 18, icon: '⚡', type: 'projectile' },
    { name: '荆棘光环', desc: '10秒内反弹50%伤害', cd: 25, cost: 35, icon: '🌿', type: 'buff' },
    { name: '分身术', desc: '召唤2个分身战斗8秒', cd: 30, cost: 40, icon: '👥', type: 'summon' },
    { name: '陨石', desc: '召唤陨石造成大范围伤害', cd: 12, cost: 35, icon: '☄️', type: 'aoe' }
];

// Passive skills (always active, unlocked at specific levels)
const PASSIVE_SKILLS = [
    { name: '坚韧', desc: '生命值上限 +10%', level: 5, icon: '❤️', stat: 'maxHp', value: 0.1, type: 'pct' },
    { name: '锐利', desc: '攻击力 +15%', level: 10, icon: '⚔️', stat: 'atk', value: 0.15, type: 'pct' },
    { name: '铁壁', desc: '防御力 +20%', level: 15, icon: '🛡️', stat: 'def', value: 0.2, type: 'pct' },
    { name: '疾步', desc: '移动速度 +12%', level: 20, icon: '💨', stat: 'spd', value: 0.12, type: 'pct' },
    { name: '冥想', desc: '法力恢复 +50%', level: 25, icon: '🧘', stat: 'mpRegen', value: 0.5, type: 'pct' },
    { name: '会心', desc: '暴击率 +5%', level: 30, icon: '💥', stat: 'crit', value: 0.05, type: 'flat' },
    { name: '生命源泉', desc: '每秒恢复 1% 生命', level: 35, icon: '💖', stat: 'hpRegen', value: 0.01, type: 'pct' },
    { name: '强击', desc: '暴击伤害 +25%', level: 40, icon: '✨', stat: 'critMult', value: 0.25, type: 'flat' },
    { name: '法力潮汐', desc: '最大法力 +30%', level: 45, icon: '🌊', stat: 'maxMp', value: 0.3, type: 'pct' },
    { name: '吸血', desc: '攻击恢复造成伤害 8% 的生命', level: 50, icon: '🩸', stat: 'lifesteal', value: 0.08, type: 'flat' },
    { name: '不朽', desc: '受到致命伤害时保留 1 点生命 (冷却 120 秒)', level: 60, icon: '⭐', stat: 'cheatDeath', value: 120, type: 'cd' },
    { name: '武器精通', desc: '攻击力 +25%', level: 70, icon: '🗡️', stat: 'atk', value: 0.25, type: 'pct' },
    { name: '金刚不坏', desc: '防御力 +30%', level: 80, icon: '🔰', stat: 'def', value: 0.3, type: 'pct' },
    { name: '无限法力', desc: '技能消耗 -30%', level: 90, icon: '♾️', stat: 'skillCost', value: -0.3, type: 'pct' },
    { name: '超神', desc: '全属性 +15%', level: 100, icon: '👑', stat: 'all', value: 0.15, type: 'pct' }
];

export class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 14;
        this.level = 1;
        this.xp = 0;
        this.gold = 0;
        this.hp = BASE_STATS.maxHp;
        this.mp = BASE_STATS.maxMp;

        // Base stats
        this.baseMaxHp = BASE_STATS.maxHp;
        this.baseMaxMp = BASE_STATS.maxMp;
        this.baseAtk = BASE_STATS.atk;
        this.baseDef = BASE_STATS.def;
        this.baseSpd = BASE_STATS.spd;
        this.baseCrit = BASE_STATS.crit;
        this.baseMpRegen = BASE_STATS.mpRegen;
        this.critMult = BASE_STATS.critMult;
        this.attackRange = BASE_STATS.attackRange;
        this.attackSpeed = BASE_STATS.attackSpeed;

        // Equipment (7 slots)
        this.equipment = { weapon: null, helmet: null, armor: null, boots: null, gloves: null, amulet: null, ring: null };
        this.inventory = [];

        // Skills
        this.skills = [];         // Active skills
        this.passives = [];       // Passive skills
        this.skillCooldowns = {};

        // Passive states
        this.cheatDeathCooldown = 0;
        this.berserkTimer = 0;
        this.thornsTimer = 0;

        // Combat state
        this.attackTimer = 0;
        this.invincibleTimer = 0;
        this.dashCooldown = 0;
        this.isDashing = false;
        this.dashDir = { x: 0, y: 0 };
        this.dashTimer = 0;

        // Animation
        this.facingAngle = 0;
        this.animTimer = 0;
        this.hitFlash = 0;
    }

    // ─── Computed stats ───
    _equipStatSum(stat) {
        let sum = 0;
        for (const eq of Object.values(this.equipment)) {
            if (eq && eq.stats[stat]) sum += eq.stats[stat];
        }
        return sum;
    }

    _getPassiveMultiplier(stat) {
        if (stat === 'all') return 0;
        let mult = 1;
        for (const p of this.passives) {
            if (p.stat === stat && p.type === 'pct') mult += p.value;
            if (p.stat === 'all' && p.type === 'pct') mult += p.value;
        }
        return mult;
    }

    _getPassiveFlat(stat) {
        let val = 0;
        for (const p of this.passives) {
            if (p.stat === stat && p.type === 'flat') val += p.value;
        }
        return val;
    }

    get maxHp() {
        const base = this.baseMaxHp + (this.level - 1) * 5 + this._equipStatSum('maxHp');
        return Math.floor(base * this._getPassiveMultiplier('maxHp'));
    }

    get maxMp() {
        const base = this.baseMaxMp + (this.level - 1) * 3 + this._equipStatSum('maxMp');
        return Math.floor(base * this._getPassiveMultiplier('maxMp'));
    }

    get atk() {
        const base = this.baseAtk + (this.level - 1) * 2 + this._equipStatSum('atk');
        return Math.floor(base * this._getPassiveMultiplier('atk') + this._getPassiveFlat('atk'));
    }

    get def() {
        const base = this.baseDef + (this.level - 1) * 1 + this._equipStatSum('def');
        return Math.floor(base * this._getPassiveMultiplier('def') + this._getPassiveFlat('def'));
    }

    get spd() {
        const base = this.baseSpd + this._equipStatSum('spd');
        return base * this._getPassiveMultiplier('spd') + this._getPassiveFlat('spd');
    }

    get crit() {
        return Math.min(0.85, this.baseCrit + (this.level - 1) * 0.002 + this._equipStatSum('crit') + this._getPassiveFlat('crit'));
    }

    get mpRegen() {
        const base = this.baseMpRegen + this._equipStatSum('mpRegen');
        return base * this._getPassiveMultiplier('mpRegen');
    }

    get lifesteal() {
        return this._getPassiveFlat('lifesteal');
    }

    get skillCostMultiplier() {
        return 1 + (this._getPassiveFlat('skillCost') || 0); // negative = cost reduction
    }

    get hpRegen() {
        return this._getPassiveFlat('hpRegen');
    }

    get xpToNext() { return xpForLevel(this.level); }
    get isDead() { return this.hp <= 0; }

    // ─── Leveling ───
    gainXp(amount) {
        if (this.level >= 100) return false;
        this.xp += amount;
        if (this.xp >= this.xpToNext) {
            this.xp -= this.xpToNext;
            this.level++;
            this.hp = Math.min(this.maxHp, this.hp + Math.floor(this.maxHp * 0.3));
            this.mp = this.maxMp; // Full mana on level up
            this.unlockSkills();
            return true;
        }
        return false;
    }

    unlockSkills() {
        // Active skills every 10 levels
        if (this.level % 10 === 0) {
            const skill = ACTIVE_SKILLS[(this.level / 10 - 1) % ACTIVE_SKILLS.length];
            this.skills.push({ ...skill, level: this.level });
            this.skillCooldowns[skill.name] = 0;
        }
        // Passive skills unlocked at specific levels
        for (const ps of PASSIVE_SKILLS) {
            if (this.level === ps.level && !this.passives.find(p => p.name === ps.name)) {
                this.passives.push({ ...ps });
            }
        }
    }

    // ─── Equipment ───
    equipItem(item) {
        const old = this.equipment[item.slot];
        this.equipment[item.slot] = item;
        if (old) this.inventory.push(old);
        this.hp = Math.min(this.hp, this.maxHp);
        this.mp = Math.min(this.mp, this.maxMp);
    }

    // ─── Mana ───
    useMana(amount) {
        const cost = Math.ceil(amount * this.skillCostMultiplier);
        if (this.mp < cost) return false;
        this.mp -= cost;
        return true;
    }

    regenMana(dt) {
        this.mp = Math.min(this.maxMp, this.mp + this.mpRegen * dt);
    }

    // ─── Regen ───
    regenHp(dt) {
        if (this.hpRegen > 0 && this.hp > 0) {
            this.hp = Math.min(this.maxHp, this.hp + this.maxHp * this.hpRegen * dt);
        }
    }

    // ─── Combat ───
    takeDamage(amount) {
        if (this.invincibleTimer > 0) return 0;
        const reduced = Math.max(1, amount - this.def);
        this.hp -= reduced;
        this.hitFlash = 0.15;
        this.invincibleTimer = 0.3;

        // Cheat death
        if (this.hp <= 0 && this.cheatDeathCooldown <= 0 && this.passives.find(p => p.stat === 'cheatDeath')) {
            this.hp = 1;
            const cdPassive = this.passives.find(p => p.stat === 'cheatDeath');
            this.cheatDeathCooldown = cdPassive.value;
        }
        return reduced;
    }

    attack(targetX, targetY, dt) {
        if (this.attackTimer > 0) return null;
        this.attackTimer = this.attackSpeed;
        const a = angle(this.x, this.y, targetX, targetY);
        this.facingAngle = a;
        return { x: targetX, y: targetY, angle: a, range: this.attackRange };
    }

    performMeleeAttack(enemies, targetX, targetY) {
        const a = angle(this.x, this.y, targetX, targetY);
        const hits = [];
        for (const enemy of enemies) {
            if (!enemy.isDead && meleeHit(this.x, this.y, a, enemy.x, enemy.y, this.attackRange)) {
                const { damage, crit } = calcDamage(this.atk, enemy.def, this.crit, this.critMult);
                hits.push({ enemy, damage, crit });
            }
        }
        return hits;
    }

    useSkill(index, enemies, mouseX, mouseY, game) {
        if (index >= this.skills.length) return null;
        const skill = this.skills[index];
        if (this.skillCooldowns[skill.name] > 0) return null;
        if (!this.useMana(skill.cost)) return null; // Not enough mana

        this.skillCooldowns[skill.name] = skill.cd;
        const result = { skill: skill.name, effects: [] };

        switch (skill.name) {
            case '旋风斩': {
                for (const enemy of enemies) {
                    if (!enemy.isDead && dist(this.x, this.y, enemy.x, enemy.y) < 80) {
                        const { damage, crit } = calcDamage(this.atk * 1.5, enemy.def, this.crit, this.critMult);
                        result.effects.push({ enemy, damage, crit });
                    }
                }
                break;
            }
            case '回血术': {
                const heal = Math.floor(this.maxHp * 0.3);
                this.hp = Math.min(this.maxHp, this.hp + heal);
                result.effects.push({ heal });
                break;
            }
            case '冲刺斩': {
                const a = angle(this.x, this.y, mouseX, mouseY);
                this.isDashing = true;
                this.dashDir = { x: Math.cos(a), y: Math.sin(a) };
                this.dashTimer = 0.15;
                this.invincibleTimer = 0.15;
                const cx = this.x + Math.cos(a) * 60;
                const cy = this.y + Math.sin(a) * 60;
                for (const enemy of enemies) {
                    if (!enemy.isDead && dist(cx, cy, enemy.x, enemy.y) < 60) {
                        const { damage, crit } = calcDamage(this.atk * 2, enemy.def, this.crit, this.critMult);
                        result.effects.push({ enemy, damage, crit });
                    }
                }
                break;
            }
            case '狂暴': {
                this.berserkTimer = 5;
                result.effects.push({ buff: 'berserk' });
                break;
            }
            case '冰霜新星': {
                for (const enemy of enemies) {
                    if (!enemy.isDead && dist(this.x, this.y, enemy.x, enemy.y) < 100) {
                        const { damage, crit } = calcDamage(this.atk * 1.2, enemy.def, this.crit, this.critMult);
                        result.effects.push({ enemy, damage, crit, freeze: true });
                    }
                }
                break;
            }
            case '荆棘光环': {
                this.thornsTimer = 10;
                result.effects.push({ buff: 'thorns' });
                break;
            }
            default: {
                // Generic damage skill
                for (const enemy of enemies) {
                    if (!enemy.isDead && dist(this.x, this.y, enemy.x, enemy.y) < 100) {
                        const { damage, crit } = calcDamage(this.atk * 1.3, enemy.def, this.crit, this.critMult);
                        result.effects.push({ enemy, damage, crit });
                    }
                }
            }
        }
        return result;
    }

    dash() {
        if (this.dashCooldown > 0 || this.isDashing) return false;
        this.isDashing = true;
        this.dashDir = { x: Math.cos(this.facingAngle), y: Math.sin(this.facingAngle) };
        this.dashTimer = 0.15;
        this.dashCooldown = 1.5;
        this.invincibleTimer = 0.15;
        return true;
    }

    // ─── Update ───
    update(dt, input, dungeon) {
        // Timers
        this.attackTimer = Math.max(0, this.attackTimer - dt);
        this.invincibleTimer = Math.max(0, this.invincibleTimer - dt);
        this.dashCooldown = Math.max(0, this.dashCooldown - dt);
        this.hitFlash = Math.max(0, this.hitFlash - dt);
        this.cheatDeathCooldown = Math.max(0, this.cheatDeathCooldown - dt);
        this.berserkTimer = Math.max(0, this.berserkTimer - dt);
        this.thornsTimer = Math.max(0, this.thornsTimer - dt);
        this.animTimer += dt;

        // Cooldowns
        for (const key of Object.keys(this.skillCooldowns)) {
            this.skillCooldowns[key] = Math.max(0, this.skillCooldowns[key] - dt);
        }

        // Regen
        this.regenMana(dt);
        this.regenHp(dt);

        // Dash movement
        if (this.isDashing) {
            this.dashTimer -= dt;
            const dashSpd = 600;
            this.x += this.dashDir.x * dashSpd * dt;
            this.y += this.dashDir.y * dashSpd * dt;
            if (this.dashTimer <= 0) this.isDashing = false;
        } else {
            let mx = 0, my = 0;
            if (input.keys['KeyW'] || input.keys['ArrowUp']) my -= 1;
            if (input.keys['KeyS'] || input.keys['ArrowDown']) my += 1;
            if (input.keys['KeyA'] || input.keys['ArrowLeft']) mx -= 1;
            if (input.keys['KeyD'] || input.keys['ArrowRight']) mx += 1;

            if (mx !== 0 || my !== 0) {
                const len = Math.sqrt(mx * mx + my * my);
                mx /= len;
                my /= len;
                this.facingAngle = Math.atan2(my, mx);
            }

            this.x += mx * this.spd * dt;
            this.y += my * this.spd * dt;
        }

        // Wall collision
        if (dungeon) this.resolveWallCollision(dungeon);
        if (dungeon) {
            this.x = clamp(this.x, 16, dungeon.pixelWidth - 16);
            this.y = clamp(this.y, 16, dungeon.pixelHeight - 16);
        }
    }

    resolveWallCollision(dungeon) {
        const r = this.radius;
        for (const wall of dungeon.wallRects) {
            if (this.x + r > wall.x && this.x - r < wall.x + wall.w &&
                this.y + r > wall.y && this.y - r < wall.y + wall.h) {
                const cx = this.x, cy = this.y;
                const left = (cx + r) - wall.x;
                const right = (wall.x + wall.w) - (cx - r);
                const top = (cy + r) - wall.y;
                const bottom = (wall.y + wall.h) - (cy - r);
                const min = Math.min(left, right, top, bottom);
                if (min === left) this.x = wall.x - r;
                else if (min === right) this.x = wall.x + wall.w + r;
                else if (min === top) this.y = wall.y - r;
                else this.y = wall.y + wall.h + r;
            }
        }
    }
}
