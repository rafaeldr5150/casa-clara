import { GoogleGenerativeAI } from '@google/generative-ai'
import type { ExpenseItem } from './types'

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY)

export interface ExtractedTicket {
  store: string
  date: string
  amount: number
  category: string
  description: string
  items: ExpenseItem[]
}

export async function scanTicket(imageBase64: string, mimeType: string): Promise<ExtractedTicket> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const today = new Date().toISOString().split('T')[0]

  const prompt = `Analisa este ticket/recibo de compra com muito detalhe e extrai as informações em JSON.
Responde APENAS com JSON válido, sem texto adicional nem markdown.

{
  "store": "nome do estabelecimento (ex: Mercadona, Zara, Repsol)",
  "date": "data no formato YYYY-MM-DD (se não encontrares usa ${today})",
  "amount": valor_total_numerico_sem_simbolo,
  "category": "uma categoria: Supermercado, Restaurante, Transporte, Saúde, Lazer, Vestuário, Casa, Farmácia, Gasolina, Outros",
  "description": "descrição curta do que foi comprado (máximo 50 caracteres)",
  "items": [
    {
      "name": "nome do produto como aparece no ticket",
      "quantity": quantidade_numerica,
      "unit_price": preco_unitario_numerico,
      "total": total_do_produto_numerico
    }
  ]
}

Extrai TODOS os produtos do ticket na lista "items". Se um produto não tiver quantidade explícita, usa 1.
Se não conseguires identificar itens individuais, usa uma lista vazia [].`

  const result = await model.generateContent([
    { inlineData: { data: imageBase64, mimeType: mimeType as 'image/jpeg' | 'image/png' | 'image/webp' } },
    prompt,
  ])

  const text = result.response.text().trim().replace(/```json\n?|\n?```/g, '').trim()

  try {
    const parsed = JSON.parse(text)
    return { ...parsed, items: parsed.items ?? [] }
  } catch {
    throw new Error('Não foi possível extrair os dados do ticket. Tenta com uma foto mais clara.')
  }
}
