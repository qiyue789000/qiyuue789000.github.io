import { rand, choice, dist } from './utils.js';

const TILE = 32;
const MAIN_PATH_LENGTH_MIN = 5;
const MAIN_PATH_LENGTH_MAX = 7;
const ROOM_W_MIN = 9;
const ROOM_W_MAX = 12;
const ROOM_H_MIN = 8;
const ROOM_H_MAX = 11;

export const ROOM_TYPES = {
    START:    'start',
    BATTLE:   'battle',
    TREASURE: 'treasure',
    BOSS:     'boss',
    SHOP:     'shop'
};

export class Room {
    constructor(px, py, pw, ph, id) {
        this.px = px;
        this.py = py;
        this.pw = pw;
        this.ph = ph;
        this.cx = px + pw / 2;
        this.cy = py + ph / 2;
        this.type = ROOM_TYPES.BATTLE;
        this.cleared = false;
        this.enemies = [];
        this.visited = false;
        this.id = id || `room_${px}_${py}`;
        this.doors = { top: false, bottom: false, left: false, right: false };
        // For branch rooms
        this.branch = null;
        this.parent = null;
    }

    containsPoint(x, y) {
        return x >= this.px && x <= this.px + this.pw &&
               y >= this.py && y <= this.py + this.ph;
    }

    get randomPosition() {
        const margin = 40;
        return {
            x: this.px + margin + Math.random() * (this.pw - margin * 2),
            y: this.py + margin + Math.random() * (this.ph - margin * 2)
        };
    }
}

export class Dungeon {
    constructor(floor = 1) {
        this.floor = floor;
        this.rooms = [];
        this.corridors = [];
        this.wallRects = [];
        this.startRoom = null;
        this.bossRoom = null;
        this.pixelWidth = 3000;
        this.pixelHeight = 1800;
        this.generate();
    }

    generate() {
        this.rooms = [];
        this.corridors = [];
        this.wallRects = [];

        // Main path: horizontal line of rooms
        const mainCount = rand(MAIN_PATH_LENGTH_MIN, MAIN_PATH_LENGTH_MAX);
        const startY = 800;
        let curX = 100;

        // Create start room
        const startW = rand(ROOM_W_MIN, ROOM_W_MAX) * TILE;
        const startH = (ROOM_H_MIN + 2) * TILE;
        this.startRoom = new Room(curX, startY - startH / 2, startW, startH, 'room_start');
        this.startRoom.type = ROOM_TYPES.START;
        this.startRoom.cleared = true;
        this.startRoom.visited = true;
        this.rooms.push(this.startRoom);
        curX += startW + rand(20, 40);

        // Battle rooms along main path
        for (let i = 0; i < mainCount; i++) {
            const rw = rand(ROOM_W_MIN, ROOM_W_MAX) * TILE;
            const rh = rand(ROOM_H_MIN, ROOM_H_MAX) * TILE;
            const ry = startY - rh / 2 + rand(-60, 60);
            const room = new Room(curX, ry, rw, rh, `room_main_${i}`);
            this.rooms.push(room);
            curX += rw + rand(20, 40);
        }

        // Boss room at the end
        const bossW = (ROOM_W_MAX + 2) * TILE;
        const bossH = (ROOM_H_MAX + 2) * TILE;
        this.bossRoom = new Room(curX, startY - bossH / 2, bossW, bossH, 'room_boss');
        this.bossRoom.type = ROOM_TYPES.BOSS;
        this.rooms.push(this.bossRoom);

        // Branch rooms
        const branchCount = rand(1, 3);
        const mainRooms = this.rooms.filter(r => r.type === ROOM_TYPES.BATTLE);
        for (let i = 0; i < branchCount; i++) {
            if (mainRooms.length === 0) break;
            const parent = choice(mainRooms);
            mainRooms.splice(mainRooms.indexOf(parent), 1); // don't reuse same room
            const brw = rand(ROOM_W_MIN - 2, ROOM_W_MIN) * TILE;
            const brh = rand(ROOM_H_MIN - 2, ROOM_H_MIN) * TILE;
            const above = Math.random() > 0.5;
            const bry = above ? parent.py - brh - rand(30, 60) : parent.py + parent.ph + rand(30, 60);
            const brx = parent.cx - brw / 2 + rand(-40, 40);
            const branch = new Room(brx, bry, brw, brh, `room_branch_${i}`);
            branch.parent = parent;
            parent.branch = branch;
            this.rooms.push(branch);
        }

        // Assign treasure and shop to branch rooms
        const branches = this.rooms.filter(r => r.branch);
        if (branches.length > 0) {
            branches[0].type = ROOM_TYPES.TREASURE;
        }
        if (branches.length > 1) {
            branches[1].type = ROOM_TYPES.SHOP;
        }

        // If no branches assigned shop, give it to a main room
        if (!this.rooms.some(r => r.type === ROOM_TYPES.SHOP)) {
            const mid = this.rooms[Math.floor(this.rooms.length / 2)];
            if (mid && mid.type === ROOM_TYPES.BATTLE) mid.type = ROOM_TYPES.SHOP;
        }

        // Update pixel dimensions
        this.pixelWidth = curX + bossW + 200;
        this.pixelHeight = startY * 2;

        this.calculateWalls();
    }

    calculateWalls() {
        const cols = Math.ceil(this.pixelWidth / TILE);
        const rows = Math.ceil(this.pixelHeight / TILE);
        this.walkableGrid = Array.from({ length: rows }, () => Array(cols).fill(true));
        this.wallRects = [];
    }

    getRoomAt(x, y) {
        return this.rooms.find(r => r.containsPoint(x, y)) || null;
    }

    isWalkable(x, y) {
        const tx = Math.floor(x / TILE);
        const ty = Math.floor(y / TILE);
        if (ty < 0 || ty >= this.walkableGrid.length) return false;
        if (tx < 0 || tx >= this.walkableGrid[0].length) return false;
        return this.walkableGrid[ty][tx];
    }
}
