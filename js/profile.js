// Profile Manager - tracks player stats, game history, achievements
import { storage, KEYS } from './storage.js';

// 15 achievements
const ACHIEVEMENTS = [
    { id: 'first_blood', name: '初次击杀', desc: '击杀第一个敌人', icon: '⚔️', check: (s) => s.enemiesKilled >= 1 },
    { id: 'slayer_50', name: '百人斩', desc: '累计击杀50个敌人', icon: '💀', check: (s) => s.totalEnemiesKilled >= 50 },
    { id: 'reach_floor_5', name: '深入地下', desc: '到达地下第5层', icon: '⬇️', check: (s) => s.maxFloor >= 5 },
    { id: 'reach_floor_10', name: '深渊行者', desc: '到达地下第10层', icon: '🕳️', check: (s) => s.maxFloor >= 10 },
    { id: 'level_20', name: '初露锋芒', desc: '达到20级', icon: '⭐', check: (s) => s.maxLevel >= 20 },
    { id: 'level_50', name: '实力超群', desc: '达到50级', icon: '🌟', check: (s) => s.maxLevel >= 50 },
    { id: 'level_100', name: '登峰造极', desc: '达到100级', icon: '👑', check: (s) => s.maxLevel >= 100 },
    { id: 'boss_slayer', name: 'Boss杀手', desc: '击败第一个Boss', icon: '👹', check: (s) => s.totalBossesKilled >= 1 },
    { id: 'boss_hunter', name: 'Boss猎手', desc: '累计击败10个Boss', icon: '🏆', check: (s) => s.totalBossesKilled >= 10 },
    { id: 'gold_5000', name: '财富积累', desc: '累计收集5000金币', icon: '🪙', check: (s) => s.totalGold >= 5000 },
    { id: 'full_epic', name: '史诗战士', desc: '装备3件以上史诗装备', icon: '💜', check: (s) => s.maxEpicEquipped >= 3 },
    { id: 'first_death', name: '初次死亡', desc: '第一次阵亡', icon: '💔', check: (s) => s.totalDeaths >= 1 },
    { id: 'skill_collector', name: '技能收集家', desc: '解锁5个以上主动技能', icon: '📚', check: (s) => s.maxSkills >= 5 },
    { id: 'multi_class', name: '多面手', desc: '用3种不同职业完成游戏', icon: '🎭', check: (s) => s.classesPlayed.length >= 3 },
    { id: 'speed_demon', name: '速通达人', desc: '单局30分钟内到达第5层', icon: '⚡', check: (s) => s.fastestFloor5 > 0 && s.fastestFloor5 <= 1800 }
];

function makeProfile(email) {
    return {
        email: email || '',
        displayName: email ? email.split('@')[0] : '冒险者',
        totalGames: 0,
        totalPlayTime: 0,
        totalEnemiesKilled: 0,
        totalBossesKilled: 0,
        totalGold: 0,
        totalDeaths: 0,
        maxFloor: 0,
        maxLevel: 0,
        maxEpicEquipped: 0,
        maxSkills: 0,
        fastestFloor5: 0,
        classesPlayed: [],
        runHistory: [],
        achievements: [],
        createdAt: Date.now()
    };
}

export class ProfileManager {
    constructor(email) {
        this.email = email;
        this.data = storage.get(KEYS.PROFILE);
        if (!this.data || this.data.email !== email) {
            this.data = makeProfile(email);
        }
        this._currentRun = null;
    }

    startRun(classId) {
        this._currentRun = {
            id: Date.now().toString(36),
            date: Date.now(),
            classId,
            level: 0,
            floor: 0,
            gold: 0,
            playTime: 0,
            enemiesKilled: 0,
            bossesKilled: 0,
            skills: [],
            epicCount: 0,
            ended: false
        };
    }

    updateRun(stats) {
        if (!this._currentRun) return;
        const r = this._currentRun;
        if (stats.level) r.level = Math.max(r.level, stats.level);
        if (stats.floor) r.floor = Math.max(r.floor, stats.floor);
        if (stats.gold !== undefined) r.gold = stats.gold;
        if (stats.playTime) r.playTime = stats.playTime;
        if (stats.enemiesKilled) r.enemiesKilled = stats.enemiesKilled;
        if (stats.bossesKilled) r.bossesKilled = stats.bossesKilled;
        if (stats.skills) r.skills = stats.skills;
        if (stats.epicCount) r.epicCount = Math.max(r.epicCount, stats.epicCount);
    }

    endRun(deathInfo) {
        if (!this._currentRun) return;
        const r = this._currentRun;
        r.ended = true;
        if (deathInfo) r.deathCause = deathInfo;

        // Update aggregate stats
        const d = this.data;
        d.totalGames++;
        d.totalPlayTime += r.playTime;
        d.totalEnemiesKilled += r.enemiesKilled;
        d.totalBossesKilled += r.bossesKilled;
        d.totalGold += r.gold;
        if (deathInfo) d.totalDeaths++;
        d.maxFloor = Math.max(d.maxFloor, r.floor);
        d.maxLevel = Math.max(d.maxLevel, r.level);
        d.maxEpicEquipped = Math.max(d.maxEpicEquipped, r.epicCount);
        d.maxSkills = Math.max(d.maxSkills, r.skills.length);
        if (!d.classesPlayed.includes(r.classId)) d.classesPlayed.push(r.classId);
        if (r.floor >= 5 && (d.fastestFloor5 === 0 || r.playTime < d.fastestFloor5)) {
            d.fastestFloor5 = r.playTime;
        }

        // Check achievements
        const summary = {
            enemiesKilled: r.enemiesKilled,
            totalEnemiesKilled: d.totalEnemiesKilled,
            maxFloor: d.maxFloor,
            maxLevel: d.maxLevel,
            totalBossesKilled: d.totalBossesKilled,
            totalGold: d.totalGold,
            maxEpicEquipped: d.maxEpicEquipped,
            maxSkills: d.maxSkills,
            totalDeaths: d.totalDeaths,
            fastestFloor5: d.fastestFloor5,
            classesPlayed: d.classesPlayed
        };
        for (const ach of ACHIEVEMENTS) {
            if (!d.achievements.includes(ach.id) && ach.check(summary)) {
                d.achievements.push(ach.id);
                // Return new achievements for notification
                if (!this._newAchievements) this._newAchievements = [];
                this._newAchievements.push(ach);
            }
        }

        // Keep last 15 runs
        d.runHistory.unshift(r);
        if (d.runHistory.length > 15) d.runHistory.pop();

        this._currentRun = null;
        this._save();
        return this._newAchievements || [];
    }

    getAchievementList() {
        return ACHIEVEMENTS.map(a => ({
            ...a,
            unlocked: this.data.achievements.includes(a.id)
        }));
    }

    getStats() {
        return {
            totalGames: this.data.totalGames,
            totalPlayTime: this.data.totalPlayTime,
            totalEnemiesKilled: this.data.totalEnemiesKilled,
            totalBossesKilled: this.data.totalBossesKilled,
            totalGold: this.data.totalGold,
            maxFloor: this.data.maxFloor,
            maxLevel: this.data.maxLevel,
            runHistory: this.data.runHistory,
            achievements: this.getAchievementList(),
            classesPlayed: this.data.classesPlayed
        };
    }

    _save() {
        storage.set(KEYS.PROFILE, this.data);
    }
}
