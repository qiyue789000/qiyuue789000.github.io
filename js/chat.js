// Chat Service - localStorage-based chat with WebSocket preparation
import { storage, KEYS } from './storage.js';

const MAX_MESSAGES = 200;

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
        }
        if (content) this._addMessage(content, 'system');
    }

    sendChat(text) {
        if (!text || !text.trim()) return;
        this._addMessage(text.trim(), 'chat');
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
