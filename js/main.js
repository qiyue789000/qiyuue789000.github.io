import { Player } from './player.js';
import { Dungeon } from './dungeon.js';
import { spawnEnemiesForRoom } from './enemy.js';
import { calcDamage, updateProjectile, inAttackRange } from './combat.js';
import { generateDrop, generateItem, createHpPotion } from './items.js';
import { ProfileManager } from './profile.js';
import { ChatService } from './chat.js';
import { Renderer } from './renderer.js';
import { ParticleSystem, RingParticle } from './particles.js';
import { UI } from './ui.js';
import { dist, angle, clamp } from './utils.js';

class Input {
    constructor(canvas) {
        this.keys = {};
        this.mouse = { x: 0, y: 0, down: false, worldX: 0, worldY: 0, rightDown: false, rightWorldX: 0, rightWorldY: 0 };
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
            if (e.button === 2) {
                this.mouse.rightDown = true;
                // Store right-click screen position for pathfinding
                const rect = canvas.getBoundingClientRect();
                this.mouse._rightClickScreenX = e.clientX - rect.left;
                this.mouse._rightClickScreenY = e.clientY - rect.top;
                this.mouse._justRightClicked = true;
            }
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
        // Convert right-click screen pos to world
        if (this.mouse._justRightClicked) {
            this.mouse.rightWorldX = this.mouse._rightClickScreenX + camera.x;
            this.mouse.rightWorldY = this.mouse._rightClickScreenY + camera.y;
        }
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
        this.tutorialActive = false;
        this.currentRoom = null;

        // Stats tracking
        this.enemiesKilledCount = 0;
        this.bossesKilledCount = 0;
        this.playTime = 0;

        // Social
        this.profile = null;
        this.chat = null;

        // Timing
        this.lastTime = performance.now();
        this.fps = 60;
        this.fpsTimer = 0;
        this.fpsFrames = 0;

        // Pickup items on ground
        this.groundItems = [];

        // Clones (分身术)
        this.clones = [];
        // Delayed effects (陨石 etc.)
        this.delayedEffects = [];
        // Chain lightning visual arcs
        this.chainLightnings = [];
        // init() is called after class selection
    }

    init(classId = 'human') {
        this.classId = classId;
        this.dungeon = new Dungeon(1);
        const startPos = this.dungeon.startRoom.randomPosition;
        this.player = new Player(startPos.x, startPos.y, classId);
        this.player.gold = 50;
        this.enemies = [];
        this.allProjectiles = [];
        this.damageNumbers = [];
        this.groundItems = [];
        this.clones = [];
        this.delayedEffects = [];
        this.chainLightnings = [];
        this._playerProjectiles = [];
        this.gameOver = false;
        this.currentRoom = this.dungeon.startRoom;
        this.dungeon.startRoom.visited = true;
        this.dungeon.currentRoom = this.dungeon.startRoom;
        this.ui.hideGameOver();
        this.ui.setPlayerRef(this.player);
        this.ui.showFloorIndicator(1);

        // Social: profile & chat
        if (!this.profile) {
            this.profile = new ProfileManager('');
            this.chat = new ChatService('冒险者');
            this.ui.setProfileManager(this.profile);
            this.ui.setChatService(this.chat);
        }
        this.profile.startRun(classId);
        this.enemiesKilledCount = 0;
        this.bossesKilledCount = 0;
        this.playTime = 0;
        const classDef = this.player.classDef;
        this.chat.sendSystem('class_select', { className: classDef ? classDef.name : '冒险者' });

        // Give starter weapon and a health potion
        this.player.equipItem(generateItem(1, 'weapon'));
        this.player.inventory.push(createHpPotion(1));
    }

    start() {
        // Check if tutorial should be shown
        const tutorialDone = localStorage.getItem('roguelike_tutorial_done');
        if (!tutorialDone) {
            this.tutorialActive = true;
            this.lastTime = performance.now();
            // Start rendering (shows dungeon behind tutorial) but pause updates
            this.loop(this.lastTime);
            this.ui.showTutorial(() => {
                this.tutorialActive = false;
                localStorage.setItem('roguelike_tutorial_done', '1');
                this.lastTime = performance.now(); // Reset timer to avoid huge dt
            });
        } else {
            this.lastTime = performance.now();
            this.loop(this.lastTime);
        }
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
        if (this.tutorialActive) return;
        this.playTime += dt;
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

        // Attack (mouse left or J key)
        const attacking = this.input.mouse.down || this.input.keys['KeyJ'];
        if (attacking && this.player.attackTimer <= 0) {
            const atkX = this.input.keys['KeyJ']
                ? this.player.x + Math.cos(this.player.facingAngle) * 60
                : this.input.mouse.worldX;
            const atkY = this.input.keys['KeyJ']
                ? this.player.y + Math.sin(this.player.facingAngle) * 60
                : this.input.mouse.worldY;
            const result = this.player.attack(atkX, atkY, dt);
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
                // Lifesteal from melee attacks
                if (hits.length > 0 && this.player.lifesteal > 0) {
                    const totalDmg = hits.reduce((s, h) => s + h.damage, 0);
                    const healAmt = Math.floor(totalDmg * this.player.lifesteal);
                    if (healAmt > 0) {
                        this.player.hp = Math.min(this.player.maxHp, this.player.hp + healAmt);
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
                this.particles.emit(this.player.x, this.player.y, 3, {
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
                        // Thorns reflection
                        if (this.player.thornsTimer > 0 && enemy) {
                            const reflectDmg = Math.floor(attackResult.damage * 0.5);
                            const enemyDied = enemy.takeDamage(reflectDmg);
                            this.particles.emit(enemy.x, enemy.y, 4, {
                                speed: [20, 70], life: [0.2, 0.4], color: '#2ecc71', size: [1, 3]
                            });
                            if (enemyDied) this.onEnemyKilled(enemy);
                        }
                    }
                    if (this.player.isDead) {
                        this.gameOver = true;
                        this._endGame('敌人');
                        this.ui.showGameOver(this.player, this.dungeon);
                        this.particles.emitDeath(this.player.x, this.player.y, '#e74c3c');
                    }
                }
            }
        }

        // Collect all projectiles (enemy + player)
        this.allProjectiles = [];
        for (const enemy of this.enemies) {
            for (const p of enemy.projectiles) {
                this.allProjectiles.push(p);
            }
        }
        // Player projectiles (from ninja shuriken, mage missiles)
        if (!this._playerProjectiles) this._playerProjectiles = [];
        this.allProjectiles.push(...this._playerProjectiles);

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
                    this._endGame('投射物');
                    this.ui.showGameOver(this.player, this.dungeon);
                    this.particles.emitDeath(this.player.x, this.player.y, '#e74c3c');
                }
            }
        }

        // Player projectiles hit enemies
        for (let i = this._playerProjectiles.length - 1; i >= 0; i--) {
            const p = this._playerProjectiles[i];
            if (!p.active) { this._playerProjectiles.splice(i, 1); continue; }
            for (const enemy of this.enemies) {
                if (enemy.isDead) continue;
                if (dist(p.x, p.y, enemy.x, enemy.y) < enemy.radius + p.size) {
                    const died = enemy.takeDamage(p.damage);
                    this.damageNumbers.push({
                        x: enemy.x, y: enemy.y,
                        amount: p.damage, crit: false, life: 0.6
                    });
                    this.particles.emitHit(enemy.x, enemy.y);
                    p.active = false;
                    if (died) this.onEnemyKilled(enemy);
                    break;
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

        // Update clones
        for (let i = this.clones.length - 1; i >= 0; i--) {
            const c = this.clones[i];
            c.life -= dt;
            c.animTimer += dt;
            if (c.life <= 0) {
                this.particles.emit(c.x, c.y, 6, {
                    speed: [20, 60], life: [0.2, 0.4], color: '#fff', size: [1, 3]
                });
                this.clones.splice(i, 1);
                continue;
            }
            // Follow player loosely
            const targetX = this.player.x + c.offsetX;
            const targetY = this.player.y + c.offsetY;
            c.x += (targetX - c.x) * 4 * dt;
            c.y += (targetY - c.y) * 4 * dt;
            // Auto-attack nearby enemies
            c.attackCooldown -= dt;
            if (c.attackCooldown <= 0) {
                for (const enemy of this.enemies) {
                    if (enemy.isDead) continue;
                    if (dist(c.x, c.y, enemy.x, enemy.y) < 55) {
                        c.attackCooldown = c.attackSpeed;
                        const { damage, crit } = calcDamage(c.damage, enemy.def, 0.05, 1.5);
                        const died = enemy.takeDamage(damage);
                        this.damageNumbers.push({
                            x: enemy.x, y: enemy.y,
                            amount: damage, crit, life: 0.6
                        });
                        this.particles.emitHit(enemy.x, enemy.y);
                        if (died) this.onEnemyKilled(enemy);
                        break;
                    }
                }
            }
        }

        // Process delayed effects
        for (let i = this.delayedEffects.length - 1; i >= 0; i--) {
            const eff = this.delayedEffects[i];
            eff.delay -= dt;
            if (eff.delay <= 0) {
                // Execute effect
                if (eff.type === 'meteor') {
                    this.particles.emit(eff.x, eff.y, 30, {
                        speed: [60, 300], life: [0.4, 1.0], color: '#e74c3c', size: [3, 10], gravity: 80
                    });
                    this.particles.particles.push(new RingParticle(eff.x, eff.y, 0, 110, 0.5, '#e74c3c'));
                    this.particles.particles.push(new RingParticle(eff.x, eff.y, 0, 80, 0.35, '#f39c12'));
                    this.renderer.screenShake(8, 0.4);
                    this.renderer.flashScreen('#f44', 0.1);
                    for (const enemy of this.enemies) {
                        if (enemy.isDead) continue;
                        if (dist(eff.x, eff.y, enemy.x, enemy.y) < eff.radius) {
                            const { damage, crit } = calcDamage(eff.damage, enemy.def, eff.crit, eff.critMult);
                            const died = enemy.takeDamage(damage);
                            this.damageNumbers.push({
                                x: enemy.x, y: enemy.y,
                                amount: damage, crit, life: 0.8
                            });
                            this.particles.emitHit(enemy.x, enemy.y);
                            if (died) this.onEnemyKilled(enemy);
                        }
                    }
                }
                if (eff.type === 'blizzard') {
                    this.particles.emit(eff.x, eff.y, 25, {
                        speed: [20, 100], life: [0.5, 1.2], color: '#87ceeb', size: [2, 6], gravity: -20
                    });
                    this.particles.particles.push(new RingParticle(eff.x, eff.y, 0, 140, 0.6, '#87ceeb'));
                    for (const enemy of this.enemies) {
                        if (enemy.isDead) continue;
                        if (dist(eff.x, eff.y, enemy.x, enemy.y) < eff.radius) {
                            const { damage, crit } = calcDamage(eff.damage, enemy.def, this.player.crit, this.player.critMult);
                            const died = enemy.takeDamage(damage);
                            enemy._slowTimer = 3;
                            enemy._slowAmount = eff.slowAmount || 0.5;
                            this.damageNumbers.push({
                                x: enemy.x, y: enemy.y,
                                amount: damage, crit, life: 0.8
                            });
                            this.particles.emitHit(enemy.x, enemy.y);
                            if (died) this.onEnemyKilled(enemy);
                        }
                    }
                }
                this.delayedEffects.splice(i, 1);
            }
        }

        // Purification aura damage (saintess)
        if (this.player._purificationActive) {
            for (const enemy of this.enemies) {
                if (enemy.isDead) continue;
                if (enemy.type === 'shadow_mage' && dist(this.player.x, this.player.y, enemy.x, enemy.y) < 100) {
                    enemy.takeDamage(Math.floor(this.player.atk * 0.2 * dt * 10));
                }
            }
            this.player._purificationActive = false;
        }
        // Holy nova trigger (saintess)
        if (this.player._holyNovaTrigger) {
            this.player._holyNovaTrigger = false;
            this.particles.emit(this.player.x, this.player.y, 20, {
                speed: [40, 150], life: [0.3, 0.7], color: '#f1c40f', size: [2, 6]
            });
            this.particles.particles.push(new RingParticle(this.player.x, this.player.y, 0, 100, 0.5, '#f1c40f'));
            for (const enemy of this.enemies) {
                if (enemy.isDead) continue;
                if (enemy.type === 'shadow_mage' && dist(this.player.x, this.player.y, enemy.x, enemy.y) < 120) {
                    const died = enemy.takeDamage(Math.floor(this.player.atk * 1.5));
                    if (died) this.onEnemyKilled(enemy);
                }
            }
        }
        // Counter damage from block (knight)
        if (this.player._counterDmg > 0) {
            for (const enemy of this.enemies) {
                if (enemy.isDead) continue;
                if (dist(this.player.x, this.player.y, enemy.x, enemy.y) < 40) {
                    const died = enemy.takeDamage(this.player._counterDmg);
                    this.damageNumbers.push({
                        x: enemy.x, y: enemy.y,
                        amount: this.player._counterDmg, crit: true, life: 0.5
                    });
                    if (died) this.onEnemyKilled(enemy);
                    break;
                }
            }
            this.player._counterDmg = 0;
        }

        // Update chain lightning visuals
        for (let i = this.chainLightnings.length - 1; i >= 0; i--) {
            this.chainLightnings[i].life -= dt;
            if (this.chainLightnings[i].life <= 0) this.chainLightnings.splice(i, 1);
        }

        // Potion hotkey (Q)
        if (justPressed['KeyQ']) {
            const hpPotion = this.player.inventory.find(item => item.type === 'consumable' && item.subType === 'hp');
            if (hpPotion) {
                this.player.usePotion(hpPotion);
                this.player.inventory.splice(this.player.inventory.indexOf(hpPotion), 1);
                this.particles.emitHeal(this.player.x, this.player.y);
            }
        }

        // Save/Load hotkeys
        if (justPressed['F5']) this.saveGame();
        if (justPressed['F9'] && Game.hasSave()) {
            if (this.loadGame()) this.start();
        }

        // Right-click auto-move
        if (this.input.mouse._justRightClicked) {
            this.player.autoMoveTarget = {
                x: this.input.mouse.rightWorldX,
                y: this.input.mouse.rightWorldY
            };
            this.player.autoMoveActive = true;
            this.input.mouse._justRightClicked = false;
        }
        // Cancel auto-move on WASD press
        if (justPressed['KeyW'] || justPressed['KeyA'] || justPressed['KeyS'] || justPressed['KeyD'] ||
            justPressed['ArrowUp'] || justPressed['ArrowDown'] || justPressed['ArrowLeft'] || justPressed['ArrowRight']) {
            this.player.autoMoveActive = false;
            this.player.autoMoveTarget = null;
        }

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
            } else if (eff.blink) {
                this.particles.emit(this.player.x, this.player.y, 10, {
                    speed: [30, 90], life: [0.2, 0.5], color: '#9b59b6', size: [2, 5]
                });
            } else if (eff.buff) {
                // Skill-specific visual effects
                switch (eff.buff) {
                    case 'berserk':
                        this.particles.emit(this.player.x, this.player.y, 8, { speed: [40,120], life:[0.3,0.6], color:'#e74c3c', size:[2,5] });
                        this.renderer.flashScreen('#f44', 0.06);
                        break;
                    case 'battle_cry':
                        this.particles.emit(this.player.x, this.player.y, 10, { speed: [30,100], life:[0.3,0.7], color:'#f39c12', size:[2,6] });
                        this.particles.particles.push(new RingParticle(this.player.x, this.player.y, 0, 100, 0.4, '#f39c12'));
                        break;
                    case 'roundhouse':
                        this.particles.emit(this.player.x, this.player.y, 12, { speed: [50,150], life:[0.2,0.5], color:'#fff', size:[2,5], spread:Math.PI*2 });
                        this.renderer.screenShake(3, 0.15);
                        break;
                    case 'holy_light':
                        this.particles.emitHeal(this.player.x, this.player.y);
                        this.particles.emit(this.player.x, this.player.y, 10, { speed: [20,80], life:[0.4,0.8], color:'#f1c40f', size:[2,5], gravity:-40 });
                        break;
                    case 'guardian_shield':
                        this.particles.emit(this.player.x, this.player.y, 15, { speed: [10,50], life:[0.5,1.0], color:'#f1c40f', size:[2,6], spread:Math.PI*2 });
                        this.particles.particles.push(new RingParticle(this.player.x, this.player.y, 0, 80, 0.5, '#f1c40f'));
                        break;
                    case 'purification':
                        this.particles.emit(this.player.x, this.player.y, 12, { speed: [30,90], life:[0.4,0.8], color:'#fff', size:[1,4], gravity:-30 });
                        this.renderer.flashScreen('#fff', 0.04);
                        break;
                    case 'shield_bash':
                        this.particles.emit(this.player.x, this.player.y, 8, { speed: [60,180], life:[0.15,0.4], color:'#ddd', size:[2,6] });
                        this.renderer.screenShake(5, 0.2);
                        break;
                    case 'iron_fortress':
                        this.particles.emit(this.player.x, this.player.y, 15, { speed: [20,70], life:[0.5,1.0], color:'#8899aa', size:[3,7], spread:Math.PI*2 });
                        this.particles.particles.push(new RingParticle(this.player.x, this.player.y, 0, 100, 0.6, '#8899aa'));
                        break;
                    case 'holy_charge':
                        for (let i=0;i<8;i++) this.particles.emit(this.player.x, this.player.y, 3, { speed:[60,150], life:[0.2,0.4], color:'#f1c40f', size:[1,3] });
                        break;
                    case 'shadow_strike':
                        this.particles.emit(this.player.x, this.player.y, 12, { speed: [40,130], life:[0.15,0.35], color:'#2c2c3a', size:[2,5] });
                        this.renderer.flashScreen('#1a1a2e', 0.08);
                        break;
                    case 'smoke':
                        this.particles.emit(this.player.x, this.player.y, 20, { speed: [10,40], life:[0.5,1.2], color:'#888', size:[3,8], gravity:-15 });
                        this.renderer.flashScreen('#888', 0.05);
                        break;
                    case 'shuriken':
                        this.renderer.screenShake(2, 0.1);
                        break;
                    case 'missiles':
                        this.particles.emit(this.player.x, this.player.y, 8, { speed: [20,70], life:[0.3,0.6], color:'#a855f7', size:[2,4] });
                        break;
                    case 'blizzard':
                        this.renderer.flashScreen('#87ceeb', 0.06);
                        break;
                    case 'mana_burst':
                        this.particles.emit(this.player.x, this.player.y, 20, { speed: [80,250], life:[0.3,0.7], color:'#a855f7', size:[3,8], spread:Math.PI*2 });
                        this.particles.particles.push(new RingParticle(this.player.x, this.player.y, 0, 160, 0.5, '#a855f7'));
                        this.renderer.screenShake(6, 0.3);
                        this.renderer.flashScreen('#a855f7', 0.08);
                        break;
                    case 'clones':
                        this.particles.emit(this.player.x, this.player.y, 10, { speed: [30,80], life:[0.3,0.6], color:'#fff', size:[1,3], spread:Math.PI*2 });
                        break;
                    case 'meteor':
                        this.renderer.screenShake(3, 0.15);
                        break;
                }
            } else if (eff.enemy) {
                const died = eff.enemy.takeDamage(eff.damage);
                this.damageNumbers.push({
                    x: eff.enemy.x, y: eff.enemy.y,
                    amount: eff.damage, crit: eff.crit, life: 0.8
                });
                if (eff.crit) {
                    this.particles.emitCritHit(eff.enemy.x, eff.enemy.y);
                    this.renderer.screenShake(3, 0.1);
                } else if (eff.chain) {
                    this.particles.emit(eff.enemy.x, eff.enemy.y, 5, {
                        speed: [30, 100], life: [0.15, 0.35], color: '#3498db', size: [1, 3]
                    });
                } else {
                    this.particles.emitHit(eff.enemy.x, eff.enemy.y);
                }
                if (died) this.onEnemyKilled(eff.enemy);
            }
        }
        // Chain lightning visual
        if (result.chainOrigin && result.chainTargets) {
            this.chainLightnings.push({
                points: [result.chainOrigin, ...result.chainTargets],
                life: 0.35
            });
        }
        // Lifesteal from skill damage
        if (this.player.lifesteal > 0) {
            const skillDmg = result.effects.filter(e => e.enemy && e.damage).reduce((s, e) => s + e.damage, 0);
            if (skillDmg > 0) {
                const healAmt = Math.floor(skillDmg * this.player.lifesteal);
                if (healAmt > 0) {
                    this.player.hp = Math.min(this.player.maxHp, this.player.hp + healAmt);
                }
            }
        }
    }

    // ─── Save / Load ───
    saveGame() {
        const data = {
            classId: this.classId || 'human',
            floor: this.dungeon.floor,
            player: {
                x: this.player.x, y: this.player.y,
                level: this.player.level, xp: this.player.xp, gold: this.player.gold,
                hp: this.player.hp, mp: this.player.mp,
                equipment: this.player.equipment,
                inventory: this.player.inventory,
                skills: this.player.skills,
                passives: this.player.passives,
                skillCooldowns: this.player.skillCooldowns
            },
            dungeon: {
                startRoom: { px: this.dungeon.startRoom.px, py: this.dungeon.startRoom.py, pw: this.dungeon.startRoom.pw, ph: this.dungeon.startRoom.ph },
                bossRoom: this.dungeon.bossRoom ? { px: this.dungeon.bossRoom.px, py: this.dungeon.bossRoom.py, pw: this.dungeon.bossRoom.pw, ph: this.dungeon.bossRoom.ph } : null,
                rooms: this.dungeon.rooms.map(r => ({
                    px: r.px, py: r.py, pw: r.pw, ph: r.ph,
                    type: r.type, cleared: r.cleared, visited: r.visited, id: r.id
                }))
            },
            groundItems: this.groundItems.map(gi => ({ x: gi.x, y: gi.y, item: gi.item })),
            timestamp: Date.now()
        };
        localStorage.setItem('roguelike_save', JSON.stringify(data));
        this.ui.showSaveConfirm();
    }

    loadGame() {
        const raw = localStorage.getItem('roguelike_save');
        if (!raw) return false;
        try {
            const data = JSON.parse(raw);
            // Restore dungeon
            this.dungeon = new Dungeon(data.floor);
            // Restore room states
            for (const savedRoom of data.dungeon.rooms) {
                const room = this.dungeon.rooms.find(r => r.id === savedRoom.id);
                if (room) {
                    room.type = savedRoom.type;
                    room.cleared = savedRoom.cleared;
                    room.visited = savedRoom.visited;
                }
            }
            // Restore player
            this.player = new Player(data.player.x, data.player.y, data.classId);
            const p = this.player;
            p.level = data.player.level;
            p.xp = data.player.xp;
            p.gold = data.player.gold;
            p.hp = data.player.hp;
            p.mp = data.player.mp;
            p.equipment = data.player.equipment;
            p.inventory = data.player.inventory;
            p.skills = data.player.skills;
            p.passives = data.player.passives;
            p.skillCooldowns = data.player.skillCooldowns || {};
            for (const key of Object.keys(p.skillCooldowns)) {
                p.skillCooldowns[key] = 0;
            }
            // Restore ground items
            this.groundItems = (data.groundItems || []).map(gi => ({ x: gi.x, y: gi.y, item: gi.item }));
            // Reset runtime state
            this.enemies = [];
            this.allProjectiles = [];
            this.clones = [];
            this.delayedEffects = [];
            this.chainLightnings = [];
            this._playerProjectiles = [];
            this.damageNumbers = [];
            this.gameOver = false;
            this.currentRoom = this.dungeon.getRoomAt(p.x, p.y) || this.dungeon.startRoom;
            if (this.currentRoom) this.dungeon.currentRoom = this.currentRoom;
            this.ui.hideGameOver();
            this.ui.setPlayerRef(p);
            this.ui.showFloorIndicator(data.floor);
            this.ui.showLoadConfirm();
            // Profile
            if (!this.profile) {
                this.profile = new ProfileManager('');
                this.chat = new ChatService('冒险者');
                this.ui.setProfileManager(this.profile);
                this.ui.setChatService(this.chat);
            }
            this.profile.startRun(data.classId);
            this.enemiesKilledCount = 0;
            this.bossesKilledCount = 0;
            this.playTime = 0;
            return true;
        } catch (e) {
            return false;
        }
    }

    static hasSave() {
        return !!localStorage.getItem('roguelike_save');
    }

    spawnClones(count, duration) {
        for (let i = 0; i < count; i++) {
            const offsetX = (Math.random() - 0.5) * 40;
            const offsetY = (Math.random() - 0.5) * 40;
            this.clones.push({
                x: this.player.x + offsetX,
                y: this.player.y + offsetY,
                offsetX, offsetY,
                life: duration,
                attackCooldown: 0,
                attackSpeed: 0.8,
                damage: Math.floor(this.player.atk * 0.5),
                animTimer: Math.random() * Math.PI * 2
            });
        }
        this.particles.emit(this.player.x, this.player.y, 15, {
            speed: [30, 100], life: [0.3, 0.7], color: '#fff', size: [2, 5]
        });
    }

    addDelayedEffect(effect) {
        this.delayedEffects.push(effect);
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
        this.enemiesKilledCount++;

        // Boss death special effects
        if (enemy.isBoss) {
            this.bossesKilledCount++;
            if (this.chat) this.chat.sendSystem('boss_kill', {});
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
            if (this.chat) this.chat.sendSystem('level_up', { level: this.player.level });
        }

        // Drop items
        const drop = generateDrop(this.dungeon.floor);
        this.player.gold += drop.gold;
        for (const item of drop.items) {
            this.groundItems.push({ x: enemy.x + (Math.random() - 0.5) * 40, y: enemy.y + (Math.random() - 0.5) * 40, item });
            if (item.rarity === 'LEGENDARY' && this.chat) {
                this.chat.sendSystem('legendary', { itemName: item.name });
            }
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

    _endGame(cause) {
        if (this.profile) {
            this.profile.updateRun({
                level: this.player.level,
                floor: this.dungeon.floor,
                gold: this.player.gold,
                playTime: this.playTime,
                enemiesKilled: this.enemiesKilledCount,
                bossesKilled: this.bossesKilledCount,
                skills: this.player.skills.map(s => s.name),
                epicCount: Object.values(this.player.equipment).filter(e => e && e.rarity === 'EPIC').length
            });
            const newAchs = this.profile.endRun(cause);
            if (this.chat) {
                this.chat.sendSystem('death', { floor: this.dungeon.floor, level: this.player.level });
                if (newAchs && newAchs.length > 0) {
                    for (const ach of newAchs) {
                        this.chat.sendSystem('achievement', { name: ach.name });
                    }
                }
            }
        }
    }

    nextFloor() {
        // Update profile before floor transition
        if (this.profile) {
            this.profile.updateRun({
                level: this.player.level,
                floor: this.dungeon.floor,
                gold: this.player.gold,
                playTime: this.playTime,
                enemiesKilled: this.enemiesKilledCount,
                bossesKilled: this.bossesKilledCount,
                skills: this.player.skills.map(s => s.name)
            });
        }
        if (this.chat) this.chat.sendSystem('floor', { floor: this.dungeon.floor + 1 });
        const nextFloor = this.dungeon.floor + 1;
        this.dungeon = new Dungeon(nextFloor);
        const startPos = this.dungeon.startRoom.randomPosition;
        this.player.x = startPos.x;
        this.player.y = startPos.y;
        this.enemies = [];
        this.allProjectiles = [];
        this.groundItems = [];
        this.clones = [];
        this.delayedEffects = [];
        this.chainLightnings = [];
        this._playerProjectiles = [];
        this.damageNumbers = [];
        this.currentRoom = this.dungeon.startRoom;
        this.dungeon.startRoom.visited = true;
        this.dungeon.currentRoom = this.dungeon.startRoom;
        this.ui.showFloorIndicator(nextFloor);
        this.saveGame(); // Auto-save on floor transition

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
            const bob = Math.sin(this.renderer.animTime * 3.33 + gi.x) * 1;
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

        // Draw clones
        for (const c of this.clones) {
            this.renderer.drawClone(c);
        }

        // Draw meteor indicators
        for (const eff of this.delayedEffects) {
            if (eff.type === 'meteor') {
                this.renderer.drawMeteorIndicator(eff);
            }
        }

        // Draw chain lightning
        for (const cl of this.chainLightnings) {
            this.renderer.drawChainLightning(cl);
        }

        // Draw damage numbers
        for (const dn of this.damageNumbers) {
            this.renderer.drawDamageNumber(dn.x, dn.y, dn.amount, dn.crit);
        }

        // Draw particles
        this.particles.draw(this.renderer.ctx, this.renderer.camera);

        // Draw vignette
        this.renderer.drawVignette();

        // Draw auto-move destination marker
        if (this.player.autoMoveActive && this.player.autoMoveTarget) {
            const mx = this.player.autoMoveTarget.x - this.renderer.sx;
            const my = this.player.autoMoveTarget.y - this.renderer.sy;
            const pulse = Math.sin(this.renderer.animTime * 4) * 4;
            this.renderer.ctx.strokeStyle = '#2ecc71';
            this.renderer.ctx.lineWidth = 2;
            this.renderer.ctx.setLineDash([4, 4]);
            this.renderer.ctx.beginPath();
            this.renderer.ctx.arc(mx, my, 10 + pulse, 0, Math.PI * 2);
            this.renderer.ctx.stroke();
            this.renderer.ctx.setLineDash([]);
            // Crosshair center
            this.renderer.ctx.fillStyle = '#2ecc71';
            this.renderer.ctx.fillRect(mx - 1, my - 5, 2, 10);
            this.renderer.ctx.fillRect(mx - 5, my - 1, 10, 2);
        }

        // Draw minimap
        this.renderer.drawMinimap(this.dungeon, this.player);
    }
}

// Start the game with class selection
const gameCanvas = document.getElementById('game-canvas');
if (gameCanvas) {
    const game = new Game();
    // Show loading screen then class selection
    game.renderer.clear();
    game.renderer.drawVignette();
    game.renderer.ctx.fillStyle = '#f1c40f';
    game.renderer.ctx.font = '20px monospace';
    game.renderer.ctx.textAlign = 'center';
    game.renderer.ctx.fillText('加载中...', 512, 384);
    game.renderer.ctx.textAlign = 'start';
    // Defer class select to next frame to ensure DOM ready
    requestAnimationFrame(() => {
        game.ui.showClassSelect((classId) => {
            game.init(classId);
            game.start();
        });
    });
}
