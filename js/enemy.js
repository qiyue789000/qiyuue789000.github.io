import { dist, angle, rand, randFloat, choice } from './utils.js';
import { calcDamage, createProjectile, updateProjectile } from './combat.js';

// AI states
const AI = { IDLE: 'idle', PATROL: 'patrol', CHASE: 'chase', ATTACK: 'attack', DEAD: 'dead' };

export class Enemy {
    constructor(x, y, config) {
        this.x = x;
        this.y = y;
        this.radius = config.radius || 12;
        this.name = config.name || 'Enemy';
        this.type = config.type || 'slime';
        this.maxHp = config.hp || 30;
        this.hp = this.maxHp;
        this.atk = config.atk || 5;
        this._baseDef = config.def || 2;
        this.spd = config.spd || 60;
        this.xpReward = config.xpReward || 10;
        this.goldReward = config.goldReward || rand(3, 8);

        this.state = AI.IDLE;
        this.stateTimer = 0;
        this.patrolTarget = { x, y };
        this.attackCooldown = 0;
        this.attackRange = config.attackRange || 30;
        this.chaseRange = config.chaseRange || 200;
        this.attackSpeed = config.attackSpeed || 1.5;
        this.projectiles = [];
        this.isRanged = config.isRanged || false;
        this.projectileSpeed = config.projectileSpeed || 200;
        this.projectileColor = config.projectileColor || '#f44';
        this.color = config.color || '#4a4';
        this.hitFlash = 0;
        this.animTimer = randFloat(0, Math.PI * 2);
        this.isBoss = config.isBoss || false;

        // Debuffs
        this._stunTimer = 0;
        this._slowTimer = 0;
        this._slowAmount = 0;
        this._tauntTimer = 0;
        this._tauntTarget = null;
        this._defDebuff = 1;
        this._defDebuffTimer = 0;
    }

    get isDead() { return this.hp <= 0; }

    get effectiveSpd() {
        let spd = this.spd;
        if (this._slowTimer > 0) spd *= (1 - this._slowAmount);
        if (this._stunTimer > 0) spd = 0;
        return spd;
    }

    get def() {
        return Math.floor(this._baseDef * (this._defDebuffTimer > 0 ? this._defDebuff : 1));
    }
    set def(v) { this._baseDef = v; }

    takeDamage(amount) {
        this.hp -= amount;
        this.hitFlash = 0.12;
        if (this.isDead) {
            this.state = AI.DEAD;
            return true; // died
        }
        return false;
    }

    update(dt, player, dungeon) {
        if (this.isDead) {
            // Update remaining projectiles
            for (const p of this.projectiles) {
                updateProjectile(p, dt);
            }
            this.projectiles = this.projectiles.filter(p => p.active);
            return;
        }

        this.animTimer += dt;
        this.attackCooldown = Math.max(0, this.attackCooldown - dt);
        this.hitFlash = Math.max(0, this.hitFlash - dt);
        this.stateTimer -= dt;
        this._stunTimer = Math.max(0, this._stunTimer - dt);
        this._slowTimer = Math.max(0, this._slowTimer - dt);
        this._tauntTimer = Math.max(0, this._tauntTimer - dt);
        this._defDebuffTimer = Math.max(0, this._defDebuffTimer - dt);

        const d = dist(this.x, this.y, player.x, player.y);

        // State machine
        switch (this.state) {
            case AI.IDLE:
                if (d < this.chaseRange) {
                    this.state = AI.CHASE;
                } else if (this.stateTimer <= 0) {
                    this.state = AI.PATROL;
                    this.patrolTarget = {
                        x: this.x + rand(-60, 60),
                        y: this.y + rand(-60, 60)
                    };
                    this.stateTimer = rand(1, 3);
                }
                break;

            case AI.PATROL:
                const pd = dist(this.x, this.y, this.patrolTarget.x, this.patrolTarget.y);
                if (pd < 10 || this.stateTimer <= 0) {
                    this.state = AI.IDLE;
                    this.stateTimer = rand(1, 2);
                } else {
                    this.moveToward(this.patrolTarget.x, this.patrolTarget.y, this.effectiveSpd * 0.4, dt);
                }
                if (d < this.chaseRange) this.state = AI.CHASE;
                break;

            case AI.CHASE:
                if (d > this.chaseRange * 1.5) {
                    this.state = AI.IDLE;
                    this.stateTimer = rand(1, 3);
                } else if (d <= this.attackRange) {
                    this.state = AI.ATTACK;
                } else {
                    this.moveToward(player.x, player.y, this.effectiveSpd, dt);
                }
                // Taunt override: move toward taunt target instead of player
                if (this._tauntTimer > 0 && this._tauntTarget && this.state === AI.CHASE) {
                    this.moveToward(this._tauntTarget.x, this._tauntTarget.y, this.effectiveSpd, dt);
                }
                break;

            case AI.ATTACK:
                if (d > this.attackRange * 1.3) {
                    this.state = AI.CHASE;
                } else if (this.attackCooldown <= 0) {
                    this.attackCooldown = this.attackSpeed;
                    return this.performAttack(player);
                }
                // Strafe slightly
                if (this.isRanged && d < this.attackRange * 0.5) {
                    const a = angle(player.x, player.y, this.x, this.y);
                    this.x += Math.cos(a) * this.effectiveSpd * 0.5 * dt;
                    this.y += Math.sin(a) * this.effectiveSpd * 0.5 * dt;
                }
                break;
        }

        // Update projectiles
        for (const p of this.projectiles) {
            updateProjectile(p, dt);
        }
        this.projectiles = this.projectiles.filter(p => p.active);

        return null; // No attack this frame
    }

    moveToward(tx, ty, speed, dt) {
        const a = angle(this.x, this.y, tx, ty);
        this.x += Math.cos(a) * speed * dt;
        this.y += Math.sin(a) * speed * dt;
    }

    performAttack(player) {
        if (this.isRanged) {
            const p = createProjectile(
                this.x, this.y, player.x, player.y,
                this.projectileSpeed, this.atk,
                this.projectileColor, 4
            );
            this.projectiles.push(p);
            return { type: 'ranged', projectile: p };
        } else {
            const { damage, crit } = calcDamage(this.atk, player.def, 0.05);
            return { type: 'melee', damage, crit };
        }
    }

    getAttackDamage(player) {
        if (dist(this.x, this.y, player.x, player.y) > this.attackRange + 8) return null;
        const { damage, crit } = calcDamage(this.atk, player.def, 0.05);
        return { type: 'melee', damage, crit };
    }
}

// --- Specific enemy types ---

export function createSlime(x, y, floor = 1) {
    const scale = 1 + (floor - 1) * 0.15;
    return new Enemy(x, y, {
        name: '史莱姆',
        type: 'slime',
        hp: Math.floor(20 * scale),
        atk: Math.floor(4 * scale),
        def: Math.floor(1 * scale),
        spd: 40 + floor * 2,
        xpReward: Math.floor(8 * scale),
        attackRange: 22,
        chaseRange: 200,
        attackSpeed: 2.0,
        radius: 20,
        color: '#4ecb71',
        attackRange: 36,
        chaseRange: 200
    });
}

export function createSkeleton(x, y, floor = 1) {
    const scale = 1 + (floor - 1) * 0.15;
    return new Enemy(x, y, {
        name: '骷髅兵',
        type: 'skeleton',
        hp: Math.floor(50 * scale),
        atk: Math.floor(8 * scale),
        def: Math.floor(3 * scale),
        spd: 65 + floor * 2,
        xpReward: Math.floor(20 * scale),
        attackRange: 26,
        chaseRange: 220,
        attackSpeed: 1.4,
        radius: 20,
        color: '#ddd'
    });
}

export function createShadowMage(x, y, floor = 1) {
    const scale = 1 + (floor - 1) * 0.15;
    return new Enemy(x, y, {
        name: '暗影法师',
        type: 'shadow_mage',
        hp: Math.floor(35 * scale),
        atk: Math.floor(12 * scale),
        def: Math.floor(2 * scale),
        spd: 50 + floor * 2,
        xpReward: Math.floor(25 * scale),
        attackRange: 100,
        chaseRange: 250,
        attackSpeed: 2.5,
        radius: 18,
        color: '#9b59b6',
        isRanged: true,
        projectileSpeed: 180,
        projectileColor: '#c39bdb'
    });
}

export function createStoneGolem(x, y, floor = 1) {
    const scale = 1 + (floor - 1) * 0.15;
    return new Enemy(x, y, {
        name: '石魔像',
        type: 'stone_golem',
        hp: Math.floor(120 * scale),
        atk: Math.floor(15 * scale),
        def: Math.floor(8 * scale),
        spd: 30 + floor,
        xpReward: Math.floor(50 * scale),
        attackRange: 30,
        chaseRange: 200,
        attackSpeed: 2.8,
        radius: 24,
        color: '#888'
    });
}

export function createBoss(x, y, floor = 1) {
    const scale = floor === 1 ? 0.7 : (1 + (floor - 1) * 0.2);
    const boss = new Enemy(x, y, {
        name: '地牢守卫',
        type: 'boss',
        hp: Math.floor(500 * scale),
        atk: Math.floor(20 * scale),
        def: Math.floor(6 * scale),
        spd: 50 + floor * 3,
        xpReward: Math.floor(200 * scale),
        attackRange: 36,
        chaseRange: 400,
        attackSpeed: 1.5,
        radius: 34,
        color: '#e74c3c',
        isBoss: true
    });
    boss.phase = 1;
    boss.phaseThreshold = 0.5; // Switch phase at 50% HP
    return boss;
}

// Choose enemies for a room based on type and floor
export function spawnEnemiesForRoom(room, floor) {
    const enemies = [];
    const pos = room.randomPosition;

    switch (room.type) {
        case 'battle': {
            const count = floor === 1 ? rand(1, 2) : rand(1, 2 + Math.floor(floor / 4));
            for (let i = 0; i < count; i++) {
                const p = room.randomPosition;
                const roll = Math.random();
                if (roll < 0.35) enemies.push(createSlime(p.x, p.y, floor));
                else if (roll < 0.65) enemies.push(createSkeleton(p.x, p.y, floor));
                else if (roll < 0.85) enemies.push(createShadowMage(p.x, p.y, floor));
                else enemies.push(createStoneGolem(p.x, p.y, floor));
            }
            break;
        }
        case 'treasure': {
            // 1-2 tougher enemies guarding treasure
            const count = rand(1, 2);
            for (let i = 0; i < count; i++) {
                const p = room.randomPosition;
                enemies.push(createStoneGolem(p.x, p.y, floor));
            }
            break;
        }
        case 'boss': {
            const p = room.randomPosition;
            enemies.push(createBoss(p.x, p.y, floor));
            // Add some minions
            for (let i = 0; i < 2; i++) {
                const mp = room.randomPosition;
                enemies.push(createSkeleton(mp.x, mp.y, floor));
            }
            break;
        }
        case 'shop':
            // No enemies in shop
            break;
        case 'start':
            // No enemies in start room
            break;
    }

    room.enemies = enemies;
    return enemies;
}
