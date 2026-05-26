export interface ParsedPayment {
  amount: number | null
  store: string
}

export function parsePaymentText(text: string): ParsedPayment {
  if (!text) return { amount: null, store: '' }

  // Normalize: remove line breaks, collapse spaces
  const t = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()

  // Extract amount — handles: 12,50€ | 12.50€ | €12,50 | EUR 12.50 | 12,50 EUR
  const amountPatterns = [
    /(\d{1,5})[,.](\d{2})\s*€/,
    /€\s*(\d{1,5})[,.](\d{2})/,
    /(\d{1,5})[,.](\d{2})\s*EUR/i,
    /EUR\s*(\d{1,5})[,.](\d{2})/i,
  ]

  let amount: number | null = null
  for (const p of amountPatterns) {
    const m = t.match(p)
    if (m) {
      amount = parseFloat(`${m[1]}.${m[2]}`)
      break
    }
  }

  // Extract merchant — handles common Spanish bank notification formats
  const merchantPatterns = [
    // "en McDonald's" / "en MERCADONA" / "at Starbucks"
    /(?:\ben\b|\bat\b)\s+([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9\s&'*.\-]{1,35})(?:\s*[.,]|\s+con\s|\s+el\s|\s+\*|\s*$)/i,
    // "Comercio: ZARA" / "COMERCIO NETFLIX"
    /Comercio:?\s+([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9\s&'.\-]{1,35}?)(?:\s*[.,]|\s*$)/i,
    // "paid €X to McDonald's" / "pagado a ZARA"
    /(?:paid?|pagado?)\s+(?:€[\d,.]+\s+)?(?:a|to)\s+([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9\s&'.\-]{1,35}?)(?:\s*[.,]|\s*$)/i,
  ]

  let store = ''
  for (const p of merchantPatterns) {
    const m = t.match(p)
    if (m?.[1]) {
      store = m[1].replace(/[.,;:*]+$/, '').trim()
      if (store.length >= 2) break
    }
  }

  return { amount, store }
}
