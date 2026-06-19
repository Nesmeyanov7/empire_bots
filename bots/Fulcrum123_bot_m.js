const mineflayer = require('mineflayer');
const readline = require('readline');
const config = require('../config');
const empireEvents = require('../events'); // Подключаем наш "радиоканал"

class Fulcrum123_bot_m {
    constructor() {
        if (!config || !config.controller || !config.owner || !config.owner.username) {
            console.error('❌ Ошибка конфига!');
            process.exit(1);
        }

        this.minerConfig = config.controller;
        this.ownerUsername = config.owner.username.toLowerCase();
        this.password = config.password;
        this.authDone = false;
        this.authAttempts = 0;

        this.isDay = true;
        this.timeOfDay = 0;
        this.timeCheckInterval = null;

        console.log(`🤖 [${this.minerConfig.username}] Создаю контроллер...`);

        this.bot = mineflayer.createBot({
            host: config.server.host,
            port: config.server.port,
            username: this.minerConfig.username,
            version: config.server.version || '1.21.4',
            auth: 'offline',
            hideErrors: false
        });

        this.setupEventHandlers();
        this.setupConsoleInput();
    }

    setupConsoleInput() {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '' });
        console.log(`\n⌨️  УПРАВЛЕНИЕ ИЗ КОНСОЛИ АКТИВНО! (В чате игры писать НЕ НУЖНО)\n`);

        rl.on('line', (input) => {
            const msg = input.trim();
            if (!msg) return;
            this.handleOwnerCommand(this.ownerUsername, msg);
        });
    }

    setupEventHandlers() {
        this.bot.on('windowOpen', (window) => this.handleWindowOpen(window));
        this.bot.on('chat', (username, message) => this.handleChatMessage(username, message));

        this.bot.on('spawn', () => {
            console.log(`✅ [${this.minerConfig.username}] Контроллер заспавнился`);
            if (!this.authDone) {
                setTimeout(() => { if (!this.authDone) this.sendAuthCommand(); }, 30000);
            } else {
                this.startMonitoring();
            }
        });

        this.bot.on('time', (timeData) => this.updateTime(timeData));
        this.bot.on('kicked', (reason) => console.log(`🚫 Кик: ${typeof reason === 'object' ? JSON.stringify(reason) : reason}`));
        this.bot.on('error', (err) => console.log(`❌ Ошибка: ${err.message}`));
        this.bot.on('end', () => {
            console.log(`🔌 Отключился`);
            if (this.timeCheckInterval) clearInterval(this.timeCheckInterval);
        });
    }

    startMonitoring() {
        this.timeCheckInterval = setInterval(() => {
            if (!this.authDone || !this.bot.entity) return;
            if (this.bot.time && Object.keys(this.bot.time).length > 0) this.updateTime(this.bot.time);
        }, 5000);
    }

    updateTime(timeData) {
        if (!timeData || typeof timeData !== 'object') return;
        const time = timeData.timeOfDay !== undefined ? timeData.timeOfDay : (timeData.time || 0);
        const wasDay = this.isDay;
        const normalizedTime = ((time % 24000) + 24000) % 24000;
        this.isDay = (normalizedTime >= 23000 || normalizedTime < 13000);
        this.timeOfDay = normalizedTime;

        if (wasDay !== this.isDay) {
            if (this.isDay) {
                console.log(`☀️ [${this.minerConfig.username}] Наступил ДЕНЬ!`);
                empireEvents.emit('command', { action: 'DAY_STARTED' }); // Шлём в Node.js
            } else {
                console.log(`🌙 [${this.minerConfig.username}] Наступила НОЧЬ!`);
                empireEvents.emit('command', { action: 'NIGHT_STARTED' }); // Шлём в Node.js
            }
        }
    }

    handleOwnerCommand(username, message) {
        if (username.toLowerCase() !== this.ownerUsername) return;
        const msg = message.toLowerCase().trim();
        console.log(`🎮 Команда: ${message}`);

        if (msg.includes('!mine') || msg.includes('!копать')) {
            const parts = message.trim().split(/\s+/);
            const mineIdx = parts.findIndex(p => p.toLowerCase() === '!mine' || p.toLowerCase() === '!копать');
            if (mineIdx === -1 || parts.length < mineIdx + 5) return console.log('❌ Формат: !mine <блок> <x> <y> <z>');

            const blockType = parts[mineIdx + 1];
            const x = parseInt(parts[mineIdx + 2]);
            const y = parseInt(parts[mineIdx + 3]);
            const z = parseInt(parts[mineIdx + 4]);

            if (isNaN(x) || isNaN(y) || isNaN(z)) return console.log('❌ Неверные координаты!');

            if (!this.isDay) {
                console.log('🌙 Сейчас ночь! Задача отложена.');
                empireEvents.emit('command', { action: 'WAIT_UNTIL_DAY', blockType, x, y, z });
                return;
            }

            empireEvents.emit('command', { action: 'MINE_TARGET', blockType, x, y, z });
            return;
        }
        if (msg.includes('!time')) console.log(`⏰ Время: ${this.isDay ? 'ДЕНЬ' : 'НОЧЬ'} (${this.timeOfDay})`);
    }

    handleChatMessage(username, message) {
        if (!this.authDone && username !== this.minerConfig.username) {
            const msg = message.toLowerCase();
            if (msg.includes('/login') || msg.includes('войдите')) setTimeout(() => this.sendAuthCommand(), 500);
        }
    }

    handleWindowOpen(window) {
        let bookCount = 0;
        window.slots.forEach((slot) => { if (slot && (slot.name === 'writable_book' || slot.name === 'written_book')) bookCount++; });
        if (bookCount >= 1 && !this.authDone) {
            setTimeout(() => {
                this.sendAuthCommand();
                if (this.bot.currentWindow) this.bot.closeWindow(this.bot.currentWindow);
            }, 800);
        }
    }

    sendAuthCommand() {
        if (this.authDone) return;
        this.authAttempts++;
        this.bot.chat(`/login ${this.password}`); // Это единственное, что пишется в чат (требует сервер)
        this.authDone = true;
        console.log(`🎉 Контроллер авторизован!`);
        setTimeout(() => this.startMonitoring(), 2000);
    }
}

module.exports = Fulcrum123_bot_m;