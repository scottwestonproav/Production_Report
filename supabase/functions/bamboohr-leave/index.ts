import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const BAMBOO_API_KEY  = Deno.env.get('BAMBOO_API_KEY') ?? ''
const BAMBOO_SUBDOMAIN = 'proav'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const url    = new URL(req.url)
    const today  = new Date().toISOString().slice(0, 10)
    const future = new Date(Date.now() + 548 * 864e5).toISOString().slice(0, 10)
    const start  = url.searchParams.get('start') ?? today
    const end    = url.searchParams.get('end')   ?? future

    const bambooUrl = `https://api.bamboohr.com/api/gateway.php/${BAMBOO_SUBDOMAIN}/v1/time_off/requests/?start=${start}&end=${end}&status=approved`

    const resp = await fetch(bambooUrl, {
      headers: {
        'Authorization': `Basic ${btoa(BAMBOO_API_KEY + ':x')}`,
        'Accept': 'application/json',
      },
    })

    if (!resp.ok) {
      return new Response(JSON.stringify({ error: `BambooHR ${resp.status}` }), {
        status: resp.status,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const data = await resp.json()
    return new Response(JSON.stringify(data), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
