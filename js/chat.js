// Chat Service - localStorage-based chat with WebSocket preparation
import { storage, KEYS } from './storage.js';

const MAX_MESSAGES = 200;

// --- Content Filter ---
// URL/link detection patterns
const URL_PATTERNS = [
    /https?:\/\/\S+/gi,
    /www\.\S+/gi,
    /\S+\.(com|cn|net|org|xyz|top|site|xyz|club|info|cc|me|io|app|dev)\b/gi,
    /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g
];

// Banned keywords by category
const BANNED_KEYWORDS = {
    sexual: [
        '色情', '黄色', '裸体', '裸聊', '成人', 'AV', '做爱', '性交', '口交', '肛交',
        '约炮', '一夜情', '嫖娼', '卖淫', '援交', '包养', '淫秽', '淫荡',
        '骚', '鸡巴', '操你', 'fuck', 'shit', 'sexy', 'porn',
        '小妹', '美女上门', '按摩服务', '特殊服务', '上门服务'
    ],
    gambling: [
        '赌博', '赌场', '博彩', '彩票', '下注', '押注', '赌球',
        '六合彩', '时时彩', '百家乐', '老虎机', '德州扑克',
        'bet', 'casino', 'poker', 'gambling',
        '稳赚', '日赚', '兼职赚钱', '刷单', '返利'
    ],
    political: [
        '习近平', '李克强', '毛泽东', '邓小平', '共产党', '国民党',
        '台独', '藏独', '疆独', '港独', '法轮功', '六四',
        '天安门', '民主运动', '反共', '中共', '政治',
        '习近平', '江zm', '胡jt', '温jb',
        'morning', 'tiananmen', 'tibet', 'taiwan independence',
        '迫害', '独裁', '专制', '人权', '言论自由'
    ]
};

// Merge all banned keywords into a single regex
function buildBannedRegex() {
    const all = [];
    for (const cat of Object.values(BANNED_KEYWORDS)) {
        all.push(...cat);
    }
    // Escape special regex chars and join
    const escaped = all.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp(escaped.join('|'), 'i');
}
const BANNED_REGEX = buildBannedRegex();

export function filterMessage(text) {
    if (!text || !text.trim()) return { blocked: false, text: '' };

    // Check for URLs/links
    for (const pattern of URL_PATTERNS) {
        if (pattern.test(text)) {
            return { blocked: true, reason: '禁止发送链接' };
        }
    }

    // Check for banned keywords
    if (BANNED_REGEX.test(text)) {
        return { blocked: true, reason: '消息包含违规内容，已拦截' };
    }

    return { blocked: false, text: text.trim() };
}

export class ChatService {
    constructor(senderName) {
        this.senderName = senderName || '冒险者';
        this._store = storage.get(KEYS.CHAT, { messages: [] });
        this._listeners = [];
    }

    sendSystem(type, data) {
        let content = '';
        switch (type) {
            case 'death':
                content = `💀 ${this.senderName} 在地下 ${data.floor} 层倒下，达到 ${data.level} 级`;
                break;
            case 'achievement':
                content = `🏆 ${this.senderName} 获得成就: ${data.name}`;
                break;
            case 'floor':
                content = `⬇️ ${this.senderName} 进入地下 ${data.floor} 层`;
                break;
            case 'boss_kill':
                content = `⚔️ ${this.senderName} 击败了地牢守卫！`;
                break;
            case 'level_up':
                if (data.level % 10 === 0) {
                    content = `⭐ ${this.senderName} 升到 ${data.level} 级！`;
                }
                break;
            case 'class_select':
                content = `🎭 ${this.senderName} 选择了职业: ${data.className}`;
                break;
            case 'legendary':
                content = `✨ ${this.senderName} 获得了传说装备: ${data.itemName}！`;
                break;
            case 'filter_warning':
                content = `⚠️ 系统提示: ${data.reason}`;
                break;
        }
        if (content) this._addMessage(content, 'system');
    }

    sendChat(text) {
        if (!text || !text.trim()) return { blocked: false };
        const result = filterMessage(text);
        if (result.blocked) {
            this.sendSystem('filter_warning', { reason: result.reason });
            return result;
        }
        this._addMessage(result.text, 'chat');
        return { blocked: false };
    }

    _addMessage(content, channel) {
        const msg = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            sender: channel === 'chat' ? this.senderName : '',
            content,
            channel,
            timestamp: Date.now()
        };
        this._store.messages.push(msg);
        if (this._store.messages.length > MAX_MESSAGES) {
            this._store.messages = this._store.messages.slice(-MAX_MESSAGES);
        }
        storage.set(KEYS.CHAT, this._store);
        for (const fn of this._listeners) fn(msg);
    }

    getMessages() {
        return this._store.messages;
    }

    onMessage(callback) {
        this._listeners.push(callback);
    }

    // Future WebSocket integration point
    connectWebSocket(url) {
        // TODO: implement when multiplayer is ready
        console.log('WebSocket connection prepared for:', url);
    }

    disconnect() {
        this._listeners = [];
    }
}
