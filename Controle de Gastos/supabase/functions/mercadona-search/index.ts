import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { query, warehouse = 'mad1' } = await req.json()

    if (!query || query.trim().length < 2) {
      return new Response(JSON.stringify({ results: { products: [] } }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const url = `https://tienda.mercadona.es/api/search/?query=${encodeURIComponent(query.trim())}&lang=es&wh=${warehouse}`

    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
        Referer: 'https://tienda.mercadona.es/',
        Origin: 'https://tienda.mercadona.es',
      },
    })

    if (!res.ok) throw new Error(`Mercadona ${res.status}`)

    const data = await res.json()
    return new Response(JSON.stringify(data), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
