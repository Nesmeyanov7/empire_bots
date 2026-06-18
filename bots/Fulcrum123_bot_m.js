const mineflayer = require('mineflayer');

class ControllerBot {
    constructor(config, onDayNightSwitch) {
        this.config = config;
        this.onDayNightSwitch = onDayNightSwitch;
        this.bot = null;
        this.lastTime = -1;
        this.isRunning = false;
        this.isConnecting = false;
        this.password = config.password;
        this.authDone = false;
    }

    start() {
        if (this.isRunning) {
            console.log('⚠️ ControllerBot уже запущен!');
            return;
        }
        console.log('🎮 Запуск ControllerBot...');
        this.isRunning = true;
        this.createBot();
    }

    createBot() {
        this.authDone = false;

        console.log('🔍 СОЗДАЮ БОТА С ЖЕСТКИМИ ПАРАМЕТРАМИ:');
        console.log('  host: 185.9.145.82');
        console.log('  port: 32706');
        console.log('  username: Fulcrum123_bot_maestro');
        console.log('  version: 1.21.8');

        this.bot = mineflayer.createBot({
            host: '185.9.145.82',
            port: 32706,
            username: 'Fulcrum123_bot_maestro',
            version: '1.21.8'
        });

        this.setupHandlers();
    }


    setupHandlers() {
        this.bot.on('connect', () => {
            console.log('🟡 Controller: подключение к серверу...');
        });

        this.bot.on('login', () => {
            console.log('🟢 Controller: логин выполнен');
        });

        this.bot.on('windowOpen', (window) => {
            if (this.authDone) return;

            console.log(`📂 Controller: открыто окно`);

            let bookCount = 0;
            if (window.slots) {
                window.slots.forEach((slot) => {
                    if (slot && slot.name === 'writable_book') bookCount++;
                });
            }

            if (bookCount === 2) {
                console.log('🔑 Controller: /register');
                this.bot.chat(`/register ${this.password} ${this.password}`);
                this.authDone = true;
            } else if (bookCount === 1) {
                console.log('🔑 Controller: /login');
                this.bot.chat(`/login ${this.password}`);
                this.authDone = true;
            }
        });

        this.bot.on('spawn', () => {
            console.log('✅ ControllerBot зашел на сервер!');
            this.authDone = true;
            this.isConnecting = false;
        });

        this.bot.on('time', () => {
            this.handleTime();
        });

        this.bot.on('kicked', (reason) => {
            console.log('👢 ControllerBot кикнут:', JSON.stringify(reason));
            this.isConnecting = false;
            if (this.isRunning) {
                setTimeout(() => this.createBot(), 15000);
            }
        });

        this.bot.on('error', (err) => {
            console.log('❌ Ошибка ControllerBot:', err.message);
            this.isConnecting = false;
        });

        this.bot.on('end', () => {
            this.isConnecting = false;
            if (this.isRunning) {
                console.log('🔄 ControllerBot переподключается...');
                setTimeout(() => this.createBot(), 15000);
            }
        });
    }

    handleTime() {
        if (!this.bot.time) return;

        const time = this.bot.time.time % 24000;
        const isDay = time < 13000;

        if (this.lastTime === -1 || Math.abs(time - this.lastTime) > 100) {
            this.lastTime = time;
            this.onDayNightSwitch(isDay);
        }
    }

    stop() {
        this.isRunning = false;
        if (this.bot) {
            this.bot.end('Manager stopped');
        }
    }
}

module.exports = ControllerBot;