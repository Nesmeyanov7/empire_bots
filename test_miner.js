const mineflayer = require('mineflayer');

console.log('🚀 ТЕСТ С ЛОГОМ ОКНА');

const bot = mineflayer.createBot({
    host: '185.9.145.82',
    port: 32706,
    username: 'Fulcrum123_bot_m',
    version: '1.21.8'
});

let authDone = false;

bot.on('connect', () => {
    console.log('🟡 Подключение...');
});

bot.on('login', () => {
    console.log('🟢 Логин выполнен');
});

bot.on('windowOpen', (window) => {
    if (authDone) return;

    console.log('========================================');
    console.log('📂 ОТКРЫТО ОКНО');
    console.log('📌 Название (raw):', window.title);
    console.log('📌 Название (string):', JSON.stringify(window.title));
    console.log('📌 Тип окна:', window.type);
    console.log('📌 ID окна:', window.id);
    console.log('📌 Количество слотов:', window.slots ? window.slots.length : 0);
    console.log('========================================');

    if (window.slots) {
        console.log('📊 СОДЕРЖИМОЕ СЛОТОВ:');
        window.slots.forEach((slot, index) => {
            if (slot) {
                console.log(`  Слот ${index}:`);
                console.log(`    - Название: ${slot.name}`);
                console.log(`    - ID: ${slot.type}`);
                console.log(`    - Количество: ${slot.count}`);
                console.log(`    - NBT: ${slot.nbt ? 'есть' : 'нет'}`);
            }
        });
    }
    console.log('========================================');

    // Подсчет книг (полей ввода)
    let bookCount = 0;
    if (window.slots) {
        window.slots.forEach((slot) => {
            if (slot && slot.name === 'writable_book') bookCount++;
        });
    }
    console.log(`📊 Найдено полей ввода (writable_book): ${bookCount}`);
    console.log('========================================');

    // Пробуем оба варианта
    if (bookCount === 2) {
        console.log('🔑 Два поля ввода -> /register');
        bot.chat('/register DedStorm DedStorm');
        authDone = true;
    } else if (bookCount === 1) {
        console.log('🔑 Одно поле ввода -> /login');
        bot.chat('/login DedStorm');
        authDone = true;
    } else {
        // Пробуем по названию
        const titleStr = JSON.stringify(window.title);
        if (titleStr.includes('Register') || titleStr.includes('register')) {
            console.log('🔑 По названию -> /register');
            bot.chat(`/register DedStorm DedStorm`);
            authDone = true;
        } else if (titleStr.includes('Login') || titleStr.includes('login')) {
            console.log('🔑 По названию -> /login');
            bot.chat(`/login DedStorm`);
            authDone = true;
        }
    }
});

bot.on('spawn', () => {
    console.log('✅ Бот успешно зашел на сервер!');
});

bot.on('kicked', (reason) => {
    console.log('👢 Кикнут:', JSON.stringify(reason));
});

bot.on('error', (err) => {
    console.log('❌ Ошибка:', err.message);
});

bot.on('end', (reason) => {
    console.log('🔴 Отключен:', reason);
});