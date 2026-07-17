import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
const ALLOWED_EMAIL     = 'scott.weston@proav.com'
const MODEL             = 'claude-sonnet-5'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SYSTEM_PROMPT_HEADER = `You are the Capacity Assistant embedded in proAV's Production Report dashboard, a tool for planning rack builds through build -> offsite test -> onsite installation.

Domain knowledge:
- Each task/row is one system's rack build, with an optional offsite test/commissioning window and an optional onsite installation window.
- "wireman" is the rack builder assigned to build the rack. "test_engineer" is the offsite commissioner who tests it. Onsite build tasks reuse "wireman" as the attending on-site engineer.
- Rack-builder capacity: at most rackBuilderCapacity wiremen can be actively building at once (a task counts while its status is not yet "Built and waiting testing" / "Test Department Working On Rack" / "Ready To Send"), minus anyone on leave that day. rackBuilderConflicts lists specific days where demand already exceeds that.
- Offsite-commissioner capacity works the same way for test_engineer slots vs offsiteCommissionerCapacity — see offsiteCommissionerConflicts.
- Onsite installs are tracked separately: onsiteEngineerCapacity engineers can be on site concurrently, summarized per week in onsiteWeeklyDemand (demand vs capacity for each week). Estimated onsite duration for a build is qty * daysPerRackType[rack_type] (or defaultDaysPerRack if that rack_type has no override) — see onsiteDurationFormula.
- tasks is the live list of in-window rack builds/tests/onsite jobs. pendingAndApprovedRequests are onsite-build requests submitted by project managers that have not yet been folded into tasks. upcomingLeave is approved annual leave for rack builders/commissioners.

Answering rules:
- Only use the JSON data provided below as fact — never invent task names, people, or numbers that aren't in it. If the data doesn't cover something, say so.
- For "what if" / hypothetical questions (e.g. adding N racks in a given month), show your arithmetic explicitly: state the current demand vs capacity for the affected week(s) from onsiteWeeklyDemand (or day(s) from the conflict lists), add the hypothetical load using onsiteDurationFormula, and say plainly whether it fits or by how much it's over.
- When suggesting a course of action, ground it in real people/dates from the data (e.g. "wireman X's current build ends 2026-08-12") rather than generic advice.
- Be concise — short paragraphs or a few bullet points, not long essays. Hedge appropriately: this is a planning aid, not a commitment.`

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!token) {
      return new Response(JSON.stringify({ error: 'Not signed in.' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const authedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: userData, error: userErr } = await authedClient.auth.getUser()
    if (userErr || !userData?.user || userData.user.email !== ALLOWED_EMAIL) {
      return new Response(JSON.stringify({ error: 'Not authorized.' }), {
        status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const messages = Array.isArray(body?.messages) ? body.messages : []
    if (!messages.length) {
      return new Response(JSON.stringify({ error: 'No message provided.' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const trimmedMessages = messages.slice(-10).map((m: any) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content ?? '').slice(0, 4000),
    }))

    const systemPrompt = `${SYSTEM_PROMPT_HEADER}

Today's date: ${new Date().toISOString().slice(0, 10)}

Live dashboard data (JSON) — this is the ONLY source of truth for this conversation. Do not invent tasks, people, or numbers that aren't in it:
${JSON.stringify(body?.context ?? {})}`

    const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages: trimmedMessages,
      }),
    })

    if (!claudeResp.ok) {
      const errText = await claudeResp.text()
      return new Response(JSON.stringify({ error: `Claude API ${claudeResp.status}: ${errText.slice(0, 300)}` }), {
        status: 502, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const data  = await claudeResp.json()
    const reply = (data.content ?? []).map((b: any) => b.text ?? '').join('').trim() || '(no response)'

    return new Response(JSON.stringify({ reply }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
