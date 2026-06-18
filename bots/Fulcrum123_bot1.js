const mineflayer = require('mineflayer');
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const Movements = require('mineflayer-pathfinder').Movements;
const { GoalNear } = require('mineflayer-pathfinder').goals;

class MinerBot {
    constructor(config, minerConfig) {
        this.config = config;
        this.minerConfig = minerConfig;
        this.bot = null;
        this.isDay = false;
        this.isMining = false;
        this.isRunning = false;
        this.isSafe = true;
        this.currentTask = null;
        this.mcData = null;
        this.authDone = false;
        this.password = config.password;
    }

    start() {
        console.log(`🎮 Запуск ${this.minerConfig.username}...`);
        this.isRunning = true;
        this.createBot();
    }

    createBot() {
        this.authDone = false;
        this.bot = mineflayer.createBot({
            host: this.config.server.host,
            port: this.config.server.port,
            username: this.minerConfig.username,
            version: this.config.server.version
        });

        this.bot.loadPlugin(pathfinder);
        this.setupHandlers();
    }

    setupHandlers() {
        this.bot.on('windowOpen', (window) => {
            if (this.authDone) return;

            console.log(`📂 ${this.minerConfig.username}: открыто окно`);

            let bookCount = 0;
            if (window.slots) {
                window.slots.forEach((slot) => {
                    if (slot && slot.name === 'writable_book') bookCount++;
                });
            }

            if (bookCount === 2) {
                console.log(`🔑 ${this.minerConfig.username}: /register`);
                this.bot.chat(`/register ${this.password} ${this.password}`);
                this.authDone = true;
            } else if (bookCount === 1) {
                console.log(`🔑 ${this.minerConfig.username}: /login`);
                this.bot.chat(`/login ${this.password}`);
                this.authDone = true;
            }
        });

        this.bot.on('spawn', () => {
            console.log(`✅ ${this.minerConfig.username} зашел на сервер!`);
            this.authDone = true;
            this.isSafe = true;
            this.mcData = require('minecraft-data')(this.bot.version);
            this.setupMovement();
        });

        this.bot.on('entitySpawn', (entity) => {
            this.checkForDanger(entity);
        });

        this.bot.on('kicked', (reason) => {
            console.log(`👢 ${this.minerConfig.username} кикнут:`, JSON.stringify(reason));
            this.reconnect();
        });

        this.bot.on('error', (err) => {
            console.log(`❌ Ошибка ${this.minerConfig.username}:`, err.message);
        });

        this.bot.on('end', () => {
            if (this.isRunning) {
                this.reconnect();
            }
        });
    }

    setupMovement() {
        const defaultMove = new Movements(this.bot, this.mcData);
        this.bot.pathfinder.setMovements(defaultMove);
    }

    checkForDanger(entity) {
        if (!this.isDay || !this.isSafe || !this.isMining) return;

        const mobs = ['zombie', 'skeleton', 'creeper', 'spider', 'enderman', 'witch', 'slime'];
        if (mobs.some(mob => entity.name && entity.name.includes(mob))) {
            const distance = this.bot.entity.position.distanceTo(entity.position);
            if (distance < this.config.dangerDistance) {
                console.log(`⚠️ ${this.minerConfig.username}: Опасность! ${entity.name} на ${Math.round(distance)} блоков`);
                this.isSafe = false;
                this.isMining = false;
                this.bot.end('Danger! Disconnecting');
            }
        }
    }

    startMining(block, coords) {
        if (!this.isRunning || !this.bot) {
            console.log(`❌ ${this.minerConfig.username}: Бот не готов`);
            return;
        }

        if (!this.isDay) {
            console.log(`🌙 ${this.minerConfig.username}: Сейчас ночь, жду дня...`);
            this.currentTask = { block, coords };
            return;
        }

        if (this.isMining) {
            console.log(`⛏️ ${this.minerConfig.username}: Уже работает над заданием`);
            return;
        }

        this.currentTask = { block, coords };
        this.isMining = true;
        this.isSafe = true;

        console.log(`⛏️ ${this.minerConfig.username}: Задание: добыть ${block} на (${coords.x}, ${coords.y}, ${coords.z})`);
        this.goToTarget();
    }

    stopMining() {
        this.isMining = false;
        this.currentTask = null;
        if (this.bot) {
            this.bot.pathfinder.setGoal(null);
        }
        console.log(`⏹️ ${this.minerConfig.username}: Добыча остановлена`);
    }

    setDayTime(isDay) {
        this.isDay = isDay;

        if (isDay && this.currentTask && !this.isMining) {
            console.log(`☀️ ${this.minerConfig.username}: День, продолжаю задание...`);
            this.isMining = true;
            this.isSafe = true;
            this.goToTarget();
        }
    }

    goToTarget() {
        if (!this.currentTask || !this.isMining) return;

        const { coords } = this.currentTask;
        this.bot.pathfinder.setGoal(new GoalNear(coords.x, coords.y, coords.z, 2));

        this.bot.once('goal_reached', () => {
            console.log(`📍 ${this.minerConfig.username}: Достиг цели`);
            this.mineBlock();
        });
    }

    mineBlock() {
        if (!this.isDay || !this.isRunning || !this.isSafe || !this.isMining) {
            this.isMining = false;
            return;
        }

        const blockName = this.currentTask.block;

        const block = this.bot.findBlock({
            matching: (block) => block.name === blockName,
            maxDistance: 10
        });

        if (block) {
            console.log(`⛏️ ${this.minerConfig.username}: Копаю ${block.name}`);
            this.bot.dig(block, (err) => {
                if (err) {
                    console.log(`❌ ${this.minerConfig.username}: Ошибка копания:`, err.message);
                }
                setTimeout(() => this.mineBlock(), 300);
            });
        } else {
            setTimeout(() => this.mineBlock(), 3000);
        }
    }

    reconnect() {
        if (!this.isRunning) return;
        setTimeout(() => {
            console.log(`🔄 ${this.minerConfig.username}: Переподключение...`);
            this.createBot();
        }, 15000);
    }

    stop() {
        this.isRunning = false;
        if (this.bot) {
            this.bot.end('Manager stopped');
        }
    }
}

module.exports = MinerBot;