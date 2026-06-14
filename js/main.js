import { Player } from './player.js';
import { Dungeon } from './dungeon.js';
import { spawnEnemiesForRoom } from './enemy.js';
import { updateProjectile, inAttackRange } from './combat.js';
import { generateDrop, generateItem } from './items.js';
import { Renderer } from './renderer.js';
import { ParticleSystem, RingParticle } from './particles.js';
import { UI } from './ui.js';
import { dist, angle, clamp } from './utils.js';

class Input {
    constructor(canvas) {
        this.keys = {};
        this.mouse = { x: 0, y: 0, down: false, worldX: 0, worldY: 0, rightDown: false };
        this.justPressed = {};

        window.addEventListener('keydown', e => {
            if (!this.keys[e.code]) this.justPressed[e.code] = true;
            this.keys[e.code] = true;
        });
        window.addEventListener('keyup', e => { this.keys[e.code] = false; });

        canvas.addEventListener('mousemove', e => {
            const rect = canvas.getBoundingClientRect();
            this.mouse.x = e.clientX - rect.left;
            this.mouse.y = e.clientY - rect.top;
        });
        canvas.addEventListener('mousedown', e => {
            if (e.button === 0) this.mouse.down = true;
            if (e.button === 2) this.mouse.rightDown = true;
        });
        canvas.addEventListener('mouseup', e => {
            if (e.button === 0) this.mouse.down = false;
            if (e.button === 2) this.mouse.rightDown = false;
        });
        canvas.addEventListener('contextmenu', e => e.preventDefault());
    }

    update(camera) {
        this.mouse.worldX = this.mouse.x + camera.x;
        this.mouse.worldY = this.mouse.y + camera.y;
    }

    consumeJustPressed() {
        const result = { ...this.justPressed };
        this.justPressed = {};
        return result;
    }
}

class Game {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.canvas.width = 1024;
        this.canvas.height = 768;

        this.input = new Input(this.canvas);
        this.renderer = new Renderer(this.canvas);
        this.particles = new ParticleSystem();
        this.ui = new UI();

        this.player = null;
        this.dungeon = null;
        this.enemies = [];
        this.allProjectiles = [];
        this.damageNumbers = [];
        this.gameOver = false;
        this.currentRoom = null;

        // Timing
        this.lastTime = performance.now();
        this.fps = 60;
        this.fpsTimer = 0;
        this.fpsFrames = 0;

        // Pickup items on ground
        this.groundItems = [];

        this.init();
    }

    init() {
        this.dungeon = new Dungeon(1);
        const startPos = this.dungeon.startRoom.randomPosition;
        this.player = new Player(startPos.x, startPos.y);
        this.player.gold = 50; // Starting gold
        this.enemies = [];
        this.allProjectiles = [];
        this.damageNumbers = [];
        this.groundItems = [];
        this.gameOver = false;
        this.currentRoom = this.dungeon.startRoom;
        this.dungeon.startRoom.visited = true;
        this.dungeon.currentRoom = this.dungeon.startRoom;
        this.ui.hideGameOver();
        this.ui.setPlayerRef(this.player);
        this.ui.showFloorIndicator(1);

        // Give starter weapon
        this.player.equipItem(generateItem(1, 'weapon'));
    }

    start() {
        this.lastTime = performance.now();
        this.loop(this.lastTime);
    }

    loop(timestamp) {
        const rawDt = (timestamp - this.lastTime) / 1000;
        const dt = Math.min(rawDt, 0.1); // Cap delta to avoid spiral of death
        this.lastTime = timestamp;

        // FPS counter
        this.fpsFrames++;
        this.fpsTimer += rawDt;
        if (this.fpsTimer >= 0.5) {
            this.fps = Math.round(this.fpsFrames / this.fpsTimer);
            this.fpsFrames = 0;
            this.fpsTimer = 0;
        }

        if (!this.gameOver) {
            this.update(dt);
        }

        this.render(dt);
        requestAnimationFrame((t) => this.loop(t));
    }

    update(dt) {
        // Update input world coords
        this.input.update(this.renderer.camera);

        // Update player
        this.player.update(dt, this.input, this.dungeon);

        // Update renderer (camera + screenshake)
        this.renderer.updateCamera(this.player);
        this.renderer.update(dt);

        // Check current room
        const room = this.dungeon.getRoomAt(this.player.x, this.player.y);
        if (room && room !== this.currentRoom) {
            this.onEnterRoom(room);
        }
        this.currentRoom = room;
        if (room) this.dungeon.currentRoom = room;

        // Handle inputs
        const justPressed = this.input.consumeJustPressed();

        // Attack
        if (this.input.mouse.down) {
            const result = this.player.attack(this.input.mouse.worldX, this.input.mouse.worldY, dt);
            if (result) {
                const hits = this.player.performMeleeAttack(this.enemies, this.input.mouse.worldX, this.input.mouse.worldY);
                for (const hit of hits) {
                    const died = hit.enemy.takeDamage(hit.damage);
                    this.damageNumbers.push({
                        x: hit.enemy.x, y: hit.enemy.y,
                        amount: hit.damage, crit: hit.crit,
                        life: 0.8
                    });
                    this.particles.emitHit(hit.enemy.x, hit.enemy.y);
                    if (hit.crit) {
                        this.particles.emitCritHit(hit.enemy.x, hit.enemy.y);
                        this.renderer.screenShake(3, 0.1);
                    }
                    if (died) {
                        this.onEnemyKilled(hit.enemy);
                    }
                }
            }
        }

        // Skills (B, N, M keys)
        const skillKeys = ['KeyB', 'KeyN', 'KeyM'];
        for (let i = 0; i < skillKeys.length; i++) {
            if (justPressed[skillKeys[i]]) {
                this.useSkill(i);
            }
        }

        // Shop interaction
        if (justPressed['KeyE']) {
            if (this.currentRoom && this.currentRoom.type === 'shop') {
                this.ui.showShop(this.player, this.dungeon.floor);
            }
        }

        // Dash
        if (justPressed['Space']) {
            if (this.player.dash()) {
                this.particles.emit(this.player.x, this.player.y, 6, {
                    speed: [20, 60], life: [0.2, 0.4], color: '#3498db', size: [2, 4]
                });
            }
        }

        // Inventory toggle
        if (justPressed['KeyI']) {
            this.ui.showInventory(this.player);
        }

        // Update enemies
        for (const enemy of this.enemies) {
            const attackResult = enemy.update(dt, this.player, this.dungeon);
            if (attackResult) {
                if (attackResult.type === 'melee') {
                    const dmg = this.player.takeDamage(attackResult.damage);
                    if (dmg > 0) {
                        this.renderer.flashScreen('#f44', 0.08);
                        this.damageNumbers.push({
                            x: this.player.x, y: this.player.y,
                            amount: dmg, crit: attackResult.crit,
                            life: 0.8
                        });
                        this.particles.emitHit(this.player.x, this.player.y);
                    }
                    if (this.player.isDead) {
                        this.gameOver = true;
                        this.ui.showGameOver(this.player, this.dungeon);
                        this.particles.emitDeath(this.player.x, this.player.y, '#e74c3c');
                    }
                }
            }
        }

        // Collect all projectiles (enemy projectiles)
        this.allProjectiles = [];
        for (const enemy of this.enemies) {
            for (const p of enemy.projectiles) {
                this.allProjectiles.push(p);
            }
        }

        // Update projectiles & check player hits
        for (const p of this.allProjectiles) {
            updateProjectile(p, dt);
            if (p.active && dist(p.x, p.y, this.player.x, this.player.y) < this.player.radius + p.size) {
                const dmg = this.player.takeDamage(p.damage);
                if (dmg > 0) {
                    this.renderer.flashScreen('#f44', 0.06);
                    this.damageNumbers.push({
                        x: this.player.x, y: this.player.y,
                        amount: dmg, crit: false, life: 0.8
                    });
                    this.particles.emitHit(this.player.x, this.player.y);
                }
                p.active = false;
                if (this.player.isDead) {
                    this.gameOver = true;
                    this.ui.showGameOver(this.player, this.dungeon);
                    this.particles.emitDeath(this.player.x, this.player.y, '#e74c3c');
                }
            }
        }

        // Update damage numbers
        for (const dn of this.damageNumbers) {
            dn.life -= dt;
            dn.y -= 30 * dt;
        }
        this.damageNumbers = this.damageNumbers.filter(dn => dn.life > 0);

        // Update particles
        this.particles.update(dt);

        // Pickup ground items
        for (let i = this.groundItems.length - 1; i >= 0; i--) {
            const item = this.groundItems[i];
            if (dist(this.player.x, this.player.y, item.x, item.y) < 30) {
                this.player.inventory.push(item.item);
                this.particles.emit(item.x, item.y, 8, {
                    speed: [20, 60], life: [0.3, 0.6], color: item.item.color, size: [2, 4]
                });
                this.groundItems.splice(i, 1);
            }
        }

        // Update UI
        this.ui.updateHUD(this.player, this.dungeon, this.currentRoom, this.fps);
    }

    useSkill(index) {
        const result = this.player.useSkill(index, this.enemies, this.input.mouse.worldX, this.input.mouse.worldY, this);
        if (!result) return;
        for (const eff of result.effects) {
            if (eff.heal) {
                this.particles.emitHeal(this.player.x, this.player.y);
            } else if (eff.enemy) {
                const died = eff.enemy.takeDamage(eff.damage);
                this.damageNumbers.push({
                    x: eff.enemy.x, y: eff.enemy.y,
                    amount: eff.damage, crit: eff.crit, life: 0.8
                });
                if (eff.crit) {
                    this.particles.emitCritHit(eff.enemy.x, eff.enemy.y);
                    this.renderer.screenShake(3, 0.1);
                } else {
                    this.particles.emitHit(eff.enemy.x, eff.enemy.y);
                }
                if (died) this.onEnemyKilled(eff.enemy);
            }
        }
    }

    onEnterRoom(room) {
        if (room.visited) return;
        room.visited = true;
        this.dungeon.currentRoom = room;

        const enemies = spawnEnemiesForRoom(room, this.dungeon.floor);
        this.enemies.push(...enemies);
    }

    onEnemyKilled(enemy) {
        this.particles.emitDeath(enemy.x, enemy.y, enemy.color);

        // Boss death special effects
        if (enemy.isBoss) {
            this.renderer.screenShake(12, 0.6);
            this.renderer.flashScreen('#fff', 0.15);
            this.particles.emit(enemy.x, enemy.y, 60, {
                speed: [60, 250], life: [0.5, 1.8], color: '#f1c40f', size: [3, 12], gravity: 120
            });
            // Multiple expanding rings
            this.particles.particles.push(new RingParticle(enemy.x, enemy.y, 0, 150, 0.6, '#f1c40f'));
            this.particles.particles.push(new RingParticle(enemy.x, enemy.y, 0, 120, 0.4, '#e74c3c'));
            this.particles.particles.push(new RingParticle(enemy.x, enemy.y, 0, 80, 0.3, '#fff'));
            // Clear boss room and progress to next floor
            const bossRoom = this.dungeon.getRoomAt(enemy.x, enemy.y);
            if (bossRoom) bossRoom.cleared = true;
            // Go to next floor after short delay
            setTimeout(() => this.nextFloor(), 1500);
        }

        // XP and gold
        const leveledUp = this.player.gainXp(enemy.xpReward);
        this.player.gold += enemy.goldReward;

        if (leveledUp) {
            this.particles.emitLevelUp(this.player.x, this.player.y);
            this.renderer.screenShake(4, 0.3);
            this.ui.showLevelUp(this.player.level);
        }

        // Drop items
        const drop = generateDrop(this.dungeon.floor);
        this.player.gold += drop.gold;
        for (const item of drop.items) {
            this.groundItems.push({ x: enemy.x + (Math.random() - 0.5) * 40, y: enemy.y + (Math.random() - 0.5) * 40, item });
        }

        // Check room cleared
        const room = this.dungeon.getRoomAt(enemy.x, enemy.y);
        if (room) {
            room.enemies = room.enemies.filter(e => !e.isDead);
            if (room.enemies.length === 0) {
                room.cleared = true;
            }
        }

        // Remove from enemies list
        this.enemies = this.enemies.filter(e => e !== enemy);
    }

    nextFloor() {
        const nextFloor = this.dungeon.floor + 1;
        this.dungeon = new Dungeon(nextFloor);
        const startPos = this.dungeon.startRoom.randomPosition;
        this.player.x = startPos.x;
        this.player.y = startPos.y;
        this.enemies = [];
        this.allProjectiles = [];
        this.groundItems = [];
        this.damageNumbers = [];
        this.currentRoom = this.dungeon.startRoom;
        this.dungeon.startRoom.visited = true;
        this.dungeon.currentRoom = this.dungeon.startRoom;
        this.ui.showFloorIndicator(nextFloor);

        // Heal 20% HP and 40% MP on floor transition
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + Math.floor(this.player.maxHp * 0.2));
        this.player.mp = Math.min(this.player.maxMp, this.player.mp + Math.floor(this.player.maxMp * 0.4));
    }

    render(dt) {
        this.renderer.clear();
        this.renderer.drawDungeon(this.dungeon);

        // Draw ground items
        for (const gi of this.groundItems) {
            const ix = gi.x - this.renderer.sx;
            const iy = gi.y - this.renderer.sy;
            const bob = Math.sin(Date.now() / 300 + gi.x) * 1;
            const glowColors = { COMMON: '#aaa', RARE: '#3498db', EPIC: '#9b59b6', LEGENDARY: '#e67e22' };
            const glowColor = glowColors[gi.item.rarity] || '#fff';
            // Glow
            this.renderer.ctx.fillStyle = gi.item.color + '44';
            this.renderer.ctx.beginPath();
            this.renderer.ctx.arc(ix, iy + bob, 10, 0, Math.PI * 2);
            this.renderer.ctx.fill();
            // Item diamond shape
            this.renderer.ctx.fillStyle = gi.item.color;
            this.renderer.ctx.save();
            this.renderer.ctx.translate(ix, iy + bob);
            this.renderer.ctx.rotate(Math.PI / 4);
            this.renderer.ctx.fillRect(-5, -5, 10, 10);
            this.renderer.ctx.restore();
            // Sparkle
            this.renderer.ctx.fillStyle = '#fff';
            this.renderer.ctx.fillRect(ix - 1, iy + bob - 1, 2, 2);
            // Label
            this.renderer.ctx.font = '9px monospace';
            this.renderer.ctx.fillStyle = glowColor;
            this.renderer.ctx.textAlign = 'center';
            this.renderer.ctx.fillText(gi.item.name, ix, iy - 12 + bob);
            this.renderer.ctx.textAlign = 'start';
        }

        // Draw enemies
        for (const enemy of this.enemies) {
            this.renderer.drawEnemy(enemy);
        }

        // Draw player
        if (!this.gameOver) {
            this.renderer.drawPlayer(this.player);
            this.renderer.drawAttackSlash(this.player);
        }

        // Draw projectiles
        this.renderer.drawProjectiles(this.allProjectiles);

        // Draw damage numbers
        for (const dn of this.damageNumbers) {
            this.renderer.drawDamageNumber(dn.x, dn.y, dn.amount, dn.crit);
        }

        // Draw particles
        this.particles.draw(this.renderer.ctx, this.renderer.camera);

        // Draw vignette
        this.renderer.drawVignette();

        // Draw minimap
        this.renderer.drawMinimap(this.dungeon, this.player);
    }
}

// Start the game
const gameCanvas = document.getElementById('game-canvas');
if (gameCanvas) {
    const game = new Game();
    game.start();
}
