import { xpForLevel, clamp, angle, dist } from './utils.js';
import { calcDamage, meleeHit } from './combat.js';
import { getClassDef } from './classes.js';
import { ALL_SKILLS_BY_ID, SHARED_ACTIVE_SKILLS, CLASS_ACTIVE_SKILLS, SHARED_PASSIVE_SKILLS, CLASS_PASSIVE_SKILLS } from './skills.js';

export class Player {
    constructor(x, y, classId = 'human') {
        const classDef = getClassDef(classId);
        this.classId = classId;
        this.classDef = classDef;
        this.x = x;
        this.y = y;
        this.radius = 14;
        this.level = 1;
        this.xp = 0;
        this.gold = 0;

        // Base stats from class definition
        const bs = classDef.baseStats;
        this.baseMaxHp = bs.maxHp;
        this.baseMaxMp = bs.maxMp;
        this.baseAtk = bs.atk;
        this.baseDef = bs.def;
        this.baseSpd = bs.spd;
        this.baseCrit = bs.crit;
        this.baseMpRegen = bs.mpRegen;
        this.critMult = bs.critMult;
        this.attackRange = bs.attackRange;
        this.attackSpeed = bs.attackSpeed;
        this.statGrowth = classDef.statGrowth;

        // Equipment (7 slots) - MUST be before hp/mp getters
        this.equipment = { weapon: null, helmet: null, armor: null, boots: null, gloves: null, amulet: null, ring: null };
        this.inventory = [];

        // Skills - MUST be before hp/mp getters
        this.skills = [];         // Active skills
        this.passives = [];       // Passive skills
        this.skillCooldowns = {};

        // Now safe to call getters
        this.hp = this.maxHp;
        this.mp = this.maxMp;

        // Grant starting class skills at level 1
        this._grantStartingSkills();

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

        // Auto-move (right-click pathfinding)
        this.autoMoveTarget = null;
        this.autoMoveActive = false;

        // Class-specific passive states
        this._battleCryTimer = 0;
        this._shieldHp = 0;
        this._shieldTimer = 0;
        this._ironFortressTimer = 0;
        this._purificationTimer = 0;
        this._smokeTimer = 0;
        this._nextAttackBonus = 1;
        this._holyNovaTimer = 0;
        this._unyieldingCooldown = 0;
        this._lastX = x;
        this._lastY = y;
        this._stationaryTime = 0;
        this._blockCooldown = 0;
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
        const base = this.baseMaxHp + (this.level - 1) * this.statGrowth.maxHp + this._equipStatSum('maxHp');
        return Math.floor(base * this._getPassiveMultiplier('maxHp'));
    }

    get maxMp() {
        const base = this.baseMaxMp + (this.level - 1) * this.statGrowth.maxMp + this._equipStatSum('maxMp');
        return Math.floor(base * this._getPassiveMultiplier('maxMp'));
    }

    get atk() {
        const base = this.baseAtk + (this.level - 1) * this.statGrowth.atk + this._equipStatSum('atk');
        let val = Math.floor(base * this._getPassiveMultiplier('atk') + this._getPassiveFlat('atk'));
        if (this.berserkTimer > 0) val = Math.floor(val * 2);
        if (this._nextAttackBonus > 1) val = Math.floor(val * this._nextAttackBonus);
        return val;
    }

    get def() {
        const base = this.baseDef + (this.level - 1) * this.statGrowth.def + this._equipStatSum('def');
        let val = Math.floor(base * this._getPassiveMultiplier('def') + this._getPassiveFlat('def'));
        if (this._ironFortressTimer > 0) val = Math.floor(val * 1.6);
        if (this._shieldWallActive) val = Math.floor(val * 1.3);
        return val;
    }

    get spd() {
        const base = this.baseSpd + this._equipStatSum('spd');
        return base * this._getPassiveMultiplier('spd') + this._getPassiveFlat('spd');
    }

    get crit() {
        return Math.min(0.85, this.baseCrit + (this.level - 1) * this.statGrowth.crit + this._equipStatSum('crit') + this._getPassiveFlat('crit'));
    }

    get mpRegen() {
        const base = this.baseMpRegen + this._equipStatSum('mpRegen');
        let val = base * this._getPassiveMultiplier('mpRegen');
        if (this._arcaneIntellectBonus) val *= 1.25;
        return val;
    }

    get _shieldWallActive() {
        const p = this.passives.find(p => p.id === 'shield_wall');
        return p && this._stationaryTime >= 1;
    }

    get _arcaneIntellectBonus() {
        return this.passives.some(p => p.id === 'arcane_intellect');
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

    _grantStartingSkills() {
        const cd = this.classDef;
        // Grant first class active skill
        const classActives = cd.uniqueActiveSkillIds.map(id => ALL_SKILLS_BY_ID[id]).filter(Boolean);
        if (classActives.length > 0) {
            const firstSkill = classActives[0];
            this.skills.push({ ...firstSkill, level: 1 });
            this.skillCooldowns[firstSkill.name] = 0;
        }
        // Grant first class passive
        const classPassives = CLASS_PASSIVE_SKILLS[this.classId] || [];
        if (classPassives.length > 0) {
            this.passives.push({ ...classPassives[0] });
        }
    }

    unlockSkills() {
        const cd = this.classDef;
        // --- Class-specific active skills ---
        const classActives = cd.uniqueActiveSkillIds.map(id => ALL_SKILLS_BY_ID[id]).filter(Boolean);
        // Unlock schedule: level 1, 8, 18 for class skills
        const classUnlockLevels = [1, 8, 18];
        for (let i = 0; i < classActives.length; i++) {
            if (this.level === classUnlockLevels[i] && !this.skills.find(s => s.name === classActives[i].name)) {
                this.skills.push({ ...classActives[i], level: this.level });
                this.skillCooldowns[classActives[i].name] = 0;
            }
        }
        // --- Shared active skills ---
        // Unlock every 10 levels starting at level 10
        if (this.level % 10 === 0 && this.level <= 90) {
            const forbidden = cd.forbiddenSharedActives || [];
            const currentNames = new Set(this.skills.map(s => s.name));
            const available = SHARED_ACTIVE_SKILLS.filter(s => !forbidden.includes(s.id) && !currentNames.has(s.name));
            if (available.length > 0) {
                const skill = available[(Math.floor(this.level / 10) - 1) % available.length];
                this.skills.push({ ...skill, level: this.level });
                this.skillCooldowns[skill.name] = 0;
            }
        }
        // --- Class-specific passives ---
        const classPassives = CLASS_PASSIVE_SKILLS[this.classId] || [];
        for (const cp of classPassives) {
            if (this.level === cp.level && !this.passives.find(p => p.name === cp.name)) {
                this.passives.push({ ...cp });
            }
        }
        // --- Shared passives ---
        const forbiddenPs = cd.forbiddenSharedPassives || [];
        for (const ps of SHARED_PASSIVE_SKILLS) {
            if (forbiddenPs.includes(ps.id)) continue;
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
        if (this.invincibleTimer > 0 || this._smokeTimer > 0) return 0;

        // Knight block chance
        const blockPsv = this.passives.find(p => p.id === 'block');
        if (blockPsv && Math.random() < blockPsv.value && this._blockCooldown <= 0) {
            this._blockCooldown = 0.5;
            this._counterDmg = 0;
            const counterPsv = this.passives.find(p => p.id === 'counter');
            if (counterPsv) this._counterDmg = Math.floor(this.atk * counterPsv.value);
            return 0;
        }

        // Guardian shield absorption
        let remaining = amount;
        if (this._shieldHp > 0 && this._shieldTimer > 0) {
            const absorbed = Math.min(this._shieldHp, remaining);
            this._shieldHp -= absorbed;
            remaining -= absorbed;
            if (remaining <= 0) return 0;
        }

        // Mana shield (mage)
        const manaShieldPsv = this.passives.find(p => p.id === 'mana_shield');
        if (manaShieldPsv && this.mp > 0) {
            const manaAbsorb = Math.min(this.mp, Math.floor(remaining * manaShieldPsv.value));
            this.mp -= manaAbsorb;
            remaining -= manaAbsorb;
        }

        // Normal defense reduction
        const reduced = Math.max(1, remaining - this.def);
        this.hp -= reduced;
        this.hitFlash = 0.15;
        this.invincibleTimer = 0.3;

        // Cheat death
        if (this.hp <= 0 && this.cheatDeathCooldown <= 0 && this.passives.find(p => p.stat === 'cheatDeath')) {
            this.hp = 1;
            const cdPassive = this.passives.find(p => p.stat === 'cheatDeath');
            this.cheatDeathCooldown = cdPassive.value;
        }

        // Unyielding check (human passive)
        if (this.hp > 0 && this.hp / this.maxHp < 0.2 && this._unyieldingCooldown <= 0 && this.passives.find(p => p.id === 'unyielding')) {
            const unyPassive = this.passives.find(p => p.id === 'unyielding');
            this._unyieldingCooldown = unyPassive.value;
            // Buff applied via def getter and atk getter checks
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

        // Check mana cost (with skill cost multiplier)
        const cost = Math.ceil(skill.cost * this.skillCostMultiplier);
        if (this.mp < cost) return null;
        this.mp -= cost;

        this.skillCooldowns[skill.name] = skill.cd;

        // Dispatch to skill's execute function
        const skillDef = ALL_SKILLS_BY_ID[skill.id];
        if (!skillDef || !skillDef.execute) return null;

        return skillDef.execute(this, enemies, mouseX, mouseY, game);
    }

    usePotion(item) {
        if (!item || item.type !== 'consumable') return false;
        if (item.subType === 'hp') {
            const heal = Math.floor(this.maxHp * item.healPercent);
            this.hp = Math.min(this.maxHp, this.hp + heal);
            return true;
        }
        if (item.subType === 'mp') {
            const restore = Math.floor(this.maxMp * item.manaPercent);
            this.mp = Math.min(this.maxMp, this.mp + restore);
            return true;
        }
        return false;
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

        // Class passive timers
        this._battleCryTimer = Math.max(0, this._battleCryTimer - dt);
        this._shieldTimer = Math.max(0, this._shieldTimer - dt);
        this._ironFortressTimer = Math.max(0, this._ironFortressTimer - dt);
        this._purificationTimer = Math.max(0, this._purificationTimer - dt);
        this._smokeTimer = Math.max(0, this._smokeTimer - dt);
        if (this._smokeTimer <= 0) this._nextAttackBonus = 1;
        this._blockCooldown = Math.max(0, this._blockCooldown - dt);
        this._unyieldingCooldown = Math.max(0, this._unyieldingCooldown - dt);
        this._holyNovaTimer += dt;
        const holyNovaPsv = this.passives.find(p => p.id === 'holy_nova');
        if (holyNovaPsv && this._holyNovaTimer >= holyNovaPsv.value) {
            this._holyNovaTimer = 0;
            this.hp = Math.min(this.maxHp, this.hp + Math.floor(this.maxHp * 0.1));
            // Damage nearby enemies handled in main.js via player._holyNovaTrigger
            this._holyNovaTrigger = true;
        }
        // Stationary detection for shield wall
        const dx = this.x - this._lastX;
        const dy = this.y - this._lastY;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
            this._stationaryTime += dt;
        } else {
            this._stationaryTime = 0;
        }
        this._lastX = this.x;
        this._lastY = this.y;

        // Purification aura triggers
        if (this._purificationTimer > 0) this._purificationActive = true;
        // Battle cry buff for atk
        if (this._battleCryTimer > 0) this._battleCryActive = true;
        else this._battleCryActive = false;

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

            // Auto-move towards right-click target
            if (mx === 0 && my === 0 && this.autoMoveActive && this.autoMoveTarget) {
                const dx = this.autoMoveTarget.x - this.x;
                const dy = this.autoMoveTarget.y - this.y;
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d < 8) {
                    // Reached destination
                    this.autoMoveActive = false;
                    this.autoMoveTarget = null;
                } else {
                    mx = dx / d;
                    my = dy / d;
                }
            }

            if (mx !== 0 || my !== 0) {
                const len = Math.sqrt(mx * mx + my * my);
                mx /= len;
                my /= len;
                this.facingAngle = Math.atan2(my, mx);
            }

            const moveSpd = (this.autoMoveActive && !input.keys['KeyW'] && !input.keys['KeyA'] && !input.keys['KeyS'] && !input.keys['KeyD'] &&
                !input.keys['ArrowUp'] && !input.keys['ArrowDown'] && !input.keys['ArrowLeft'] && !input.keys['ArrowRight'])
                ? this.spd * 1.15 : this.spd;
            this.x += mx * moveSpd * dt;
            this.y += my * moveSpd * dt;
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
