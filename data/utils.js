const i18n = require('./i18n');

function getExistingLocales() {
    const locales = {};
    Object.keys(i18n).forEach(message => {
        Object.keys(i18n[message]).forEach(locale => locales[locale] = true)
    });
    return locales;
}

function isLocaleExists(locale) {
    const locales = getExistingLocales();

    return !!locales[locale];
}

class Localizer {
    constructor(locale) {
        this.locale = locale;
    }

    get(obj) {
        return obj[this.locale];
    }
}

module.exports = {
    isLocaleExists,
    Localizer
}