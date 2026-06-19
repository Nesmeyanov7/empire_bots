// events.js
const EventEmitter = require('events');
class EmpireEvents extends EventEmitter {}
module.exports = new EmpireEvents();