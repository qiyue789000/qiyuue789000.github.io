import { rand, choice, dist } from './utils.js';

const TILE = 32;
const GRID_COLS = 4;
const GRID_ROWS = 4;
const ROOM_SPACING = 380;
const MIN_ROOM_SIZE = 7;
const MAX_ROOM_SIZE = 10;

export const ROOM_TYPES = {
    START:    'start',
    BATTLE:   'battle',
    TREASURE: 'treasure',
    BOSS:     'boss',
    SHOP:     'shop'
};

export class Room {
    constructor(gridX, gridY, tileW, tileH) {
        this.gridX = gridX;
        this.gridY = gridY;
        this.tileW = tileW;
        this.tileH = tileH;
        this.px = gridX * ROOM_SPACING + rand(0, 40);
        this.py = gridY * ROOM_SPACING + rand(0, 40);
        this.pw = tileW * TILE;
        this.ph = tileH * TILE;
        this.cx = this.px + this.pw / 2;
        this.cy = this.py + this.ph / 2;
        this.type = ROOM_TYPES.BATTLE;
        this.doors = { top: false, bottom: false, left: false, right: false };
        this.cleared = false;
        this.enemies = [];
        this.visited = false;
        this.id = `room_${gridX}_${gridY}`;
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
        this.gridCols = GRID_COLS;
        this.gridRows = GRID_ROWS;
        this.pixelWidth = GRID_COLS * ROOM_SPACING + MAX_ROOM_SIZE * TILE;
        this.pixelHeight = GRID_ROWS * ROOM_SPACING + MAX_ROOM_SIZE * TILE;
        this.startRoom = null;
        this.bossRoom = null;
        this.generate();
    }

    generate() {
        this.rooms = [];
        this.corridors = [];
        this.wallRects = [];

        // Generate rooms on a grid with random sizes
        const grid = [];
        for (let gy = 0; gy < GRID_ROWS; gy++) {
            grid[gy] = [];
            for (let gx = 0; gx < GRID_COLS; gx++) {
                // Skip ~40% of grid cells for open exploration feel
                if (Math.random() < 0.45) {
                    grid[gy][gx] = null;
                    continue;
                }
                const tw = rand(MIN_ROOM_SIZE, MAX_ROOM_SIZE);
                const th = rand(MIN_ROOM_SIZE, MAX_ROOM_SIZE);
                grid[gy][gx] = new Room(gx, gy, tw, th);
                this.rooms.push(grid[gy][gx]);
            }
        }

        // Ensure at least 6 rooms
        while (this.rooms.length < 6) {
            const gx = rand(0, GRID_COLS - 1);
            const gy = rand(0, GRID_ROWS - 1);
            if (!grid[gy][gx]) {
                const tw = rand(MIN_ROOM_SIZE, MAX_ROOM_SIZE);
                const th = rand(MIN_ROOM_SIZE, MAX_ROOM_SIZE);
                grid[gy][gx] = new Room(gx, gy, tw, th);
                this.rooms.push(grid[gy][gx]);
            }
        }

        // Connect rooms with corridors (minimum spanning tree + extra connections)
        const edges = [];
        for (let i = 0; i < this.rooms.length; i++) {
            for (let j = i + 1; j < this.rooms.length; j++) {
                const d = dist(this.rooms[i].cx, this.rooms[i].cy, this.rooms[j].cx, this.rooms[j].cy);
                edges.push({ i, j, d });
            }
        }
        edges.sort((a, b) => a.d - b.d);

        // Union-find for MST
        const parent = Array.from({ length: this.rooms.length }, (_, i) => i);
        const find = (x) => parent[x] === x ? x : (parent[x] = find(parent[x]));
        const union = (a, b) => { parent[find(a)] = find(b); };

        const mstEdges = [];
        for (const e of edges) {
            if (find(e.i) !== find(e.j)) {
                union(e.i, e.j);
                mstEdges.push(e);
            }
        }

        // Add some extra connections
        const extraCount = Math.floor(this.rooms.length * 0.3);
        for (const e of edges) {
            if (extraCount <= 0) break;
            if (!mstEdges.includes(e)) {
                mstEdges.push(e);
            }
        }

        // Build corridors
        for (const e of mstEdges) {
            const a = this.rooms[e.i];
            const b = this.rooms[e.j];
            this.addCorridor(a, b);
        }

        // Set room types
        this.startRoom = this.rooms[0] || this.rooms.find(r => r);
        this.startRoom.type = ROOM_TYPES.START;
        this.startRoom.cleared = true;
        this.startRoom.visited = true;

        // Find farthest room for boss
        let maxDist = 0;
        let bossCandidate = this.rooms[1] || this.rooms[0];
        for (const r of this.rooms) {
            if (r === this.startRoom) continue;
            const d = dist(this.startRoom.cx, this.startRoom.cy, r.cx, r.cy);
            if (d > maxDist) { maxDist = d; bossCandidate = r; }
        }
        this.bossRoom = bossCandidate;
        this.bossRoom.type = ROOM_TYPES.BOSS;

        // Treasure room
        const others = this.rooms.filter(r => r !== this.startRoom && r !== this.bossRoom);
        if (others.length > 0) {
            const treasure = choice(others);
            if (treasure) treasure.type = ROOM_TYPES.TREASURE;
        }

        if (others.length > 1) {
            const shopCandidate = others.find(r => r.type === ROOM_TYPES.BATTLE);
            if (shopCandidate) shopCandidate.type = ROOM_TYPES.SHOP;
        }

        // Calculate wall rects for collision
        this.calculateWalls();
    }

    addCorridor(a, b) {
        // L-shaped corridor
        const midX = a.cx;
        const midY = b.cy;
        this.corridors.push({ x1: a.cx, y1: a.cy, x2: midX, y2: a.cy });
        this.corridors.push({ x1: midX, y1: a.cy, x2: midX, y2: b.cy });
        this.corridors.push({ x1: midX, y1: b.cy, x2: b.cx, y2: b.cy });

        // Set doors based on corridor geometry (vertical from a, then horizontal into b)
        if (b.cy > a.cy) {
            a.doors.bottom = true;
        } else {
            a.doors.top = true;
        }
        if (b.cx > a.cx) {
            b.doors.left = true;
        } else {
            b.doors.right = true;
        }
    }

    calculateWalls() {
        // Exploration mode: no walls, everything is walkable
        const cols = Math.ceil(this.pixelWidth / TILE);
        const rows = Math.ceil(this.pixelHeight / TILE);
        const walkable = Array.from({ length: rows }, () => Array(cols).fill(true));
        this.walkableGrid = walkable;
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
