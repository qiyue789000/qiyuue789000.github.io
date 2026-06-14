import { dist, angle, rand, randFloat } from './utils.js';

export function calcDamage(atk, def, critChance = 0, critMult = 1.5) {
    const isCrit = Math.random() < critChance;
    const base = atk * randFloat(0.9, 1.1);
    const reduced = Math.max(1, base - def * 0.5);
    const final = Math.floor(isCrit ? reduced * critMult : reduced);
    return { damage: final, crit: isCrit };
}

export function createProjectile(x, y, targetX, targetY, speed, damage, color = '#ff0', size = 4) {
    const a = angle(x, y, targetX, targetY);
    return {
        x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        damage, color, size, life: 120, maxLife: 120, active: true
    };
}

export function updateProjectile(p, dt) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) p.active = false;
}

// Check if point (px, py) is within range of (tx, ty) for an attack
export function inAttackRange(ax, ay, tx, ty, range) {
    return dist(ax, ay, tx, ty) <= range;
}

// Melee attack arc check
export function meleeHit(attackerX, attackerY, attackAngle, targetX, targetY, range, arcAngle = Math.PI / 3) {
    const d = dist(attackerX, attackerY, targetX, targetY);
    if (d > range) return false;
    const a = angle(attackerX, attackerY, targetX, targetY);
    let diff = a - attackAngle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return Math.abs(diff) <= arcAngle;
}
