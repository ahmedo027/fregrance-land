export function roundAed(amount) {
  return Math.sign(amount) * Math.round((Math.abs(amount) + Number.EPSILON) * 100) / 100
}

export function shippingFeeForCountry(country) {
  return country === 'AE' ? 25 : 80
}

function stripeRate(internationalCard, currencyConversion) {
  return (29 + (internationalCard ? 10 : 0) + (currencyConversion ? 10 : 0)) / 1000
}

export function estimateStripeFee(amount, { internationalCard = false, currencyConversion = false } = {}) {
  return amount > 0 ? roundAed(amount * stripeRate(internationalCard, currencyConversion) + 1) : 0
}

export function suggestPrice({ cost, shipping, marginPercent, payment, internationalCard, currencyConversion }) {
  const card = payment === 'Card'
  const rate = card ? stripeRate(internationalCard, currencyConversion) : 0
  const margin = marginPercent / 100
  const availableShare = 1 - rate - margin
  if (![cost, shipping, margin].every(value => Number.isFinite(value) && value >= 0) || availableShare <= 0) return null

  const feeOptions = { internationalCard, currencyConversion }
  const minimum = (cost + shipping * rate + (card ? 1 : 0)) / availableShare
  let productPrice = Math.ceil(minimum * 100 - 1e-8) / 100
  let customerPays = roundAed(productPrice + shipping)
  let stripeFee = card ? estimateStripeFee(customerPays, feeOptions) : 0
  // The percentage fee is rounded per payment. Make sure the quoted price still reaches the target.
  while (productPrice - cost - stripeFee + 1e-8 < productPrice * margin) {
    productPrice = roundAed(productPrice + 0.01)
    customerPays = roundAed(productPrice + shipping)
    stripeFee = card ? estimateStripeFee(customerPays, feeOptions) : 0
  }
  return { productPrice, customerPays, stripeFee, netProductProfit: roundAed(productPrice - cost - stripeFee) }
}
