const readline = require('readline');
const config = require('./config');
const ControllerBot = require('./bots/Fulcrum123_bot_m.js');
const MinerBot = require('./bots/Fulcrum123_bot1.js');

class BotManager {
    constructor() {
        this.controller = null;
        this.miners = {};
        this.isDay = true;
        this.isRunning = true;

        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        this.setupConsoleCommands();
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async start() {
        console.log('🚀 Запуск менеджера ботов...');
        console.log('📝 Доступные команды:');
        console.log('  mine <бот> <блок> <x> <y> <z>  - начать добычу');
        console.log('  stop <бот>                    - остановить бота');
        console.log('  list                          - список ботов');
        console.log('  day                           - принудительно включить день');
        console.log('  night                         - принудительно включить ночь');
        console.log('  spawn <имя>                   - запустить нового шахтера');
        console.log('  exit                          - выход');
        console.log('');

        // 1. Запускаем контроллера
        this.controller = new ControllerBot(config, (isDay) => {
            this.handleDayNightSwitch(isDay);
        });
        this.controller.start();

        // 2. Ждем 20 секунд перед запуском шахтеров
        console.log('⏳ Ждем 20 секунд перед запуском шахтеров...');
        await this.sleep(20000);

        // 3. Запускаем шахтеров с задержкой между ними
        if (config.miners && config.miners.length > 0) {
            console.log(`🎮 Запуск ${config.miners.length} шахтеров...`);
            let delay = 0;
            for (const minerConfig of config.miners) {
                setTimeout(() => {
                    const miner = new MinerBot(config, minerConfig);
                    miner.start();
                    this.miners[minerConfig.username] = miner;
                    console.log(`✅ ${minerConfig.username} запущен`);
                }, delay);
                delay += 15000;
            }
        } else {
            console.log('💤 Нет шахтеров в конфиге.');
        }
    }

    setupConsoleCommands() {
        this.rl.on('line', (input) => {
            const args = input.trim().split(' ');
            const command = args[0].toLowerCase();

            switch (command) {
                case 'mine':
                    this.handleMineCommand(args.slice(1));
                    break;
                case 'stop':
                    this.handleStopCommand(args.slice(1));
                    break;
                case 'list':
                    this.handleListCommand();
                    break;
                case 'day':
                    this.handleDayNightSwitch(true);
                    break;
                case 'night':
                    this.handleDayNightSwitch(false);
                    break;
                case 'spawn':
                    this.handleSpawnCommand(args.slice(1));
                    break;
                case 'exit':
                    this.stop();
                    break;
                default:
                    console.log('❌ Неизвестная команда.');
            }
        });
    }

    handleSpawnCommand(args) {
        if (args.length < 1) {
            console.log('❌ Использование: spawn <имя_бота>');
            return;
        }

        const username = args[0];

        if (this.miners[username]) {
            console.log(`❌ Бот ${username} уже существует`);
            return;
        }

        let minerConfig = config.miners.find(m => m.username === username);
        if (!minerConfig) {
            minerConfig = { username: username };
        }

        console.log(`🎮 Запуск нового шахтера ${username}...`);
        const miner = new MinerBot(config, minerConfig);
        miner.start();
        this.miners[username] = miner;
        console.log(`✅ Бот ${username} запущен`);
    }

    handleMineCommand(args) {
        if (args.length < 5) {
            console.log('❌ Использование: mine <бот> <блок> <x> <y> <z>');
            return;
        }

        const username = args[0];
        const block = args[1];
        const x = parseInt(args[2]);
        const y = parseInt(args[3]);
        const z = parseInt(args[4]);

        const miner = this.miners[username];
        if (!miner) {
            console.log(`❌ Бот ${username} не найден`);
            return;
        }

        if (!miner.isDay) {
            console.log(`🌙 Сейчас ночь, ${username} не может работать.`);
            return;
        }

        console.log(`📤 Задание ${username}: добыть ${block} на (${x}, ${y}, ${z})`);
        miner.startMining(block, { x, y, z });
    }

    handleStopCommand(args) {
        if (args.length < 1) {
            console.log('❌ Использование: stop <бот>');
            return;
        }

        const username = args[0];
        const miner = this.miners[username];
        if (!miner) {
            console.log(`❌ Бот ${username} не найден`);
            return;
        }

        miner.stopMining();
        console.log(`⏹️ ${username} остановлен`);
    }

    handleListCommand() {
        console.log('📋 Список ботов:');
        console.log(`  🎮 Контролер: ${config.controller.username} (${this.isDay ? '☀️ день' : '🌙 ночь'})`);

        const minerNames = Object.keys(this.miners);
        if (minerNames.length === 0) {
            console.log('  💤 Нет активных шахтеров');
        } else {
            minerNames.forEach(name => {
                const miner = this.miners[name];
                const status = miner.isMining ? '⛏️ работает' : '💤 ожидает';
                console.log(`  🤖 ${name}: ${status}`);
            });
        }
    }

    handleDayNightSwitch(isDay) {
        this.isDay = isDay;
        console.log(`📢 Смена времени: ${isDay ? '☀️ ДЕНЬ' : '🌙 НОЧЬ'}`);

        Object.values(this.miners).forEach(miner => {
            miner.setDayTime(isDay);
        });
    }

    stop() {
        this.isRunning = false;
        if (this.controller) {
            this.controller.stop();
        }
        Object.values(this.miners).forEach(miner => miner.stop());
        this.rl.close();
        console.log('🛑 Менеджер остановлен');
        process.exit(0);
    }
}

// ===== ЗАПУСК =====
const manager = new BotManager();
manager.start();