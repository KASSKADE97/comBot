var TelegramBot = require('node-telegram-bot-api');
const mysql = require('mysql2/promise');

let connection;
async function initDatabase() {
    console.log('rogalique_bluat')
    connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: 'Password123',
        database: 'clarissebotdb'
    });

}

async function createTable1() {
    console.log('rogalique_cyka')
    const res = await connection.query(`
        CREATE TABLE IF NOT EXISTS distributors2(
        id INT AUTO_INCREMENT,
        Name VARCHAR(50),
        Adress VARCHAR(50),
        Curr_count INT, 
        Code INT,T_number INT, 
        E_mail VARCHAR(50),
        PRIMARY KEY(id))
        ENGINE = INNODB;
    `);

    console.log(res)
}

async function init(){
    await initDatabase();
    await createTable1();
}

async function query(sql, ...args) {
    return connection.query(sql, args);
}


var token = '781591989:AAEhXXunW44d5pHwnLJbJyP-ybE3jRetMqE';
var bot = new TelegramBot(token, {polling: true});
 
init();