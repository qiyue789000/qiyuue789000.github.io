import { randFloat, rand, rgb, hsl } from './utils.js';

export class Particle {
    constructor(x, y, vx, vy, life, color, size = 3) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.life = life;
        this.maxLife = life;
        this.color = color;
        this.size = size;
        this.active = true;
        this.gravity = 0;
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.vy += this.gravity * dt;
        this.life -= dt;
        if (this.life <= 0) this.active = false;
    }

    get alpha() {
        return Math.max(0, this.life / this.maxLife);
    }
}

// Expanding ring particle (for death/hit effects)
export class RingParticle {
    constructor(x, y, startRadius, endRadius, life, color) {
        this.x = x;
        this.y = y;
        this.radius = startRadius;
        this.endRadius = endRadius;
        this.life = life;
        this.maxLife = life;
        this.color = color;
        this.active = true;
    }
    update(dt) {
        this.life -= dt;
        const progress = 1 - this.life / this.maxLife;
        this.radius = this.endRadius * progress;
        if (this.life <= 0) this.active = false;
    }
    get alpha() { return Math.max(0, this.life / this.maxLife); }
}

export class ParticleSystem {
    constructor() {
        this.particles = [];
        this.scale = 0.55; // Global particle reduction
    }

    emit(x, y, count, config = {}) {
        const {
            speed = [30, 120],
            life = [0.3, 0.8],
            color = '#fff',
            size = [2, 5],
            gravity = 0,
            spread = Math.PI * 2
        } = config;

        for (let i = 0; i < count; i++) {
            const a = randFloat(0, spread);
            const s = randFloat(speed[0], speed[1]);
            const l = randFloat(life[0], life[1]);
            const sz = randFloat(size[0], size[1]);
            const p = new Particle(x, y, Math.cos(a) * s, Math.sin(a) * s, l, color, sz);
            p.gravity = gravity;
            this.particles.push(p);
        }
    }

    emitHit(x, y) {
        this.emit(x, y, Math.floor(4 * this.scale * 1.8), {
            speed: [40, 150],
            life: [0.2, 0.5],
            color: '#ff4444',
            size: [2, 5],
            spread: Math.PI * 0.8
        });
    }

    emitDeath(x, y, color = '#ff0') {
        this.emit(x, y, Math.floor(12 * this.scale * 1.8), {
            speed: [30, 200],
            life: [0.3, 0.9],
            color,
            size: [2, 7],
            gravity: 100
        });
        this.emit(x, y, Math.floor(6 * this.scale * 1.8), {
            speed: [80, 220],
            life: [0.15, 0.35],
            color: '#fff',
            size: [1, 3],
            gravity: 0
        });
        this.particles.push(new RingParticle(x, y, 0, 80, 0.4, color));
    }

    emitCritHit(x, y) {
        this.emit(x, y, Math.floor(8 * this.scale * 1.8), {
            speed: [60, 200],
            life: [0.2, 0.5],
            color: '#f1c40f',
            size: [2, 6],
            gravity: 0
        });
        this.particles.push(new RingParticle(x, y, 0, 50, 0.3, '#f1c40f'));
    }

    emitLevelUp(x, y) {
        this.emit(x, y, Math.floor(30 * this.scale * 1.8), {
            speed: [50, 200],
            life: [0.5, 1.2],
            color: '#f1c40f',
            size: [2, 7],
            spread: Math.PI * 2
        });
    }

    emitHeal(x, y) {
        this.emit(x, y, Math.floor(6 * this.scale * 1.8), {
            speed: [20, 80],
            life: [0.4, 0.9],
            color: '#2ecc71',
            size: [2, 5],
            gravity: -30
        });
    }

    update(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            this.particles[i].update(dt);
            if (!this.particles[i].active) {
                this.particles.splice(i, 1);
            }
        }
    }

    draw(ctx, camera) {
        for (const p of this.particles) {
            if (p instanceof RingParticle) {
                ctx.globalAlpha = p.alpha * 0.6;
                ctx.strokeStyle = p.color;
                ctx.lineWidth = 3 * p.alpha;
                ctx.beginPath();
                ctx.arc(p.x - camera.x, p.y - camera.y, p.radius, 0, Math.PI * 2);
                ctx.stroke();
                ctx.lineWidth = 1;
            } else {
                ctx.globalAlpha = p.alpha;
                ctx.fillStyle = p.color;
                ctx.fillRect(
                    p.x - camera.x - p.size / 2,
                    p.y - camera.y - p.size / 2,
                    p.size, p.size
                );
            }
        }
        ctx.globalAlpha = 1;
    }
}
