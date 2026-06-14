import { ROOM_TYPES } from './dungeon.js';

const TILE = 32;

export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.width = canvas.width;
        this.height = canvas.height;
        this.camera = { x: 0, y: 0, w: canvas.width, h: canvas.height };
        this.shakeIntensity = 0;
        this.shakeTimer = 0;
        this.screenFlash = 0;
        this.screenFlashColor = '#fff';
        this.animTime = 0; // deterministic animation timer in seconds
    }

    screenShake(intensity = 4, duration = 0.2) {
        this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
        this.shakeTimer = Math.max(this.shakeTimer, duration);
    }

    flashScreen(color = '#fff', duration = 0.08) {
        this.screenFlash = duration;
        this.screenFlashColor = color;
    }

    updateCamera(player) {
        this.camera.x = player.x - this.width / 2;
        this.camera.y = player.y - this.height / 2;
        if (this.shakeTimer > 0) {
            this.camera.x += (Math.random() - 0.5) * this.shakeIntensity * 2;
            this.camera.y += (Math.random() - 0.5) * this.shakeIntensity * 2;
        }
    }

    update(dt) {
        this.animTime += dt;
        if (this.shakeTimer > 0) {
            this.shakeTimer -= dt;
            if (this.shakeTimer <= 0) this.shakeIntensity = 0;
        }
        if (this.screenFlash > 0) this.screenFlash -= dt;
    }

    get sx() { return this.camera.x; }
    get sy() { return this.camera.y; }

    clear() {
        this.ctx.fillStyle = '#0d0d0d';
        this.ctx.fillRect(0, 0, this.width, this.height);
    }

    drawDungeon(dungeon) {
        const ctx = this.ctx;
        const cx = this.sx, cy = this.sy;

        // Draw floor pattern (grid)
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 0.5;
        const startTX = Math.floor(cx / TILE) * TILE;
        const startTY = Math.floor(cy / TILE) * TILE;
        for (let y = startTY; y < cy + this.height + TILE; y += TILE) {
            for (let x = startTX; x < cx + this.width + TILE; x += TILE) {
                ctx.strokeRect(x - cx, y - cy, TILE, TILE);
            }
        }

        // Draw rooms
        for (const room of dungeon.rooms) {
            const rx = room.px - cx;
            const ry = room.py - cy;

            if (!room.visited) continue;

            // Room floor
            let floorColor = '#1a1a2e';
            if (room.type === ROOM_TYPES.START) floorColor = '#1a2e1a';
            else if (room.type === ROOM_TYPES.BOSS) floorColor = '#2e1a1a';
            else if (room.type === ROOM_TYPES.TREASURE) floorColor = '#2e2a1a';
            else if (room.type === ROOM_TYPES.SHOP) floorColor = '#1a2e2e';

            ctx.fillStyle = floorColor;
            ctx.fillRect(rx, ry, room.pw, room.ph);

            // Room border
            ctx.strokeStyle = room.visited ? '#444' : '#222';
            ctx.lineWidth = 2;
            ctx.strokeRect(rx, ry, room.pw, room.ph);

            // Doors
            const doorSize = 24;
            ctx.fillStyle = '#2a1a0a';
            if (room.doors.top) {
                const dx = room.cx - cx - doorSize / 2;
                ctx.fillRect(dx, ry - 4, doorSize, 12);
            }
            if (room.doors.bottom) {
                const dx = room.cx - cx - doorSize / 2;
                ctx.fillRect(dx, ry + room.ph - 8, doorSize, 12);
            }
            if (room.doors.left) {
                const dy = room.cy - cy - doorSize / 2;
                ctx.fillRect(rx - 4, dy, 12, doorSize);
            }
            if (room.doors.right) {
                const dy = room.cy - cy - doorSize / 2;
                ctx.fillRect(rx + room.pw - 8, dy, 12, doorSize);
            }

            // Room type icon
            if (room.visited) {
                ctx.font = '16px serif';
                ctx.textAlign = 'center';
                let icon = '';
                if (room.type === ROOM_TYPES.START) icon = '🏠';
                else if (room.type === ROOM_TYPES.BOSS) icon = '💀';
                else if (room.type === ROOM_TYPES.TREASURE) icon = '📦';
                else if (room.type === ROOM_TYPES.SHOP) icon = '🏪';
                if (icon && !room.cleared && room.type !== ROOM_TYPES.START) {
                    ctx.fillText(icon, room.cx - cx, room.py - cy + 24);
                }
            }
        }

        // Draw corridors
        ctx.strokeStyle = '#2a2a1a';
        ctx.lineWidth = 20;
        ctx.lineCap = 'round';
        for (const cor of dungeon.corridors) {
            ctx.beginPath();
            ctx.moveTo(cor.x1 - cx, cor.y1 - cy);
            ctx.lineTo(cor.x2 - cx, cor.y2 - cy);
            ctx.stroke();
        }
        ctx.lineWidth = 16;
        ctx.strokeStyle = '#1a1a2e';
        for (const cor of dungeon.corridors) {
            ctx.beginPath();
            ctx.moveTo(cor.x1 - cx, cor.y1 - cy);
            ctx.lineTo(cor.x2 - cx, cor.y2 - cy);
            ctx.stroke();
        }
        ctx.lineWidth = 1;
        ctx.lineCap = 'butt';
    }

    // Detect weapon visual type from name
    _getWeaponType(player) {
        const wp = player.equipment.weapon;
        if (!wp) return 'sword';
        const n = wp.name;
        if (n.includes('短剑') || n.includes('长剑') || n.includes('匕首')) return 'sword';
        if (n.includes('战斧') || n.includes('巨锤')) return 'heavy';
        if (n.includes('魔杖')) return 'wand';
        if (n.includes('镰刀')) return 'scythe';
        if (n.includes('拳套')) return 'fist';
        return 'sword';
    }

    _getArmorColor(player) {
        const ar = player.equipment.armor;
        if (!ar) return '#3498db';
        const map = { COMMON: '#8899aa', RARE: '#5dade2', EPIC: '#a569bd', LEGENDARY: '#e67e22' };
        return map[ar.rarity] || '#3498db';
    }

    _getArmorGlow(player) {
        const ar = player.equipment.armor;
        if (!ar) return null;
        if (ar.rarity === 'LEGENDARY') return { color: '#e67e22', size: 6, alpha: 0.3 };
        if (ar.rarity === 'EPIC') return { color: '#a569bd', size: 4, alpha: 0.2 };
        return null;
    }

    drawPlayer(player) {
        const ctx = this.ctx;
        const px = player.x - this.sx;
        const py = player.y - this.sy;
        const r = player.radius;
        const a = player.facingAngle;

        if (px < -60 || px > this.width + 60 || py < -60 || py > this.height + 60) return;

        // ─── Shadow ───
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.beginPath();
        ctx.ellipse(px, py + r * 0.55, r * 0.75, r * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();

        const vis = player.classDef ? player.classDef.visual : { bodyScale: 1, bodyColor: '#d4a574', helmetStyle: 'default', eyeStyle: 'normal', accessories: { back: [], front: [] }, scaleWeapon: 1, bodyShape: 'circle' };
        const scaledR = r * (vis.bodyScale || 1);

        // ─── Back accessories ───
        for (const acc of vis.accessories.back || []) {
            if (acc === 'halo') {
                ctx.fillStyle = `rgba(241,196,15,${0.25 + Math.sin(this.animTime * 3) * 0.1})`;
                ctx.beginPath();
                ctx.ellipse(px, py - scaledR * 1.1, scaledR * 0.6, scaledR * 0.2, 0, 0, Math.PI * 2);
                ctx.fill();
            }
            if (acc === 'scarf') {
                ctx.strokeStyle = '#c0392b';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(px - scaledR * 0.3, py - scaledR * 0.5);
                ctx.quadraticCurveTo(px - scaledR * 0.7, py + scaledR * 0.2, px - scaledR * 0.5 + Math.sin(this.animTime * 4) * 3, py + scaledR * 0.8);
                ctx.stroke();
                ctx.lineWidth = 1;
            }
            if (acc === 'robe_back') {
                const robeColor = vis.bodyColor === '#f5e6d3' ? '#fafafa' : '#3d2b5a';
                ctx.fillStyle = robeColor;
                ctx.beginPath();
                ctx.moveTo(px - scaledR * 0.8, py - scaledR * 0.2);
                ctx.lineTo(px - scaledR * 1.1, py + scaledR * 1.0);
                ctx.lineTo(px + scaledR * 1.1, py + scaledR * 1.0);
                ctx.lineTo(px + scaledR * 0.8, py - scaledR * 0.2);
                ctx.closePath();
                ctx.fill();
            }
        }

        // Invincibility flicker
        if (player.invincibleTimer > 0 && Math.floor(player.invincibleTimer * 20) % 2 === 0) {
            ctx.globalAlpha = 0.4;
        }

        const hitColor = player.hitFlash > 0;
        const armorColor = this._getArmorColor(player);
        const weaponType = this._getWeaponType(player);
        const classBodyColor = vis.bodyColor || '#d4a574';
        const bodyColor = hitColor ? '#fff' : (vis.idleBob ? classBodyColor : armorColor);

        // Idle bob animation
        const bobY = vis.idleBob ? Math.sin(this.animTime * 2.5) * 2 : 0;

        // ─── Ring glow aura ───
        const ring = player.equipment.ring;
        if (ring && !hitColor) {
            const ringColors = { COMMON: 'rgba(170,170,170,0.15)', RARE: 'rgba(52,152,219,0.2)', EPIC: 'rgba(155,89,182,0.25)', LEGENDARY: 'rgba(230,126,34,0.35)' };
            ctx.fillStyle = ringColors[ring.rarity] || 'rgba(255,255,255,0.1)';
            ctx.beginPath();
            ctx.arc(px, py, r + 7 + Math.sin(this.animTime * 2) * 2, 0, Math.PI * 2);
            ctx.fill();
        }

        // ─── Armor glow ───
        const glow = this._getArmorGlow(player);
        if (glow && !hitColor) {
            ctx.fillStyle = glow.color.replace(')', `,${glow.alpha})`).replace('rgb', 'rgba');
            if (glow.color.startsWith('#')) {
                ctx.fillStyle = glow.color + '4d';
            }
            ctx.beginPath();
            ctx.arc(px, py, r + glow.size + Math.sin(this.animTime * 2.5) * 2, 0, Math.PI * 2);
            ctx.fill();
        }

        // ─── Body ───
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.arc(px, py + bobY, scaledR, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = hitColor ? '#f44' : '#1a1a2e';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Inner highlight
        const grad = ctx.createRadialGradient(px - scaledR * 0.3, py + bobY - scaledR * 0.3, scaledR * 0.1, px, py + bobY, scaledR);
        grad.addColorStop(0, 'rgba(255,255,255,0.2)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(px, py + bobY, scaledR, 0, Math.PI * 2);
        ctx.fill();

        // ─── Helmet ───
        if (vis.helmetStyle === 'pointedHat') {
            // Mage pointed hat
            ctx.fillStyle = hitColor ? '#fff' : '#3d2b5a';
            ctx.beginPath();
            ctx.moveTo(px - scaledR * 0.7, py + bobY - scaledR * 0.2);
            ctx.lineTo(px + Math.cos(a) * scaledR * 0.3, py + bobY - scaledR * 1.8);
            ctx.lineTo(px + scaledR * 0.7, py + bobY - scaledR * 0.2);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#5b4a7a';
            ctx.lineWidth = 1;
            ctx.stroke();
            // Hat brim
            ctx.fillStyle = '#2a1a4a';
            ctx.fillRect(px - scaledR * 0.8, py + bobY - scaledR * 0.3, scaledR * 1.6, scaledR * 0.15);
        } else if (vis.helmetStyle === 'hood') {
            // Ninja hood
            ctx.fillStyle = hitColor ? '#fff' : '#1a1a2e';
            ctx.beginPath();
            ctx.arc(px, py + bobY - scaledR * 0.1, scaledR * 0.75, Math.PI, 0);
            ctx.fill();
        } else if (vis.helmetStyle === 'circlet') {
            // Saintess circlet
            ctx.strokeStyle = '#f1c40f';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(px, py + bobY - scaledR * 0.15, scaledR * 0.5, Math.PI * 0.4, Math.PI * 0.6);
            ctx.stroke();
            ctx.lineWidth = 1;
        } else {
            const helm = player.equipment.helmet;
            if (helm) {
                const helmColors = { COMMON: '#999', RARE: '#5dade2', EPIC: '#a569bd', LEGENDARY: '#e67e22' };
                const hc = helmColors[helm.rarity] || '#888';
                ctx.fillStyle = hitColor ? '#fff' : hc;
                ctx.beginPath();
                ctx.arc(px, py + bobY - scaledR * 0.25, scaledR * 0.7, Math.PI, 0);
                ctx.fill();
                ctx.fillRect(px - scaledR * 0.7, py + bobY - scaledR * 0.25, scaledR * 1.4, scaledR * 0.15);
                ctx.fillStyle = '#111';
                ctx.fillRect(px - scaledR * 0.5, py + bobY - scaledR * 0.35, scaledR, scaledR * 0.08);
                ctx.fillStyle = hitColor ? '#fff' : hc;
            }
        }

        // ─── Eyes ───
        const ex = Math.cos(a) * 4;
        const ey = Math.sin(a) * 4;
        if (vis.eyeStyle === 'mask') {
            // Ninja mask
            ctx.fillStyle = '#1a1a2e';
            ctx.fillRect(px - scaledR * 0.8, py + bobY - scaledR * 0.5, scaledR * 1.6, scaledR * 0.4);
            ctx.fillStyle = '#fff';
            ctx.fillRect(px - scaledR * 0.7, py + bobY - scaledR * 0.42, scaledR * 1.4, scaledR * 0.06);
        } else if (vis.eyeStyle === 'glowing') {
            ctx.fillStyle = '#fff';
            ctx.shadowColor = '#f1c40f';
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(px + ex - 3, py + bobY + ey - 3, 3.5, 0, Math.PI * 2);
            ctx.arc(px + ex + 3, py + bobY + ey - 3, 3.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#f1c40f';
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.arc(px + ex - 2.5, py + bobY + ey - 2.5, 1.8, 0, Math.PI * 2);
            ctx.arc(px + ex + 3.5, py + bobY + ey - 2.5, 1.8, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(px + ex - 3, py + bobY + ey - 3, 3.5, 0, Math.PI * 2);
            ctx.arc(px + ex + 3, py + bobY + ey - 3, 3.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#111';
            ctx.beginPath();
            ctx.arc(px + ex - 2.5, py + bobY + ey - 2.5, 1.8, 0, Math.PI * 2);
            ctx.arc(px + ex + 3.5, py + bobY + ey - 2.5, 1.8, 0, Math.PI * 2);
            ctx.fill();
        }

        // ─── Weapon ───
        const weapon = player.equipment.weapon;
        const wpColor = weapon ? ({ COMMON: '#ccc', RARE: '#5dade2', EPIC: '#bb8fce', LEGENDARY: '#f39c12' }[weapon.rarity] || '#ddd') : '#ddd';
        const wx = px + Math.cos(a) * (r + 2);
        const wy = py + Math.sin(a) * (r + 2);

        if (weaponType === 'sword' || weaponType === 'heavy' || weaponType === 'scythe') {
            // Blade
            const bladeLen = weaponType === 'heavy' ? r * 1.6 : r * 1.3;
            const tipX = px + Math.cos(a) * (r + bladeLen);
            const tipY = py + Math.sin(a) * (r + bladeLen);
            ctx.strokeStyle = hitColor ? '#fff' : wpColor;
            ctx.lineWidth = weaponType === 'heavy' ? 5 : 3;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(wx, wy);
            ctx.lineTo(tipX, tipY);
            ctx.stroke();
            // Cross guard
            const gx1 = px + Math.cos(a + Math.PI / 2) * 6;
            const gy1 = py + Math.sin(a + Math.PI / 2) * 6;
            const gx2 = px + Math.cos(a - Math.PI / 2) * 6;
            const gy2 = py + Math.sin(a - Math.PI / 2) * 6;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(gx1, gy1);
            ctx.lineTo(gx2, gy2);
            ctx.stroke();
            ctx.lineCap = 'butt';
        } else if (weaponType === 'fist') {
            // Gauntlet
            ctx.fillStyle = hitColor ? '#fff' : wpColor;
            const fx = px + Math.cos(a) * (r + 6);
            const fy = py + Math.sin(a) * (r + 6);
            ctx.beginPath();
            ctx.arc(fx, fy, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 1;
            ctx.stroke();
        } else if (weaponType === 'wand') {
            // Wand with glowing tip
            ctx.strokeStyle = hitColor ? '#fff' : '#8B4513';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(wx, wy);
            const wandTipX = px + Math.cos(a) * (r + r * 1.2);
            const wandTipY = py + Math.sin(a) * (r + r * 1.2);
            ctx.lineTo(wandTipX, wandTipY);
            ctx.stroke();
            // Glowing orb
            const orbGlow = ctx.createRadialGradient(wandTipX, wandTipY, 1, wandTipX, wandTipY, 6);
            orbGlow.addColorStop(0, wpColor);
            orbGlow.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = orbGlow;
            ctx.beginPath();
            ctx.arc(wandTipX, wandTipY, 6 + Math.sin(this.animTime * 5) * 1.5, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.globalAlpha = 1;
        ctx.lineWidth = 1;

        // ─── Front accessories ───
        for (const acc of vis.accessories.front || []) {
            if (acc === 'shield') {
                // Knight shield
                const sx = px + Math.cos(a - Math.PI / 2) * scaledR * 0.6;
                const sy = py + bobY + Math.sin(a - Math.PI / 2) * scaledR * 0.6;
                ctx.fillStyle = '#8899aa';
                ctx.strokeStyle = '#555';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.roundRect(sx - scaledR * 0.4, sy - scaledR * 0.6, scaledR * 0.8, scaledR * 1.2, 3);
                ctx.fill();
                ctx.stroke();
                // Shield highlight
                ctx.fillStyle = 'rgba(255,255,255,0.15)';
                ctx.fillRect(sx - scaledR * 0.2, sy - scaledR * 0.4, scaledR * 0.3, scaledR * 0.5);
            }
            if (acc === 'robe_front') {
                const robeColor = vis.bodyColor === '#f5e6d3' ? '#fafafa' : '#3d2b5a';
                ctx.strokeStyle = robeColor;
                ctx.lineWidth = 1.5;
                // V-neck line
                ctx.beginPath();
                ctx.moveTo(px, py + bobY);
                ctx.lineTo(px - scaledR * 0.3, py + bobY + scaledR * 0.7);
                ctx.moveTo(px, py + bobY);
                ctx.lineTo(px + scaledR * 0.3, py + bobY + scaledR * 0.7);
                ctx.stroke();
            }
            if (acc === 'floating_orb') {
                // Floating orb for mage
                const orbAngle = this.animTime * 2;
                const orbDist = scaledR + 12;
                const ox = px + Math.cos(orbAngle) * orbDist;
                const oy = py + bobY + Math.sin(orbAngle) * orbDist;
                const orbGrad = ctx.createRadialGradient(ox, oy, 1, ox, oy, 5);
                orbGrad.addColorStop(0, '#fff');
                orbGrad.addColorStop(0.5, '#00ffff');
                orbGrad.addColorStop(1, 'rgba(0,255,255,0)');
                ctx.fillStyle = orbGrad;
                ctx.beginPath();
                ctx.arc(ox, oy, 5, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.lineWidth = 1;

        // ─── Ninja persistent trail ───
        if (vis.trailColor && !player.isDashing) {
            ctx.fillStyle = vis.trailColor;
            for (let i = 1; i <= 2; i++) {
                const tx = px - Math.cos(a) * i * 6;
                const ty = py + bobY - Math.sin(a) * i * 6;
                ctx.beginPath();
                ctx.arc(tx, ty, scaledR * (1 - i * 0.2), 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // ─── Dash trail ───
        if (player.isDashing) {
            for (let i = 1; i <= 4; i++) {
                const tx = px - player.dashDir.x * i * 12;
                const ty = py - player.dashDir.y * i * 12;
                ctx.fillStyle = `rgba(52,152,219,${0.35 - i * 0.07})`;
                ctx.beginPath();
                ctx.arc(tx, ty, r * (1 - i * 0.15), 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    // ─── Attack slash arc ───
    drawAttackSlash(player) {
        if (player.attackTimer < player.attackSpeed - 0.05) return; // only show right after attack
        const ctx = this.ctx;
        const px = player.x - this.sx;
        const py = player.y - this.sy;
        const a = player.facingAngle;
        const r = player.radius;
        const weaponType = this._getWeaponType(player);
        const progress = 1 - (player.attackTimer / player.attackSpeed);

        ctx.save();
        ctx.globalAlpha = 1 - progress;

        const slashDist = r + 20 + progress * 25;
        const arcWidth = weaponType === 'heavy' ? 1.2 : 0.7;

        if (weaponType === 'heavy') {
            // Wide heavy arc
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 4 * (1 - progress);
            ctx.shadowColor = '#f39c12';
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.arc(px, py, slashDist, a - arcWidth, a + arcWidth);
            ctx.stroke();
            // Inner arc
            ctx.strokeStyle = '#f39c12';
            ctx.lineWidth = 2 * (1 - progress);
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.arc(px, py, slashDist, a - arcWidth * 0.6, a + arcWidth * 0.6);
            ctx.stroke();
        } else if (weaponType === 'scythe') {
            // Curved slash
            ctx.strokeStyle = '#e8da5e';
            ctx.lineWidth = 3 * (1 - progress);
            ctx.shadowColor = '#e8da5e';
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(px, py, slashDist, a - 0.5, a + 0.8);
            ctx.stroke();
            ctx.shadowBlur = 0;
        } else if (weaponType === 'fist') {
            // Burst ring
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 3 * (1 - progress);
            ctx.beginPath();
            ctx.arc(px + Math.cos(a) * (r + 10), py + Math.sin(a) * (r + 10), 8 + progress * 15, 0, Math.PI * 2);
            ctx.stroke();
        } else {
            // Standard sword slash
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2.5 * (1 - progress);
            ctx.shadowColor = '#aaddff';
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(px, py, slashDist, a - 0.5, a + 0.5);
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        ctx.restore();
    }

    drawEnemy(enemy) {
        if (enemy.isDead) return;
        const ctx = this.ctx;
        const ex = enemy.x - this.sx;
        const ey = enemy.y - this.sy;

        // Check if on screen
        if (ex < -50 || ex > this.width + 50 || ey < -50 || ey > this.height + 50) return;

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath();
        ctx.ellipse(ex, ey + enemy.radius * 0.5, enemy.radius * 0.7, enemy.radius * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();

        // Hit flash
        const hitColor = enemy.hitFlash > 0;

        // Boss aura
        if (enemy.isBoss) {
            const auraAlpha = 0.2 + Math.sin(enemy.animTimer * 3) * 0.1;
            ctx.fillStyle = `rgba(231,76,60,${auraAlpha})`;
            ctx.beginPath();
            ctx.arc(ex, ey, enemy.radius + 12, 0, Math.PI * 2);
            ctx.fill();
        }

        switch (enemy.type) {
            case 'slime':
                this.drawSlime(ex, ey, enemy, hitColor);
                break;
            case 'skeleton':
                this.drawSkeleton(ex, ey, enemy, hitColor);
                break;
            case 'shadow_mage':
                this.drawShadowMage(ex, ey, enemy, hitColor);
                break;
            case 'stone_golem':
                this.drawStoneGolem(ex, ey, enemy, hitColor);
                break;
            case 'boss':
                this.drawBoss(ex, ey, enemy, hitColor);
                break;
        }

        // HP bar (only if damaged)
        if (enemy.hp < enemy.maxHp) {
            const barW = enemy.radius * 2;
            const barH = 3;
            const barY = ey - enemy.radius - 8;
            ctx.fillStyle = '#333';
            ctx.fillRect(ex - barW / 2, barY, barW, barH);
            const hpPct = enemy.hp / enemy.maxHp;
            const hpColor = hpPct > 0.5 ? '#2ecc71' : hpPct > 0.25 ? '#f39c12' : '#e74c3c';
            ctx.fillStyle = hpColor;
            ctx.fillRect(ex - barW / 2, barY, barW * hpPct, barH);
        }
    }

    drawSlime(ex, ey, e, hit) {
        const ctx = this.ctx;
        const bounce = Math.sin(e.animTimer * 4) * 2;
        ctx.fillStyle = hit ? '#fff' : '#4ecb71';
        ctx.beginPath();
        ctx.arc(ex, ey + bounce, e.radius, Math.PI, 0);
        ctx.arc(ex, ey + bounce + 3, e.radius, 0, Math.PI);
        ctx.fill();
        ctx.fillStyle = hit ? '#fff' : '#3aa85a';
        ctx.beginPath();
        ctx.arc(ex - 3, ey + bounce - 3, 3, 0, Math.PI * 2);
        ctx.arc(ex + 3, ey + bounce - 3, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#111';
        ctx.arc(ex - 2, ey + bounce - 3, 1.5, 0, Math.PI * 2);
        ctx.arc(ex + 4, ey + bounce - 3, 1.5, 0, Math.PI * 2);
        ctx.fill();
    }

    drawSkeleton(ex, ey, e, hit) {
        const ctx = this.ctx;
        ctx.fillStyle = hit ? '#fff' : '#ddd';
        // Skull
        ctx.beginPath();
        ctx.arc(ex, ey - 4, e.radius * 0.6, 0, Math.PI * 2);
        ctx.fill();
        // Body
        ctx.fillRect(ex - 4, ey - 1, 8, e.radius);
        // Eyes
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(ex - 3, ey - 7, 2, 3);
        ctx.fillRect(ex + 1, ey - 7, 2, 3);
    }

    drawShadowMage(ex, ey, e, hit) {
        const ctx = this.ctx;
        const float = Math.sin(e.animTimer * 3) * 3;
        ctx.fillStyle = hit ? '#fff' : '#9b59b6';
        // Hood
        ctx.beginPath();
        ctx.moveTo(ex, ey - e.radius - 4 + float);
        ctx.lineTo(ex + e.radius, ey + e.radius * 0.5 + float);
        ctx.lineTo(ex - e.radius, ey + e.radius * 0.5 + float);
        ctx.closePath();
        ctx.fill();
        // Body
        ctx.fillRect(ex - e.radius * 0.6, ey + float, e.radius * 1.2, e.radius);
        // Glowing eyes
        ctx.fillStyle = '#e8da5e';
        ctx.beginPath();
        ctx.arc(ex - 4, ey - 4 + float, 3, 0, Math.PI * 2);
        ctx.arc(ex + 4, ey - 4 + float, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    drawStoneGolem(ex, ey, e, hit) {
        const ctx = this.ctx;
        ctx.fillStyle = hit ? '#ccc' : '#888';
        // Rectangular body
        ctx.fillRect(ex - e.radius, ey - e.radius * 0.7, e.radius * 2, e.radius * 1.8);
        // Head
        ctx.fillRect(ex - e.radius * 0.5, ey - e.radius * 1.2, e.radius, e.radius * 0.6);
        // Cracks
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(ex - 4, ey - 2);
        ctx.lineTo(ex + 2, ey + 4);
        ctx.moveTo(ex + 5, ey);
        ctx.lineTo(ex + 8, ey + 6);
        ctx.stroke();
        // Eyes
        ctx.fillStyle = '#f39c12';
        ctx.fillRect(ex - 5, ey - e.radius, 3, 3);
        ctx.fillRect(ex + 2, ey - e.radius, 3, 3);
    }

    drawBoss(ex, ey, e, hit) {
        const ctx = this.ctx;
        const pulse = Math.sin(e.animTimer * 2) * 2;
        const r = e.radius + pulse;
        ctx.fillStyle = hit ? '#fff' : '#c0392b';
        // Body
        ctx.beginPath();
        ctx.arc(ex, ey, r, 0, Math.PI * 2);
        ctx.fill();
        // Darker inner
        ctx.fillStyle = hit ? '#eee' : '#922b21';
        ctx.beginPath();
        ctx.arc(ex, ey, r * 0.7, 0, Math.PI * 2);
        ctx.fill();
        // Horns
        ctx.fillStyle = hit ? '#ddd' : '#2c3e50';
        ctx.beginPath();
        ctx.moveTo(ex - r * 0.5, ey - r * 0.6);
        ctx.lineTo(ex - r * 0.8, ey - r * 1.3);
        ctx.lineTo(ex - r * 0.3, ey - r * 0.5);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(ex + r * 0.5, ey - r * 0.6);
        ctx.lineTo(ex + r * 0.8, ey - r * 1.3);
        ctx.lineTo(ex + r * 0.3, ey - r * 0.5);
        ctx.fill();
        // Eyes
        ctx.fillStyle = '#f1c40f';
        ctx.beginPath();
        ctx.arc(ex - 6, ey - 4, 5, 0, Math.PI * 2);
        ctx.arc(ex + 6, ey - 4, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e74c3c';
        ctx.beginPath();
        ctx.arc(ex - 6, ey - 4, 2.5, 0, Math.PI * 2);
        ctx.arc(ex + 6, ey - 4, 2.5, 0, Math.PI * 2);
        ctx.fill();
    }

    drawProjectiles(projectiles) {
        const ctx = this.ctx;
        for (const p of projectiles) {
            if (!p.active) continue;
            const px = p.x - this.sx;
            const py = p.y - this.sy;
            if (px < -30 || px > this.width + 30 || py < -30 || py > this.height + 30) continue;

            // Trail
            const trailLen = p.size * 2;
            const trailX = px - (p.vx || 0) * 0.04;
            const trailY = py - (p.vy || 0) * 0.04;
            const trailGrad = ctx.createLinearGradient(px, py, trailX, trailY);
            trailGrad.addColorStop(0, p.color);
            trailGrad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = trailGrad;
            ctx.beginPath();
            ctx.arc(px, py, p.size + 1, 0, Math.PI * 2);
            ctx.fill();

            // Glow
            ctx.fillStyle = p.color;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(px, py, p.size, 0, Math.PI * 2);
            ctx.fill();

            // Inner bright core
            ctx.fillStyle = '#fff';
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.arc(px, py, p.size * 0.4, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    drawDamageNumber(x, y, amount, crit = false) {
        if (amount <= 0) return;
        const ctx = this.ctx;
        const dx = x - this.sx + (Math.random() - 0.5) * 16;
        const dy = y - this.sy - 15 - Math.random() * 10;
        ctx.save();
        if (crit) {
            ctx.font = 'bold 18px monospace';
            ctx.fillStyle = '#f1c40f';
            ctx.shadowColor = '#f1c40f';
            ctx.shadowBlur = 8;
            ctx.fillText(`${amount}!`, dx, dy);
            ctx.shadowBlur = 0;
        } else {
            ctx.font = '13px monospace';
            ctx.fillStyle = '#fff';
            ctx.fillText(`${amount}`, dx, dy);
        }
        ctx.restore();
        ctx.textAlign = 'start';
    }

    drawMinimap(dungeon, player, minimapSize = 140) {
        const ctx = this.ctx;
        const mx = this.width - minimapSize - 12;
        const my = 12;
        const scaleX = minimapSize / dungeon.pixelWidth;
        const scaleY = minimapSize / dungeon.pixelHeight;

        // Background
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(mx - 2, my - 2, minimapSize + 4, minimapSize + 4);
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 1;
        ctx.strokeRect(mx - 2, my - 2, minimapSize + 4, minimapSize + 4);

        // Rooms - show all rooms
        for (const room of dungeon.rooms) {
            const rx = mx + room.px * scaleX;
            const ry = my + room.py * scaleY;
            const rw = room.pw * scaleX;
            const rh = room.ph * scaleY;
            let color = '#444';
            if (room.visited) {
                if (room === dungeon.currentRoom) color = '#3498db';
                else if (room.type === ROOM_TYPES.BOSS) color = '#e74c3c';
                else if (room.type === ROOM_TYPES.TREASURE) color = '#f1c40f';
                else if (room.type === ROOM_TYPES.START) color = '#2ecc71';
                else color = '#666';
            } else {
                if (room.type === ROOM_TYPES.BOSS) color = '#5a1a1a';
                else if (room.type === ROOM_TYPES.TREASURE) color = '#5a5010';
            }
            ctx.fillStyle = color;
            ctx.fillRect(rx, ry, Math.max(rw, 2), Math.max(rh, 2));
        }

        // Player
        const px = mx + player.x * scaleX;
        const py = my + player.y * scaleY;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    // ─── Clone drawing ───
    drawClone(c) {
        const ctx = this.ctx;
        const px = c.x - this.sx;
        const py = c.y - this.sy;
        if (px < -40 || px > this.width + 40 || py < -40 || py > this.height + 40) return;

        const alpha = Math.max(0.15, c.life / 8 * 0.55);
        ctx.globalAlpha = alpha;
        // Body
        ctx.fillStyle = '#aaddff';
        ctx.beginPath();
        ctx.arc(px, py, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();
        // Eyes
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(px - 3, py - 3, 2, 0, Math.PI * 2);
        ctx.arc(px + 3, py - 3, 2, 0, Math.PI * 2);
        ctx.fill();
        // Fade pulse
        const pulse = Math.sin(c.animTimer * 6) * 0.15 + 0.2;
        ctx.fillStyle = `rgba(200,220,255,${pulse})`;
        ctx.beginPath();
        ctx.arc(px, py, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    // ─── Meteor indicator ───
    drawMeteorIndicator(eff) {
        const ctx = this.ctx;
        const px = eff.x - this.sx;
        const py = eff.y - this.sy;
        const progress = 1 - (eff.delay / 0.8);
        const radius = 20 + progress * 80;
        const alpha = 0.3 + progress * 0.5;

        ctx.save();
        ctx.globalAlpha = alpha;
        // Warning circle
        ctx.strokeStyle = '#e74c3c';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 4]);
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        // Center dot
        ctx.fillStyle = '#f44';
        ctx.beginPath();
        ctx.arc(px, py, 4 + Math.sin(this.animTime * 15) * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // ─── Chain lightning arcs ───
    drawChainLightning(cl) {
        const ctx = this.ctx;
        const alpha = cl.life / 0.35;
        ctx.save();
        ctx.globalAlpha = alpha * 0.8;
        ctx.strokeStyle = '#5dade2';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#3498db';
        ctx.shadowBlur = 10;

        const points = cl.points;
        for (let i = 1; i < points.length; i++) {
            const from = points[i - 1];
            const to = points[i];
            const fx = from.x - this.sx;
            const fy = from.y - this.sy;
            const tx = to.x - this.sx;
            const ty = to.y - this.sy;
            // Draw jagged lightning
            ctx.beginPath();
            ctx.moveTo(fx, fy);
            const segments = 6;
            for (let s = 1; s <= segments; s++) {
                const t = s / segments;
                const mx = fx + (tx - fx) * t;
                const my = fy + (ty - fy) * t;
                const jitter = (s < segments ? (Math.random() - 0.5) * 20 : 0);
                ctx.lineTo(mx + jitter, my + jitter);
            }
            ctx.stroke();
        }
        ctx.shadowBlur = 0;
        ctx.restore();
    }

    drawVignette() {
        const ctx = this.ctx;
        // Screen flash
        if (this.screenFlash > 0) {
            ctx.fillStyle = this.screenFlashColor.replace(')', `,${this.screenFlash * 3})`).replace('rgb', 'rgba');
            if (this.screenFlashColor.startsWith('#')) {
                const alpha = Math.min(0.4, this.screenFlash * 5);
                ctx.fillStyle = `rgba(255,255,255,${alpha})`;
            }
            ctx.fillRect(0, 0, this.width, this.height);
        }
        // Vignette
        const gradient = ctx.createRadialGradient(
            this.width / 2, this.height / 2, this.width * 0.35,
            this.width / 2, this.height / 2, this.width * 0.75
        );
        gradient.addColorStop(0, 'rgba(0,0,0,0)');
        gradient.addColorStop(1, 'rgba(0,0,0,0.55)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, this.width, this.height);
    }
}
