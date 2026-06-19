const config = require('./config');
const Fulcrum123_bot_m = require('./bots/Fulcrum123_bot_m');
const Fulcrum123_bot1 = require('./bots/Fulcrum123_bot1');

console.log('🚀 Запуск системы ботов Empire...\n');

console.log('🎯 Запускаю контроллер...');
const controller = new Fulcrum123_bot_m();

// Задержка 15 секунд между подключениями (чтобы не кикнуло за спам коннектами)
const MINER_SPAWN_DELAY = 15000;

// Глобальный массив для хранения всех майнеров (нужен для корректного выхода)
global.miners = [];

config.miners.forEach((minerConfig, index) => {
    setTimeout(() => {
        console.log(`\n⛏️  Запускаю майнера #${index + 1}: ${minerConfig.username}`);

        // 🚨 ВАЖНО: Передаём конфиг конкретного майнера в конструктор!
        const miner = new Fulcrum123_bot1(minerConfig);
        global.miners.push(miner);

    }, (index + 1) * MINER_SPAWN_DELAY);
});

// Корректное завершение работы при нажатии Ctrl+C
process.on('SIGINT', () => {
    console.log('\n\n🛑 Останавливаю ботов...');

    // Отключаем всех майнеров
    if (global.miners) {
        global.miners.forEach(m => {
            if (m.bot) m.bot.end('Server closed');
        });
    }

    // Отключаем контроллер
    if (controller && controller.bot) {
        controller.bot.end('Server closed');
    }

    setTimeout(() => process.exit(0), 1000);
});

console.log(`\n✅ Система запущена!`);
console.log(`📊 Запланировано майнеров: ${config.miners.length}`);
console.log(`⏱️  Первый майнер появится через ${MINER_SPAWN_DELAY / 1000} сек...`);