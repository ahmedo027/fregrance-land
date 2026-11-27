export function roundAed(amount: number): number
export function shippingFeeForCountry(country: string): number
export function estimateStripeFee(amount: number, options?: { internationalCard?: boolean; currencyConversion?: boolean }): number
export function suggestPrice(options: {
  cost: number
  shipping: number
  marginPercent: number
  payment: 'Card' | 'Cash'
  internationalCard: boolean
  currencyConversion?: boolean
}): { productPrice: number; customerPays: number; stripeFee: number; netProductProfit: number } | null
