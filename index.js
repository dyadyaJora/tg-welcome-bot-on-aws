const dotenv = require('dotenv');
dotenv.config();

const i18n = require('./data/i18n');
const utils = require('./data/utils');
const TelegramBot = require('node-telegram-bot-api');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN';
const NICKNAME = process.env.TELEGRAM_BOT_NICKNAME || 'YOUR_TELEGRAM_BOT_NICKNAME';
const SQLITE_DB_PATH = process.env.SQLITE_DB_PATH || './db.sqlite3';
const LOCALE = process.env.LOCALE || 'en-GB';

if (!utils.isLocaleExists(LOCALE)) {
    console.log("Used LOCALE doesn't exists! Bot was stopped!")
    process.exit(1);
}

const Localizer = require('./data/utils').Localizer;
const loc = new Localizer(LOCALE);
const { Sequelize, DataTypes } = require('sequelize');
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: SQLITE_DB_PATH
});
const Subscriptions = sequelize.define('Subscriptions', {
    chatId: {
        type: DataTypes.BIGINT,
        allowNull: false
    },
    chatTitle: {
        type: DataTypes.STRING
    },
    ownerId: {
        type: DataTypes.BIGINT,
        allowNull: false
    },
    ownerName: {
        type: DataTypes.STRING
    },
    message: {
        type: DataTypes.STRING
    }
}, {});

class App {
    constructor() {
        this.bot = new TelegramBot(TOKEN, {polling: true});
    }

    start() {
        this.bot.on('message', (msg) => {
            const chatId = msg.chat.id;

            console.log(msg);

            if (msg.group_chat_created) {
                this.bot.sendMessage(chatId, '\u{1F44B} ' + loc.get(i18n.GREETING))
                    .catch(err => {
                        console.log("Couldn't send first message", err);
                    });
                return;
            }

            if (msg.left_chat_participant) {
                this._deleteWelcomeMessageByChatId(chatId)
                    .then(() => {
                        console.log("processed deleted from chat");
                    })
                    .catch(err => {
                        console.log("error deleting from chat: " + chatId, err);
                    });
                return;
            }

            if (!msg.new_chat_participant) {
                return;
            }

            this._getSubscription(chatId)
                .then(sub => {
                    if (!sub) {
                        this._sendNoDataMessage(chatId);
                        return;
                    }

                    let content = sub['message'];
                    if (!content) {
                        this._sendNoDataMessage(chatId);
                        return;
                    }
                    let newMembersStr = msg.new_chat_members.map(member => {
                        return this._buildOwnerName(member);
                    }).join(", ");

                    let chatTitle = msg.chat.title;

                    let welcomeText = loc.get(i18n.WELCOME_TO_CHAT) + ' "' + chatTitle + '", ' + newMembersStr + '!\n';
                    let welcomeMessage = welcomeText + content;

                    return this.bot.sendMessage(chatId, welcomeMessage);
                })
                .catch(err => {
                    console.log(err, "Couldn't send welcome message");
                });
        });

        const helpRegexp = new RegExp('^\/help(|@' + NICKNAME + ')$');
        this.bot.onText(helpRegexp, (msg, match) => {
            const chatId = msg.chat.id;
            let helpMessage = "\u{1F7E2} <b>" + loc.get(i18n.HELP_HEADER) + "</b> \u{1F7E2}\n\n" +
                "/start - " + loc.get(i18n.HELP_START) + "\n" +
                "/set_text TEXT - " + loc.get(i18n.HELP_SET_TEXT) + "\n" +
                "/get_text - " + loc.get(i18n.HELP_GET_TEXT) + "\n" +
                "/owner - " + loc.get(i18n.HELP_OWNER) + "\n" +
                "/help " + loc.get(i18n.HELP_HELP) + "\n\n\u{270C}";

            this.bot.sendMessage(chatId, helpMessage, {
                parse_mode: 'html'
            });
        });

        const startRegexp = new RegExp('^\/start(|@' + NICKNAME + ')$');
        this.bot.onText(startRegexp, (msg, match) => {
            const chatId = msg.chat.id;

            this._getSubscription(chatId)
                .then(sub => {
                    if (sub !== null) {
                        this.bot.sendMessage(chatId, loc.get(i18n.BOT_LAUNCHED));
                        return;
                    }

                    let ownerId = msg.from.id;
                    let ownerName = this._buildOwnerName(msg.from);
                    let chatTitle = (msg.chat.title || msg.chat.type);
                    this._registerNewChat(chatId, chatTitle, ownerId, ownerName)
                        .then((sub) => {
                            console.log(sub, "subscription recreated!");
                            return this.bot.sendMessage(chatId, loc.get(i18n.STARTED_SUCCESSFULLY));
                        })
                        .catch((err) => {
                            console.log("Couldn't send first message", err);
                            return this.bot.sendMessage(chatId, loc.get(i18n.STARTED_WITH_FAIL));
                        });
                })
        });

        const ownerRegexp = new RegExp('^\/owner(|@' + NICKNAME + ')$');
        this.bot.onText(ownerRegexp, (msg, match) => {
            const chatId = msg.chat.id;

            this._getSubscription(chatId)
                .then(sub => {
                    let ownerName = sub['ownerName'];
                    return this.bot.sendMessage(chatId, loc.get(i18n.OWNER_TEXT) + ownerName);
                })
                .catch(err => {
                    console.log(err, "Error getting owner name");
                })
        });

        const getTextRegexp = new RegExp('^\/get_text(|@' + NICKNAME + ')$');
        this.bot.onText(getTextRegexp, (msg, match) => {
            const chatId = msg.chat.id;

            this._getSubscription(chatId)
                .then(sub => {
                    if (sub === null) {
                        this.bot.sendMessage(chatId, loc.get(i18n.GET_TEXT_ERROR));
                        return;
                    }

                    let content = sub['message'];
                    if (!content) {
                        return this.bot.sendMessage(chatId, "\u{1F6AB} *" + loc.get(i18n.GET_TEXT_EMPTY) + "*", {
                            parse_mode: 'markdown'
                        })
                    }

                    return this.bot.sendMessage(chatId, content);
                })
                .catch(err => {
                    console.log("Couldn't send getText message", err);
                });
        });

        const setTextRegexp = new RegExp('^\/set_text(|@' + NICKNAME + ') (((.*)|([\\n\\r]*))*)$');
        this.bot.onText(setTextRegexp, (msg, match) => {
            const chatId = msg.chat.id;
            let newWelcomeMessage = match[2];
            if (!newWelcomeMessage) {
                this.bot.sendMessage(chatId, "\u{1F6AB} " + loc.get(i18n.SET_TEXT_EMPTY));
                return;
            }

            let requesterId = msg.from.id;

            this._setWelcomeMessageByChatId(chatId, requesterId, newWelcomeMessage)
                .then(() => {
                    console.log("Subscription successfully updated! " + chatId);
                })
                .catch((err) => {
                    console.log(err, "Error updating subscription in chat: " + chatId);
                })
        });

        console.log("Bot application started");
    }

    _sendNoDataMessage(chatId) {
        return this.bot.sendMessage(chatId, "\u{1F937} " + loc.get(i18n.WELCOME_NO_DATA));
    }

    _setWelcomeMessageByChatId(chatId, requesterId, content) {
        return new Promise((resolve, reject) => {
            this._getSubscription(chatId)
                .then(sub => {
                    if (!sub) {
                        reject();
                        return;
                    }

                    let ownerId = sub['ownerId'];
                    let ownerName = sub['ownerName'];
                    if (ownerId !== requesterId) {
                        this.bot.sendMessage(chatId, loc.get(i18n.SET_TEXT_PERMISSION_ERROR) + ' ' + ownerName);
                        reject();
                        return;
                    }

                    Subscriptions.update({
                        message: content
                    }, {
                        where: {
                            chatId: chatId
                        }
                    }).then(() => {
                        this.bot.sendMessage(chatId, "\u{2705} " + loc.get(i18n.SET_TEXT_UPDATED_SUCCESSFULLY) + "\n<b>" + loc.get(i18n.SET_TEXT_NEW_TEXT) + "</b>:\n" + content, {
                            parse_mode: 'html'
                        }).then(() => {
                            resolve();
                        }).catch(err => {
                            console.log(err, "Error sending ok message!");
                            reject(err);
                        });
                    }).catch(err => {
                        this.bot.sendMessage(chatId, "\u{274C} " + loc.get(i18n.SET_TEXT_UPDATED_WITH_FAIL));
                        reject(err);
                    });
                })
                .catch(err => {
                    reject(err);
                });
        });
    }

    _deleteWelcomeMessageByChatId(chatId) {
        return Subscriptions.destroy({
            where: {
                chatId: chatId
            }
        });
    }

    _registerNewChat(chatId, chatTitle, ownerId, ownerName) {
        return Subscriptions.create({
            ownerId: ownerId,
            ownerName: ownerName,
            chatId: chatId,
            chatTitle: chatTitle
        });
    }

    _getSubscription(chatId) {
        return Subscriptions.findOne({
            where: {
                chatId: chatId
            }
        });
    }

    _getAllSubscriptions() {
        return Subscriptions.findAll();
    }

    _buildOwnerName(from) {
        let firstName = from.first_name;
        let lastName = from.last_name;
        let username = from.username;
        let msgOwnerNameParts = [];
        if (!!firstName) {
            msgOwnerNameParts.push(firstName);
        }
        if (!!lastName) {
            msgOwnerNameParts.push(lastName);
        }
        if (!!username) {
            msgOwnerNameParts.push('@' + username);
        }

        return msgOwnerNameParts.join(' ');
    }
}

const app = new App();
Subscriptions.sync({ alter: true })
    .then(() => {
        app.start();
    })
    .catch(err => {
        console.log(err, "Error connecting database!");
    })