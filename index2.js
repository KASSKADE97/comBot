var TelegramBot = require('node-telegram-bot-api');
const mysql = require('mysql2/promise');
const moment = require('moment')
const ejs = require('ejs');
const diff = require('deep-object-diff').detailedDiff;
var token = '781591989:AAEhXXunW44d5pHwnLJbJyP-ybE3jRetMqE';
var bot = new TelegramBot(token, { polling: true });

const Html2Pdf = require('./HtmlToPdf');



/** @type {Map<number, string>} */
const chatStatuses = new Map();
const chatNaklads = new Map();
const chatItems = new Map();
const userStatus = {
    NEW: 'new',
    CREATING_NAKLAD: {
        NEW: 'creatingNaklad_new',
        GOT_BILL: 'nakladHasBill',
        GOT_NAMES: 'nakladHasNames',
        GOT_AMOUNTS: 'nakladHasAmount',
        GOT_PRICES: 'nakladHasPrices', 
        GOT_SUMM: 'nakladHasSumm',
        GOT_WAREHOUSE: 'nakladHasWarehouse'
    },
    PRINT: {
        BILL: 'printBill',
        REESTR: 'printReestr',
        NAKLAD: 'printNaklad',
        ORDER: 'printOrder'
    }
}
let connection;
async function initDatabase() {
    connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: 'Password123',
        database: 'clarissebotdb',
        dateStrings: true
    });
}

async function registration(id, name, pass, role) {
    const quer = await connection.query(`
        INSERT INTO users (login,password_,role) VALUES('${name}','${pass}','${role}');
     `);
    console.log(id, name, pass, role);
    console.dir(quer);
}

async function billHistory() {
    const quer = await connection.query(`
        SELECT bill.id, bill.bill_date, distributors.name, bill.summ, bill.payment FROM bill 
        LEFT JOIN distributors ON bill.id = distributors.id;
    `);
    const res = quer[0];
    //console.dir(res,  { compact: false, showHidden:false, colors: true, maxArrayLength: 5, depth: 3 });
    return res;
} //список счет-фактур
//смаржить все результаты в 1 массив
async function getBill(Id){
   
    const quer = await connection.query(`
        SELECT catalog_prod.name, catalog_prod.measure, tovari_bills.amount, tovari_bills.price, 
            (tovari_bills.price - (tovari_bills.price * 20)/100) priceNoPDV,  
            (bill.id) billId, (bill.bill_date) billDate,
            (distributors.name) distName, (distributors.address) distAdress, 
            (distributors.ident_code) distCode, (distributors.t_number) distTel, (distributors.e_mail) distEmail 
        FROM bill 
            LEFT JOIN distributors ON bill.distributor = distributors.id
            LEFT JOIN tovari_bills ON bill.id = tovari_bills.id_bill 
            LEFT JOIN catalog_prod ON tovari_bills.id_tovar = catalog_prod.id
        WHERE bill.id = ${Id}
    `);
    const quer1 = await connection.query(`
        SELECT (SUM(bill.summ)) summPDV,(SUM(bill.summ - (bill.summ*20)/100)) summNoPDV
        FROM bill
            LEFT JOIN tovari_bills ON bill.id = tovari_bills.id_bill
        WHERE bill.id = ${Id}
    `)
    const bills = quer[0];
    const summs = quer1[0];
    const billDate = moment(bills.billDate).format('YYYY-MM-DD');
    const foundBill = bills[0];
    const foundSumm = summs[0];
    const bill = {
            billId: Id,
            billDate: billDate,
            distName: foundBill.distName,
            distAdress: foundBill.distAdress,
            distCode: foundBill.distCode,
            distTel: foundBill.distTel,
            distEmail: foundBill.distEmail,
            summNoPDV: foundSumm.summNoPDV,
            summPDV: foundSumm.summPDV
    };

    const items = bills.map(i => {
            return {
                    name: i.name,   
                    measure: i.measure,
                    amount: i.amount,
                    priceNoPDV: i.priceNoPDV,
                    price: i.price  
                    }
                });
     bill.items = items;
    return bill;
}

async function billConfirmation(id) {
    const billID = id;
    const pass = true;
    const quer = await connection.execute(`UPDATE bill SET bill.confirm = 1 WHERE bill.id = ${billID}`);
    return pass;
} //подтверждение~
//common (1-2)
async function viewCatalog() {
    const resp = await connection.execute(`
        SELECT * FROM catalog_prod;
    `);
    const res = resp[0];
    //console.dir(res,  { compact: false, showHidden:false, colors: true, maxArrayLength: 5, depth: 3 });
    return res;
}

async function viewGood(id) {
    const goodID = id;
    const quer = await connection.execute(`
        SELECT * FROM catalog_prod WHERE catalog_prod.id = ${goodID}`);
    const res = quer[0];
    console.dir(res, { compact: false, showHidden: false, colors: true, maxArrayLength: 5, depth: 3 });
    return res && res[0];
}

async function editCatalog(id, Col, Val) {
    console.log(Col);
    const quer = await connection.execute(`
        UPDATE catalog_prod SET catalog_prod.${Col} = ${sqlValue(Val)} WHERE id = ${id};
    `);
}

async function deleteGood(id) {
    const goodId = id;
    const quer = await connection.execute(`
        DELETE FROM catalog_prod WHERE id = ${goodId};
    `);
    const done = true;
    return done;
}

//common (1-3)
//для менеджера
async function checkOrderBill(orderId, billId) {
    const getOrder = await connection.execute(`
        SELECT  (orders.id) orderId, (orders.summ) orderSumm, (orders.order_date) orderDate,
                (tovar_order.amount) orderAmount, (tovar_order.price) orderPrice, (tovar_order.id_tovar) orderGood,
                (catalog_prod.name) orderGoods 
        FROM orders 
            LEFT JOIN tovar_order ON orders.id = tovar_order.id_order
            LEFT JOIN catalog_prod ON tovar_order.id_tovar = catalog_prod.id
        WHERE orders.id = ${orderId} 
        ORDER BY tovar_order.id_tovar`);
    const getBill = await connection.execute(`
        SELECT  (bill.id) billId, (bill.summ) billSumm, (bill.bill_date) billDate,
                (tovari_bills.amount) billAmount, (tovari_bills.price) billPrice, (tovari_bills.id_tovar) billGood,
                (catalog_prod.name) billGoods 
        FROM bill 
            LEFT JOIN tovari_bills ON bill.id = tovari_bills.id_bill
            LEFT JOIN catalog_prod ON tovari_bills.id_tovar = catalog_prod.id
        WHERE bill.id = ${billId}
        ORDER BY tovari_bills.id_tovar`);
    const foundOrder = getOrder[0];
    const tempOrder = foundOrder[0];
    const order = {
        id: orderId,
        date: tempOrder.orderDate,
        summ: tempOrder.orderSumm
    }
    const orderGoods = foundOrder.map(i=>{
        return{
            name: i.orderGoods,
            amount: i.orderAmount,
            price: i.orderPrice
        }
    });
    order.orderGoods = orderGoods;
    const foundBill = getBill[0];
    const tempBill = foundBill[0];
    const bill = {
        id: billId,
        date: tempBill.billDate,
        summ: tempBill.billSumm
    };
    const billGoods = foundBill.map(i=>{
        return{
            name:i.billGoods,
            amount: i.billAmount,
            price: i.billPrice
        }
    });
    bill.billGoods = billGoods;

    if(bill.summ!=order.summ){
        const differs = {};
        const diffGoods = diff(bill.billGoods,order.orderGoods);
        differs.goods = Object.entries(diffGoods.updated);
        const difference = differs.goods.map(([i, obj]) => {
            return {
                ...billGoods[i],
                updated: obj
            };
        });
        difference.summ = bill.summ - order.summ;
        console.dir(difference[0].updated.name);
        return difference;
    };
    return 1;
} //сравнение заказ-счет

async function getBills(name) {
    const distr = name;
    const bills = await connection.execute(`
        SELECT bill.id, bill.bill_date, distributors.name, bill.summ, bill.payment FROM bill 
        LEFT JOIN distributors ON bill.distributor = distributors.id 
        WHERE distributors.name = '${distr}';`);
    const res = bills[0];
    console.dir(res);
    return res;
} //выборка по счетам

async function getOrder(orderId){
    if(orderId){
        const res = await connection.execute(`
        SELECT orders.order_date, orders.summ,
            (distributors.name) distName,
            tovar_order.amount, tovar_order.price, (tovar_order.amount * tovar_order.price) summTov,
            catalog_prod.name, catalog_prod.measure 
        FROM orders
        LEFT JOIN distributors ON orders.distributor = distributors.id
        LEFT JOIN tovar_order ON orders.id = tovar_order.id_order
        LEFT JOIN catalog_prod ON tovar_order.id_tovar = catalog_prod.id
        WHERE orders.id = ${orderId}
               `);
        const orderDate = moment(res.order_date).format('YYYY-MM-DD');
        const foundOrder = res[0];
        const tempOrder = foundOrder[0];
        const order = {
            id: orderId,
            date: orderDate,
            summ: tempOrder.summ,
            distName: tempOrder.distName
        };
        const goods = foundOrder.map(i=>{
            return{
                name: i.name,
                measure: i.measure,
                amount: i.amount,
                price: i.price,
                summTov: i.summTov
            }
        });
        order.goods = goods;
        console.dir(order);
        return order;
    }
    const res = await connection.execute(`
         SELECT * FROM orders`);
console.dir(res[0]);
return res[0];
}

//возможно будет удалено
async function createRaspor() {
    const resp = false;
    if (resp === true) {
        return resp;
    } else return resp;
} //создать распоряжение на получение

async function getBillConfirmed() {
    const res = await connection.execute(`
        SELECT bill.id, bill.bill_date, distributors.name, bill.summ, bill.payment FROM bill 
        LEFT JOIN distributors ON bill.id = distributors.id 
        WHERE bill.confirm = 1;     
     `);
    console.dir(res, { compact: false, showHidden: false, colors: true, maxArrayLength: 5, depth: 3 });
    return res;
} //выборку по оплач. счетам

async function getNaklad(nakladId) {
    if(nakladId){
        const res = await connection.execute(`
        SELECT (naklad.date_) nakladDate, naklad.bill_id, naklad.warehouse, naklad.summ, (naklad.summ - ((naklad.summ*20)/100)) summNoPDS,
               naklad_order.amount, naklad_order.price, (naklad_order.price*naklad_order.amount) summTov,naklad_order.id_tovar, 
               (distributors.name) distName, distributors.address, distributors.ident_code, distributors.t_number, distributors.e_mail,
               catalog_prod.name, catalog_prod.measure FROM naklad 
               LEFT JOIN bill ON naklad.bill_id = bill.id
               LEFT JOIN distributors ON bill.distributor = distributors.id
               LEFT JOIN naklad_order ON naklad.id = naklad_order.id_naklad
               LEFT JOIN catalog_prod ON naklad_order.id_tovar = catalog_prod.id 
               WHERE naklad.id = ${nakladId};
        `);
        const nakladDate = moment(res.nakladDate).format('YYYY-MM-DD');
        const foundNaklad = res[0];
        const foundNaklad2 = foundNaklad[0];
        const naklad = { 
            id : nakladId,
            date : nakladDate,
            warehouse: foundNaklad2.warehouse,
            summ: foundNaklad2.summ,
            summNoPDS: foundNaklad2.summNoPDS,
            distName: foundNaklad2.distName,
            distAdress: foundNaklad2.address,
            distCode: foundNaklad2.ident_code,
            distTel: foundNaklad2.t_number,
            distEmail: foundNaklad2.e_mail,
        }

        const goods = foundNaklad.map(i=>{
            return{
                id: i.id_tovar,
                name: i.name,
                measure: i.measure,
                amount: i.amount,
                price: i.price,
                summTov: i.summTov
            }
        });
        naklad.goods = goods;
        return naklad;
    }
    const res = await connection.execute(`
        SELECT * FROM naklad;
        `);
    return res[0];
} //получение накладной

async function sendBillForConfirm(id) {
    const resp = await connection.execute(`
        SELECT password_ FROM users WHERE users.role = 'lead';
    `);
    return resp[0];
} //отправить счет на проверку
//для кладовщика
async function createNaklad(naklad) {
    const insertNaklad = await connection.execute(`INSERT INTO naklad (date_,bill_id,warehouse,summ) VALUES('${naklad.date}',${naklad.billId},${naklad.warehouse}, ${naklad.summ})`);
    //console.dir(insertNaklad);
   for(const item of naklad.goods){
       const getGood = await connection.execute(` (SELECT id FROM catalog_prod WHERE name = '${item.name}')`);
       console.log(getGood[0][0].id);
       if(getGood[0].length > 0){
           const insertNakladTovar = await connection.execute(`INSERT INTO naklad_order (id_naklad, id_tovar, amount, price) VALUES (${insertNaklad[0].insertId}, ${getGood[0][0].id}, ${item.amount}, ${item.price})`); 
        }else{
            const insertTovar = await connection.execute(`INSERT INTO catalog_prod (name, amount, price) VALUES ('${item.name}' ,${item.amount},${item.price})`);
            const getGoodAgain = await connection.execute(`SELECT id FROM catalog_prod WHERE name = '${item.name}'`);
            console.log(getGoodAgain[0][0].id);
            const insertNakladTovar = await connection.execute(`INSERT INTO naklad_order (id_naklad, id_tovar, amount, price) VALUES (${insertNaklad[0].insertId}, ${getGoodAgain[0][0].id}, ${item.amount}, ${item.price})`); 
            console.dir(insertTovar);
            console.dir(insertNakladTovar);
        }
   }
   
} //накладная

async function createVedomostPostavok(date) {
    const resp = await connection.execute(`
        SELECT naklad.id, naklad.date_ , naklad.warehouse, naklad_order.amount, catalog_prod.name FROM naklad_order 
        LEFT JOIN naklad ON naklad_order.id_naklad = naklad.id 
        LEFT JOIN catalog_prod ON naklad_order.id_tovar = catalog_prod.id
        WHERE naklad.date_ = '${date}'
    `);
    console.dir(resp);
    return resp;
} //сформировать ведомость поcтавок для менеджера

async function getUnConfirmedBill(){
    const res = await connection.execute(`
        SELECT bill.id, catalog_prod.name, tovari_bills.amount,bill.summ,bill.bill_date, distributors.name AS dist_name  FROM tovari_bills 
        LEFT JOIN catalog_prod ON tovari_bills.id_tovar = catalog_prod.id
        LEFT JOIN bill ON tovari_bills.id_bill = bill.id 
        LEFT JOIN distributors ON bill.distributor = distributors.id
        WHERE bill.confirm = 0;
    `);
    console.dir(res[0]);
    return res[0];
}

// /n [billId] [warehouseId] [summ] [name,price,amount name,price,amount name,price,amount...]
async function createNakladBotFunc(msg, match) {
    const chatId = msg.chat.id;
    const msgDate = msg.date;
    const nakladDate = moment.unix(msgDate).format("YYYY-MM-DD");
    const tempItems = {};
    tempItems.date = nakladDate;
    tempItems.billId = Number(match[1]);
    tempItems.warehouse = Number(match[2]);
    tempItems.summ = Number(match[3]);
    tempItems.goods = [];
    const goods = match[4].split(' ').map(i => i.split(','));
    for(const item of goods) {
        tempItems.goods.push({
            name: item[0],
            price: Number(item[1]),
            amount: Number(item[2]),
        });
    }
    console.dir(tempItems);
    await createNaklad(tempItems);
}

async function getReestr(date1, date2){
    const res = await connection.execute(`
        SELECT naklad.date_, naklad_order.amount, naklad_order.price, (naklad_order.price*naklad_order.amount) summTov,
        (distributors.name) distName, catalog_prod.name, catalog_prod.measure 
        FROM naklad 
        LEFT JOIN bill ON naklad.bill_id = bill.id
        LEFT JOIN distributors ON bill.distributor = distributors.id
        LEFT JOIN naklad_order ON naklad.id = naklad_order.id_naklad
        LEFT JOIN catalog_prod ON naklad_order.id_tovar = catalog_prod.id 
        WHERE date_ >= '${date1}' AND date_ <= '${date2}'
        ORDER BY naklad.date_ `) ;
        
        const tempR = res[0];
        const reestr = {
                date1 : date1,
                date2 : date2
        };

        const goods = tempR.map(i=>{
            return{
                distName : i.distName,
                name : i.name,
                amount: i.amount,
                price: i.price,
                measure: i.measure,
                summTov: i.summTov,
                date: moment(i.date_).format('YYYY-MM-DD')
            }
        });
        reestr.goods = goods;
        console.dir(reestr);
        return reestr; 
}
   

async function botInit() {
    bot.onText(/\/start/, async (msg) => {
        const chatId = msg.chat.id;
        const user = await checkUsers(chatId);
        console.dir(user);
        if(user[0] && user[0].password_) {
            console.log('123')
            await bot.sendMessage(chatId, `Доброго времени суток, ${user[0].login}\nДля просмотра списка доступных команд введите /main`);
            return;
        }
        chatStatuses.set(chatId, userStatus.NEW);
        await bot.sendMessage(chatId, 'Привет! Для продолжения необходимо назначить вашу роль в системе (/setrole [lead, manager, worker]).');
        console.log(chatStatuses.get(chatId), '/start');
    });
    bot.onText(/\/setrole (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const name = msg.from.username;
        const role = match[1];
        const pass = msg.chat.id;
        await registration(chatId, name, pass, role);
        await bot.sendMessage(chatId, 'Вы успешно зарегестрированы в системе как ' + match[1] + '. Чтобы посмотреть список доступных команд введите /main');

        chatStatuses.delete(chatId);
    });
    bot.onText(/\/main/, async (msg) => {
        const chatId = msg.chat.id;
        const login = await checkUsers(chatId);
        console.dir(login);
        if(login[0].role == 'lead'){
            await bot.sendMessage(chatId,`Список доступных команд:`);
            await bot.sendMessage(chatId, `/billList - списко счет-фактур \n/billsbyDist [имя_поставщика] -список счет-фактур от конкретного поставщика\n/viewCatalog - каталог товаров в наличии \n/getConfirmedBills - список подтвержденных счет-фактур \n/getNaklad - список накладных \n/getUnconfBills - список неподтвержденных счет-фактур \n/orderList - список заказов`)
        }
        if(login[0].role == 'manager'){
            await bot.sendMessage(chatId,`Список доступных команд:`);
            await bot.sendMessage(chatId, `/billList - списко счет-фактур \n/billsbyDist [имя_поставщика] -список счет-фактур от конкретного поставщика\n/viewCatalog - каталог товаров в наличии \n/getConfirmedBills - список подтвержденных счет-фактур \n/getNaklad - список накладных \n/getUnconfBills - список неподтвержденных счет-фактур \n/orderList - список заказов \n/compareOrderBill [номер_заказа] [номер_счета]`);
        }
        if(login[0].role == 'worker'){
            await bot.sendMessage(chatId,`Список доступных команд:`);
            await bot.sendMessage(chatId, `/viewCatalog - каталог товаров в наличии \n/createReestr - получить реестр поступлений за период \n/createNaklad [номер_счет-фактуры] [номер_склада] [сумма] [[наименование,цена,количество] ...] - создать накладную`);
        }
    });
    //lead-manager
    bot.onText(/\/billList/, async msg => {
        const id = msg.chat.id;
        const login = await checkUsers(id);
        if(login[0].role != 'worder'){
            chatStatuses.set(id,userStatus.PRINT.BILL);
            const resp = await billHistory();
            await bot.sendMessage(id, `Cписок счет-фактур: `);
            for (const item of resp) {
                const payment = item.payment === 1 ? 'done' : 'undone';
                await bot.sendMessage(id, `/${item.id} - ${item.bill_date}. ${item.name} - ${item.summ}, payment: ${payment}`);
            }
        }else{
            await bot.sendMessage(id, `Команда недоступна`);
        }
    });
    //worker
    bot.onText(/\/createReestr/, async (msg) => {
        const id = msg.chat.id;
        const login = await checkUsers(id);
        if(login[0].role === 'worker'){
            chatStatuses.set(id, userStatus.PRINT.REESTR);
            await bot.sendMessage(id,`Для печати реестра за период введите /print [нижняя_дата] [верхняя_дата]\nДата вводится в формате ГГГГ-ММ-ДД`);
        }else{
            await bot.sendMessage(id, `Команда недоступна`);
        }
        
    });
    //ALL
    bot.onText(/\/viewCatalog/, async (msg) => {
        const id = msg.chat.id;
        chatStatuses.set(id, userStatus.PRINT.REESTR);
        const resp = await viewCatalog();
        if (resp) {
            for (const item of resp) {
                await bot.sendMessage(id, `${item.id}, Наименование: ${item.name}; Количество: ${item.amount} (${item.measure}); Цена ${item.price}\n/delete ${item.id}\n/viewGood ${item.id}`);
            }
        } else {
            await bot.sendMessage(id, `Ошибка`);
        }
    });
    //ALL
    bot.onText(/\/viewGood (.+)/i, async (msg, match) => {
        const id = msg.chat.id;
        const goodId = Number(match[1]);
        const good = await viewGood(goodId);
        const field = Object.keys(good);

        for (const item of field) {
            await bot.sendMessage(id, `${item}: ${good[item]}`);
        }
        await bot.sendMessage(id, `Для редактирования записи воспользуйтейсь командой /edit [id] [field] [new_value]`);
    });
    //lead-manager
    bot.onText(/\/edit (.+?) (.+?) (.+)/i, async (msg, match) => {
        const id = msg.chat.id;
        const login = await checkUsers(id);
        if(login[0].role != 'worker'){
            const respId = Number(match[1]);
            const respCol = match[2];
            const respVal = parseVariable(match[3]);
            if(respCol ===undefined || respId === undefined || respVal === undefined){
                await bot.sendMessage(id,`Проверьте правильность ввода команды`);
                return;
            }
            const resp = await editCatalog(respId, respCol, respVal);
            await bot.sendMessage(id, `Успешно`);
        }else{
            await bot.sendMessage(id,`Команда недоступна`);
            return;
        }
    });
    //lead-manager
    bot.onText(/\/delete (.+)/, async (msg, match) => {
        const id = msg.chat.id;
        const login = await checkUsers(id);
        if(login[0].role != 'worker'){
                const respId = Number(match[1]);
            const resp = await deleteGood(respId);
            if (resp === true) {
                await bot.sendMessage(id, 'Успешно удалено');
            } else {
                await bot.sendMessage(id, 'Запись не найдена.');
            }
        }else{
            await bot.sendMessage(id,`Команда недоступна`);
            return;
        }
        
    });
    //manager
    bot.onText(/\/compareOrderBill (.+?) (.+)/, async (msg, match) => {
        const id = msg.chat.id;
        const login = await checkUsers(id);
        if(login[0].role === 'manager'){
            const orderID = Number(match[1]);
            const billID = Number(match[2]);
            if(orderID === undefined || billID === undefined){
                await bot.sendMessage(id,`Проверьте правильность ввода команды\n/команда [номер_заказа] [номер_счета]`);
                return;
            }
            const resp = await checkOrderBill(orderID, billID);
            if (resp===1) {
                await bot.sendMessage(id, 'Расхождений не выявлено. Для подверждения оплаты счет-фактуры введите /confirm ' + billID);
            } else {
                await bot.sendMessage(id, `Имеются расхождения: \nРазница суммы (Счет-Заказ): ${resp.summ}`);
                for (const item of resp) {
                    const name = item.name === undefined ? '-' : item.name;
                    const upName = item.updated.name === undefined ? '-' : item.updated.name;
                    const price = item.price === undefined ? '-': item.price;
                    const upPrice = item.updated.price === undefined ? '-' : item.update.price;
                    const amount = item.amount === undefined ? '-' : item.amount;
                    const upAmount = item.updated.price === undefined ? '-' : item.updated.amount;
                    await bot.sendMessage(id,`ЗАКАЗАНЫЙ ТОВАР:   ${name}, ПРЕДЛОЖЕННЫЙ: ${upName}\nСТОИМОСТЬ:   ${price},  ПРЕДЛОЖЕННАЯ: ${upPrice}\nКОЛИЧЕСТВО:   ${amount},  ПРЕДЛОЖЕННОЕ: ${upAmount}`);
                }
                await bot.sendMessage(id, `Для подтверждения оплаты введите /confirm ${billID}\n Для отмены оплаты введите /cancel ${billID}`);
            }
        }else{
            await bot.sendMessage(id,`Команда недоступна`);
            return;
        }
    });
    bot.onText(/\/confirm (.+)/, async (msg, match) => {
        const id = msg.chat.id;
        const respId = Number(match[1]);
        if(respId === undefined){
            await bot.sendMessage(id,`Не указан номер счета!`);
            return;
        }
        const resp = await billConfirmation(respId);
        await bot.sendMessage(id, `Успешно`);  
    });
    //lead-manager
    bot.onText(/\/billsbyDist (.+)/, async (msg, match) => {
        const id = msg.chat.id;
        const login = await checkUsers(id);
        if(login[0].role!='worker'){
            const name = String(match[1]);
            if(name === undefined){
                await bot.sendMessage(id,'Проверьте правильность ввода команды');
                return;
            }
            chatStatuses.set(id,userStatus.PRINT.BILL)
            const resp = await getBills(name);
            if(resp){
                const bills = resp;
                console.dir(bills)
                for (const item of bills) {
                    const payment = item.payment === 1 ? 'done' : 'undone';
                    await bot.sendMessage(id, `/${item.id} - ${item.bill_date}. ${item.name} - ${item.summ}, payment: ${payment}`);
                }
            }
            
        }else{
            await bot.sendMessage(id,`Команда недоступна`);
        }
        
    });
    //не готово, воможно, будет удалено
    bot.onText(/\/createRaspor/, async msg => {
        const id = msg.chat.id;
        const resp = await createRaspor();
        if (resp === true) {
            await bot.sendMessage(id, `Распоряжение успешно создано`);
        } else {
            await bot.sendMessage(id, `Произошел троленг`);
        }
    });
    //manager-lead
    bot.onText(/\/getConfirmedBills/, async msg => {
        const id = msg.chat.id;
        const login = await checkUsers(id);
        if(login[0].role != 'worker'){
            const resp = await getBillConfirmed();
            const bills = resp[0];
            await bot.sendMessage(id, `Список подтвержденных счет-фактур: `);
            for (const item of bills) {
                await bot.sendMessage(id, `/${item.id}. ${item.bill_date} - ${item.distributor}. Сумма: ${item.summ}`);
            }
        }else{
            await bot.sendMessage(id, `Команда недоступна`);
            return;
        }
    });
    //manager-lead
    bot.onText(/\/getNaklad/, async msg => {
        const id = msg.chat.id;
        const login = await checkUsers(id);
        if(login[0].role != 'worker'){
            chatStatuses.set(id, userStatus.PRINT.NAKLAD);
            const resp = await getNaklad();
            await bot.sendMessage(id, `Список приходных накладных: `);
            for (const item of resp) {
                await bot.sendMessage(id, `/${item.id}. ${item.date_}; Номер счет-фактуры ${item.bill_id}, на сумму: ${item.summ}. Располагается на складе №${item.warehouse}`);
            }
            await bot.sendMessage(id, `Для получения файла на печать введите /print [id]`);
        }else{
            await bot.sendMessage(id, `Команда недоступна`);
            return;
        }
        
    });
    //lead- manager
    bot.onText(/\/getUnconfBills/, async (msg) => {
        const chatId = msg.chat.id;
        const login = await checkUsers(chatId);
        if(login[0].role != 'worker'){   
            const users = await sendBillForConfirm();
            const bills = await getUnConfirmedBill();
            const billIds = new Set(bills.map(b=>b.id));
            
            for (const user of users) {
                for (const billId of billIds) {
                    const bill = bills.find(b=>b.id === billId);
                    const items = bills.filter(b=>b.id === billId);
                    await bot.sendMessage(user.password_, `/${billId}\nДата: ${bill.bill_date}.\n${items.map(b => `  - ${b.name} (кол:${b.amount})`).join(',\n')}.\nСумма: ${bill.summ} грн.\nПоставщик: ${bill.dist_name}.`);
                }
                await bot.sendMessage(user.password_,` Для подтверждения счет фактуры введите /confirm [id]`)
            }
        }else{
            await bot.sendMessage(chatId,`Команда недоступна`);
            return;
        }
    });
    //worker
    bot.onText(/\/createNaklad (.+?) (.+?) (.+?) (.+)/, async (msg,match) => {
        const chatId = msg.chat.id;
        const login = await checkUsers(chatId);
        if(login[0].role === 'worker'){
            if(match.length < 4){
                const resp = await createNakladBotFunc(msg, match);
                await bot.sendMessage(chatId, `Успешно`);
            }
        }else{
            await bot.sendMessage(chatId, `Команда недоступна`);
            return;
        }
        await bot.sendMessage(chatId,`net`);
    });
    // /n [billId] [warehouseId] [summ] [name,price,amount name,price,amount name,price,amount...]
    //не готово - составить HTML-страницу 
    bot.onText(/\/incomeDate (.+)/, async (msg,match) => {
        const id = msg.chat.id;
        const date = moment.unix(match[1]).format("YYYY-MM-DD");
        const resp = await createVedomostPostavok(date);
        
    });
    
    bot.onText(/\/done/, async (msg)=>{
        const chatId = msg.chat.id;
        console.log(chatStatuses.get(chatId), '/done');
        if(chatStatuses.get(chatId)===userStatus.CREATING_NAKLAD.NEW){
            chatStatuses.set(chatId, userStatus.CREATING_NAKLAD.GOT_BILL)
            await bot.sendMessage(chatId, `Введите наименование товара(-ов), каждое в отдельном сообщении.\nПо завершению списков введите /done`);
            console.log(`получил номер счета`);
            return;
        }

        if(chatStatuses.get(chatId) === userStatus.CREATING_NAKLAD.GOT_BILL){
            chatStatuses.set(chatId, userStatus.CREATING_NAKLAD.GOT_NAMES);
            await bot.sendMessage(chatId, `Введите стоимости в порядке ввода товаров.\nПо завершению, введите /done чтобы перети к следующему шагу`);
            console.log('получил все имена');
            return;
        }
        //ввод цен на товары
        if(chatStatuses.get(chatId)===userStatus.CREATING_NAKLAD.GOT_NAMES){
            chatStatuses.set(chatId, userStatus.CREATING_NAKLAD.GOT_PRICES);
            await bot.sendMessage(chatId, `Введите соответвующие объемы поставок.\nДля продолжения: /done`);
            console.log('получил все цены');
            return;
        }
        //ввод количества товаров
        if(chatStatuses.get(chatId)===userStatus.CREATING_NAKLAD.GOT_PRICES){
            chatStatuses.set(chatId, userStatus.CREATING_NAKLAD.GOT_AMOUNTS);
            await bot.sendMessage(chatId, `Введите общую сумму поставки. /done для продолжения.`);
            console.log('получил все количества');
            return;
        }
        //ввод суммы
        if(chatStatuses.get(chatId)===userStatus.CREATING_NAKLAD.GOT_AMOUNTS){
            chatStatuses.set(chatId, userStatus.CREATING_NAKLAD.GOT_SUMM);
            await bot.sendMessage(chatId, `Введите номер склада. /done для продолжения`)
            console.log('получил все суммы');
            return;
        }
        if(chatStatuses.get(chatId)===userStatus.CREATING_NAKLAD.GOT_SUMM){
            chatStatuses.set(chatId, userStatus.CREATING_NAKLAD.GOT_WAREHOUSE);
            chatStatuses.delete(chatId);
            const tempNaklad = chatNaklads.get(chatId);
            console.log('получил все склады');
            console.dir(tempNaklad);
            await createNaklad(tempNaklad);
            await bot.sendMessage(chatId, `Успешно создано`);
            return;
        }
    });
    //lead-manager
    bot.onText(/\/orderList/, async(msg)=>{
        const chatId = msg.chat.id;
        const login = await checkUsers(chatId);
        if(login[0].role != 'worker'){
            const orders = await getOrder();
            chatStatuses.set(chatId, userStatus.PRINT.ORDER);
            for (const item of orders) {
                await bot.sendMessage(chatId,`/${item.id}\nДата: ${item.order_date}\nПоставщик: ${item.distributor}\nСумма заказа: ${item.summ}`);
            };
            await bot.sendMessage(chatId, `Для печати заказа введите /print [id]`);
            console.log(chatStatuses.get(chatId));
        }
        else{
            await bot.sendMessage(chatId, `Команда недоступна`);
            return;
        }
    })

    bot.onText(/\/print (.+)/, async (msg, match)=>{
        const chatId = msg.chat.id;
        console.log(chatStatuses.get(chatId));
        if(chatStatuses.get(chatId) === userStatus.PRINT.BILL){
            const billId = Number(match[1]);
            const bill = await getBill(billId);
            const file = await ejs.renderFile('./doc1.ejs', { bill });
            console.log(file);
            const pdf = await generatePDF(file);
            const fileOptions = {
                filename: `Счет-фактура #${billId}`
            }
            await bot.sendDocument(chatId, pdf, {}, fileOptions);
        };
        if(chatStatuses.get(chatId) === userStatus.PRINT.NAKLAD){
            const nakladId = Number(match[1]);
            const naklad = await getNaklad(nakladId);
            const file = await ejs.renderFile('./naklad.ejs', { naklad });
            const pdf = await generatePDF(file);
            const fileOptions = {
                filename: `Накладная №${nakladId}`
            }
            await bot.sendDocument(chatId, pdf,{}, fileOptions);
        };
        if(chatStatuses.get(chatId) === userStatus.PRINT.ORDER){
            const orderId = Number(match[1]);
            console.log(match[1], match[2]);
            const order = await getOrder(orderId);
            const file = await ejs.renderFile('./order.ejs', {order});
            const pdf = await generatePDF(file);
            const fileOptions={
                filename: `Заказ № ${orderId}`
            }
            await bot.sendDocument(chatId, pdf, {}, fileOptions);
        };
        if(chatStatuses.get(chatId) === userStatus.PRINT.REESTR){
            const dates = match[1].split(' ');
            const date1 = dates[0];
            const date2 = dates[1];
            console.log(date1,date2);
            const reestr = await getReestr(date1,date2);
            const file = await ejs.renderFile('./reestr.ejs', {reestr});
            const pdf = await generatePDF(file);
            const fileOptions={
                filename: `Реестр за период ${date1} - ${date2} `
            }
            await bot.sendDocument(chatId, pdf, {}, fileOptions);
        }
    })
}


async function cleardb() {
    const sqls = [
        'SET FOREIGN_KEY_CHECKS=0',
        // "TRUNCATE TABLE bill",
        // "TRUNCATE TABLE catalog_prod",
        // "TRUNCATE TABLE distributors",
        // "TRUNCATE TABLE distributors2",
        // "TRUNCATE TABLE naklad",
        // "TRUNCATE TABLE naklad_order",
        // "TRUNCATE TABLE orders",
        // "TRUNCATE TABLE positions",
        // "TRUNCATE TABLE rasporyazhenie",
        // "TRUNCATE TABLE tovar_order",
        // "TRUNCATE TABLE tovari_bills",
        //"TRUNCATE TABLE users",
        // "TRUNCATE TABLE warehouse",
        'SET FOREIGN_KEY_CHECKS=1'
    ];

    for (const sql of sqls) {
        await connection.query(sql);
    }
}

async function test() {
    await cleardb();
    //await registration (123, 'viva','pass','bog');
    //await billHistory();
    //await viewCatalog();
    // await editCatalog(1, 'name' , 'gоколад');
    //await viewGood(1);
    //await getBills('Rogale');
    //await deleteGood(3);
    //await createBillConfirmed();
    //await getNaklad(46);
    //await createNaklad(temp);
    // await getUnConfirmedBill();
    //await createVedomostPostavok('2019-11-11');
    //await getBill(3);
    //await getOrder(1);
    //await getReestr(date1,date2);
    //await checkOrderBill(4,5);
}
async function start() {
    await botInit();
    await initDatabase();
    await test();
}
function sqlValue(val) {
    if (val === null || val === undefined) return 'NULL';
    return typeof val === 'string' ? `'${val}'` : String(val);
}
function parseVariable(val) {
    const numVal = Number(val);
    if (Number.isNaN(numVal)) {
        return String(val);
    }
    return Number(val);
}
async function checkUsers(id){
    const user = await connection.execute(`SELECT * FROM users WHERE users.password_ = ${id}`);
    console.dir(user[0]);
    if(user){
        return user[0];
    }
    return;
}
async function generatePDF(file){
    const pdf = await Html2Pdf.render({
        html: file,
        url: 'http://0.0.0.0:3000'
    }, {
        format: 'A4'
    });
    return pdf;
}
bot.on('message', async (msg)=>{
    if(msg.text.startsWith('/'))
        return;
    const chatId = msg.chat.id;
    if(chatStatuses.get(chatId)===userStatus.CREATING_NAKLAD.NEW){
        const tempNaklad = chatNaklads.get(chatId);
        tempNaklad.bill = msg.text;
    }
    //ввод наименований товара
    if(chatStatuses.get(chatId) === userStatus.CREATING_NAKLAD.GOT_BILL){
        const tempNaklad = chatNaklads.get(chatId);
        tempNaklad.name = msg.text;
    }
    //ввод цен на товары
    if(chatStatuses.get(chatId)===userStatus.CREATING_NAKLAD.GOT_NAMES){
        const tempNaklad = chatNaklads.get(chatId);
        tempNaklad.price = msg.text;
    }
    //ввод количества товаров
    if(chatStatuses.get(chatId)===userStatus.CREATING_NAKLAD.GOT_PRICES){
        const tempNaklad = chatNaklads.get(chatId);
        tempNaklad.amount = msg.text;
    }
    //ввод суммы
    if(chatStatuses.get(chatId)===userStatus.CREATING_NAKLAD.GOT_AMOUNTS){
        const tempNaklad = chatNaklads.get(chatId);
        tempNaklad.summ = msg.text;
    }
    if(chatStatuses.get(chatId) === userStatus.CREATING_NAKLAD.GOT_SUMM){
        const tempNaklad = chatNaklads.get(chatId);
        tempNaklad.warehouse = msg.text;
    }
})
start();