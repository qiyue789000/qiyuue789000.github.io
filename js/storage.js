// Centralized localStorage wrapper
const STORAGE_PREFIX = 'roguelike_';

export const KEYS = {
    LOGIN: 'login',
    PROFILE: 'profile',
    CHAT: 'chat',
    SETTINGS: 'settings',
    AUTO_LOGIN: 'auto_login'
};

function _key(name) {
    return STORAGE_PREFIX + name;
}

export const storage = {
    get(key, defaultValue = null) {
        try {
            const raw = localStorage.getItem(_key(key));
            if (raw === null) return defaultValue;
            return JSON.parse(raw);
        } catch {
            return defaultValue;
        }
    },

    set(key, value) {
        try {
            localStorage.setItem(_key(key), JSON.stringify(value));
        } catch {
            // localStorage full or unavailable
        }
    },

    remove(key) {
        try {
            localStorage.removeItem(_key(key));
        } catch { /* ignore */ }
    }
};
