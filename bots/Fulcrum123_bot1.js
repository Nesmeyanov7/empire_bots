const mineflayer = require('mineflayer');
const { pathfinder, goals, Movements } = require('mineflayer-pathfinder');
const collectBlock = require('mineflayer-collectblock');
const { Vec3 } = require('vec3');
const config = require('../config');
const empireEvents = require('../events');

class Fulcrum123_bot1 {
    constructor(minerConfig) {
        this.minerConfig = minerConfig || (config.miners && config.miners[0]);
        if (!this.minerConfig) {
            console.error('❌ Не удалось получить конфиг майнера!');
            process.exit(1);
        }

        this.password = config.password;
        this.authDone = false;
        this.authAttempts = 0;
        this.isWorking = false;
        this.targetCoords = null;
        this.targetBlock = null;
        this.isFleeing = false;
        this.pendingTarget = null;
        this.reconnectTimer = null;

        // Анти-зависалка
        this.stuckCheckInterval = null;
        this.stuckCounter = 0;
        this.lastPosition = null;

        console.log(`🤖 [${this.minerConfig.username}] Создаю майнера...`);

        this.bot = mineflayer.createBot({
            host: config.server.host,
            port: config.server.port,
            username: this.minerConfig.username,
            version: config.server.version || '1.21.4',
            auth: 'offline',
            hideErrors: false
        });

        this.bot.loadPlugin(pathfinder);
        this.bot.loadPlugin(collectBlock.plugin);

        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.bot.on('windowOpen', (window) => this.handleWindowOpen(window));
        this.bot.on('chat', (username, message) => this.handleChatMessage(username, message));

        // Слушаем команды от контроллера через Node.js (без спама в чат!)
        empireEvents.on('command', (data) => this.handleEmpireCommand(data));

        this.bot.on('spawn', () => {
            console.log(`✅ [${this.minerConfig.username}] Майнер заспавнился`);

            const mcData = require('minecraft-data')(this.bot.version);
            const defaultMove = new Movements(this.bot, mcData);

            // 🚨 АГРЕССИВНЫЕ НАСТРОЙКИ ДЛЯ ПОДЪЁМОВ И СТЕН
            defaultMove.canDig = true;           // Разрешаем ломать блоки
            defaultMove.digCost = 1;             // ОЧЕНЬ ВАЖНО! Охотно ломает препятствия
            defaultMove.placeCost = 2;
            defaultMove.maxDropDown = 256;
            defaultMove.allowFreeMotion = true;
            defaultMove.allowParkour = true;     // Разрешаем паркур (прыжки через пропасти)
            defaultMove.allowSprinting = true;   // Разрешаем бег (запрыгивает на 1 блок)

            // Блоки которые нельзя ломать
            if (mcData.blocksByName.bedrock) defaultMove.blocksCantBreak.add(mcData.blocksByName.bedrock.id);
            if (mcData.blocksByName.barrier) defaultMove.blocksCantBreak.add(mcData.blocksByName.barrier.id);

            // Опасные блоки
            if (mcData.blocksByName.lava) defaultMove.blocksToAvoid.add(mcData.blocksByName.lava.id);
            if (mcData.blocksByName.cactus) defaultMove.blocksToAvoid.add(mcData.blocksByName.cactus.id);
            if (mcData.blocksByName.fire) defaultMove.blocksToAvoid.add(mcData.blocksByName.fire.id);
            if (mcData.blocksByName.magma_block) defaultMove.blocksToAvoid.add(mcData.blocksByName.magma_block.id);

            this.bot.pathfinder.setMovements(defaultMove);

            // Запуск анти-зависалки
            this.lastPosition = this.bot.entity.position.clone();
            this.stuckCounter = 0;
            if (this.stuckCheckInterval) clearInterval(this.stuckCheckInterval);
            this.stuckCheckInterval = setInterval(() => this.checkStuck(), 2000);

            if (!this.authDone) {
                setTimeout(() => { if (!this.authDone) this.sendAuthCommand(); }, 30000);
            }
        });

        this.bot.on('entitySpawn', (entity) => {
            if (this.isWorking && !this.isFleeing) this.checkHostileMob(entity);
        });

        this.bot.on('entityMoved', (entity) => {
            if (this.isWorking && !this.isFleeing) this.checkHostileMob(entity);
        });

        this.bot.on('kicked', (reason) => {
            let reasonStr = typeof reason === 'object' ? JSON.stringify(reason) : reason;
            console.log(`\n🚫 [${this.minerConfig.username}] Кикнули! Причина: ${reasonStr}\n`);
        });

        this.bot.on('error', (err) => console.log(`❌ [${this.minerConfig.username}] Ошибка: ${err.message}`));

        this.bot.on('end', () => {
            console.log(`🔌 [${this.minerConfig.username}] Отключился`);
            if (this.stuckCheckInterval) clearInterval(this.stuckCheckInterval);
            this.scheduleReconnect();
        });
    }

    // Обработка внутренних команд от контроллера
    handleEmpireCommand(data) {
        console.log(`📥 [${this.minerConfig.username}] Получена команда: ${data.action}`);
        switch (data.action) {
            case 'MINE_TARGET':
                this.setTarget({ x: data.x, y: data.y, z: data.z }, data.blockType);
                break;
            case 'WAIT_UNTIL_DAY':
                this.pendingTarget = { x: data.x, y: data.y, z: data.z, blockType: data.blockType };
                break;
            case 'NIGHT_STARTED':
                this.isWorking = false;
                if (this.bot.pathfinder) this.bot.pathfinder.stop();
                break;
            case 'DAY_STARTED':
                if (this.pendingTarget) {
                    this.setTarget(this.pendingTarget, this.pendingTarget.blockType);
                    this.pendingTarget = null;
                } else if (this.targetCoords && this.authDone) {
                    this.navigateToTarget();
                }
                break;
        }
    }

    // Проверка застревания
    checkStuck() {
        if (!this.isWorking || !this.targetCoords || this.isFleeing || !this.bot.entity) return;

        const distance = this.lastPosition.distanceTo(this.bot.entity.position);
        if (distance < 0.5) {
            this.stuckCounter++;
            if (this.stuckCounter >= 3) {
                console.log(`⚠️ [${this.minerConfig.username}] Застрял! Пробиваю стену...`);
                this.unstick();
                this.stuckCounter = 0;
            }
        } else {
            this.stuckCounter = 0;
        }
        this.lastPosition = this.bot.entity.position.clone();
    }

    // 🚨 Пробивание стены перед собой
    async unstick() {
        this.bot.pathfinder.stop();

        // Определяем направление взгляда бота
        const pos = this.bot.entity.position;
        const yaw = this.bot.entity.yaw;
        const dir = new Vec3(-Math.sin(yaw), 0, -Math.cos(yaw)).normalize();

        // Находим блоки прямо перед ботом (на уровне ног и головы)
        const blockFeet = this.bot.blockAt(pos.offset(dir.x, 0, dir.z).floored());
        const blockHead = this.bot.blockAt(pos.offset(dir.x, 1, dir.z).floored());

        try {
            // Ломаем блок на уровне головы
            if (blockHead && blockHead.name !== 'air' && !blockHead.name.includes('water')) {
                await this.bot.dig(blockHead);
            }
            // Ломаем блок на уровне ног
            if (blockFeet && blockFeet.name !== 'air' && !blockFeet.name.includes('water')) {
                await this.bot.dig(blockFeet);
            }
        } catch (e) {
            // Если не получилось сломать - игнорируем
        }

        // Прыгаем и идём вперёд
        this.bot.setControlState('jump', true);
        this.bot.setControlState('forward', true);

        setTimeout(() => {
            this.bot.setControlState('jump', false);
            this.bot.setControlState('forward', false);
            console.log(`✅ [${this.minerConfig.username}] Выбрался! Продолжаю путь.`);
            if (this.targetCoords && this.authDone) this.navigateToTarget();
        }, 1000);
    }

    checkHostileMob(entity) {
        const hostileMobs = ['zombie', 'skeleton', 'creeper', 'spider', 'enderman', 'witch', 'blaze'];
        if (hostileMobs.includes(entity.name)) {
            const distance = this.bot.entity.position.distanceTo(entity.position);
            if (distance < (config.dangerDistance || 10)) {
                console.log(`⚠️ [${this.minerConfig.username}] Моб ${entity.name} близко! Ливаем.`);
                this.fleeFromServer();
            }
        }
    }

    fleeFromServer() {
        this.isFleeing = true;
        this.isWorking = false;
        if (this.bot.pathfinder) this.bot.pathfinder.stop();
        this.bot.end();
    }

    scheduleReconnect() {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        const reconnectDelay = config.reconnectDelay || 60000;
        console.log(`⏰ [${this.minerConfig.username}] Перезаход через ${reconnectDelay / 1000} сек...`);

        this.reconnectTimer = setTimeout(() => {
            console.log(`🔄 [${this.minerConfig.username}] Перезахожу...`);
            this.isFleeing = false;
            this.authDone = false;
            this.isWorking = false;
            this.authAttempts = 0;

            this.bot = mineflayer.createBot({
                host: config.server.host,
                port: config.server.port,
                username: this.minerConfig.username,
                version: config.server.version || '1.21.4',
                auth: 'offline',
                hideErrors: false
            });

            this.bot.loadPlugin(pathfinder);
            this.bot.loadPlugin(collectBlock.plugin);
            this.setupEventHandlers();
        }, reconnectDelay);
    }

    setTarget(coords, blockType) {
        this.targetCoords = coords;
        this.targetBlock = blockType;
        console.log(`🎯 [${this.minerConfig.username}] Новая цель: ${blockType} на ${JSON.stringify(coords)}`);

        if (this.bot.pathfinder) this.bot.pathfinder.stop();

        // Сбрасываем анти-зависалку для нового пути
        this.stuckCounter = 0;
        if (this.bot.entity) this.lastPosition = this.bot.entity.position.clone();

        if (this.authDone) {
            this.navigateToTarget();
        }
    }

    async navigateToTarget() {
        if (!this.targetCoords) return;
        console.log(`🚶 [${this.minerConfig.username}] Иду к ${JSON.stringify(this.targetCoords)}...`);
        this.isWorking = true;

        try {
            const goal = new goals.GoalBlock(
                Math.floor(this.targetCoords.x),
                Math.floor(this.targetCoords.y),
                Math.floor(this.targetCoords.z)
            );

            // Таймаут на pathfinder (120 секунд)
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Pathfinder timeout (120s)')), 120000)
            );

            await Promise.race([
                this.bot.pathfinder.goto(goal),
                timeoutPromise
            ]);

            console.log(`✅ [${this.minerConfig.username}] Достиг цели!`);
            await this.searchAndMine();
        } catch (err) {
            console.log(`❌ [${this.minerConfig.username}] Ошибка пути: ${err.message}`);
            await this.searchAndMine();
        }
    }

    async searchAndMine() {
        if (!this.targetBlock) return;
        console.log(`🔍 [${this.minerConfig.username}] Ищу ${this.targetBlock}...`);

        const mcData = require('minecraft-data')(this.bot.version);
        const blockType = mcData.blocksByName[this.targetBlock];

        if (!blockType) {
            console.log(`❌ [${this.minerConfig.username}] Неизвестный блок: ${this.targetBlock}`);
            this.isWorking = false;
            return;
        }

        const blocks = this.bot.findBlocks({
            matching: blockType.id,
            maxDistance: 64,
            count: 10
        });

        if (blocks.length === 0) {
            console.log(`❌ [${this.minerConfig.username}] Не найдено ${this.targetBlock} в радиусе 64!`);
            this.isWorking = false;
            this.targetCoords = null;
            return;
        }

        console.log(`💎 [${this.minerConfig.username}] Найдено ${blocks.length} блоков! Начинаю копать.`);
        await this.mineBlocks(blocks);
    }

    async mineBlocks(blocks) {
        for (const blockPos of blocks) {
            if (!this.isWorking || this.isFleeing) break;

            const block = this.bot.blockAt(blockPos);
            if (!block || block.name !== this.targetBlock) continue;

            console.log(`⛏️ [${this.minerConfig.username}] Копаю на ${JSON.stringify(blockPos)}...`);

            try {
                // collectBlock сам подойдёт и сломает
                await this.bot.collectBlock.collect(block, { ignoreNoPath: true });
                console.log(`✅ [${this.minerConfig.username}] Блок добыт!`);
            } catch (err) {
                console.log(`⚠️ collectBlock упал: ${err.message}, пробуем dig...`);
                try {
                    // Fallback: идём вплотную и копаем руками/инструментом
                    const goal = new goals.GoalBlock(blockPos.x, blockPos.y, blockPos.z);
                    await this.bot.pathfinder.goto(goal);
                    await this.bot.dig(block);
                    console.log(`✅ [${this.minerConfig.username}] Блок добыт (dig)!`);
                } catch (digErr) {
                    console.log(`❌ Не удалось добыть: ${digErr.message}`);
                }
            }
        }
        console.log(`🎉 [${this.minerConfig.username}] Задача выполнена!`);
        this.isWorking = false;
        this.targetCoords = null;
        this.targetBlock = null;
    }

    handleWindowOpen(window) {
        let bookCount = 0;
        window.slots.forEach((slot) => {
            if (slot && (slot.name === 'writable_book' || slot.name === 'written_book')) bookCount++;
        });
        if (bookCount >= 1 && !this.authDone) {
            setTimeout(() => {
                this.sendAuthCommand();
                if (this.bot.currentWindow) this.bot.closeWindow(this.bot.currentWindow);
            }, 800);
        }
    }

    handleChatMessage(username, message) {
        if (username === this.minerConfig.username || this.authDone) return;
        const msg = message.toLowerCase();
        if (msg.includes('/login') || msg.includes('войдите') || msg.includes('авторизуйтесь')) {
            setTimeout(() => this.sendAuthCommand(), 500);
        }
    }

    sendAuthCommand() {
        if (this.authDone) return;
        this.authAttempts++;
        this.bot.chat(`/login ${this.password}`);
        this.authDone = true;
        console.log(`🎉 [${this.minerConfig.username}] Майнер авторизован!`);
    }
}

module.exports = Fulcrum123_bot1;