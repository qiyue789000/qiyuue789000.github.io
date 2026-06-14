// Utility functions

export function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randFloat(min, max) {
    return Math.random() * (max - min) + min;
}

export function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

export function dist(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
}

export function angle(x1, y1, x2, y2) {
    return Math.atan2(y2 - y1, x2 - x1);
}

export function lerp(a, b, t) {
    return a + (b - a) * t;
}

export function rgb(r, g, b, a = 1) {
    return `rgba(${r},${g},${b},${a})`;
}

export function hsl(h, s, l, a = 1) {
    return `hsla(${h},${s}%,${l}%,${a})`;
}

export function choice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// XP needed to reach next level (1-indexed)
export function xpForLevel(level) {
    return Math.floor(level * 100 + Math.pow(level, 1.5) * 50);
}

// Generate a random ID
export function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// Check AABB collision
export function aabb(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// Point in rect
export function pointInRect(px, py, rx, ry, rw, rh) {
    return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}
