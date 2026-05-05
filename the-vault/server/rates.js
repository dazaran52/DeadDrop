// Currency Engine
// Rates relative to CZK (base currency)

const RATES = {
  CZK: 1,
  EUR: 25.2,
  PLN: 5.8,
  UAH: 0.62,
};

/**
 * Convert CZK to target currency
 * @param {number} amountCZK - Amount in CZK
 * @param {string} targetCurrency - Target currency code (EUR, PLN, UAH)
 * @returns {number} - Converted amount
 */
function convertFromCZK(amountCZK, targetCurrency) {
  const rate = RATES[targetCurrency];
  if (!rate) {
    throw new Error(`Unsupported currency: ${targetCurrency}`);
  }
  return amountCZK / rate;
}

/**
 * Convert from any currency to CZK
 * @param {number} amount - Amount to convert
 * @param {string} fromCurrency - Source currency code
 * @returns {number} - Amount in CZK
 */
function convertToCZK(amount, fromCurrency) {
  const rate = RATES[fromCurrency];
  if (!rate) {
    throw new Error(`Unsupported currency: ${fromCurrency}`);
  }
  return amount * rate;
}

/**
 * Get all currencies for a CZK amount
 * @param {number} amountCZK - Amount in CZK
 * @returns {Object} - Object with all currencies
 */
function getAllCurrencies(amountCZK) {
  return {
    CZK: amountCZK,
    EUR: convertFromCZK(amountCZK, 'EUR'),
    PLN: convertFromCZK(amountCZK, 'PLN'),
    UAH: convertFromCZK(amountCZK, 'UAH'),
  };
}

module.exports = {
  RATES,
  convertFromCZK,
  convertToCZK,
  getAllCurrencies,
};
