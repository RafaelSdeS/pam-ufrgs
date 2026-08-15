// Proxy mínimo: recebe pergunta + contexto do aluno, chama a Groq (chave fica só aqui,
// nunca no bundle do frontend) e devolve a resposta. Sem rate limiting próprio -
// o teto da Groq (30 req/min, 6k tokens/min) já é suficiente para uso pessoal.
// O limite diário de tokens (TPD) da Groq é por modelo, não da conta inteira - por isso
// tenta uma lista de modelos em ordem e só desiste se todos estiverem no limite.

const MODELS = ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'llama-3.1-8b-instant']

const SYSTEM_PROMPT = `Você é um assistente que ajuda estudantes de Ciência da Computação ou
Engenharia de Computação da UFRGS a entender a grade curricular e montar seu cronograma de
disciplinas. Responda em português, de forma direta e objetiva, usando SOMENTE os dados de
currículo/disciplinas fornecidos no contexto JSON abaixo - não invente códigos, nomes ou
pré-requisitos de disciplinas que não estejam no contexto.

Sempre que mencionar QUALQUER disciplina na resposta (seja a disciplina perguntada, um
pré-requisito, ou qualquer outra), escreva o nome completo por extenso seguido do código entre
parênteses - ex: "Estruturas de Dados (INF01203)". Nunca cite um código sozinho sem o nome.

O campo "disciplinas_curriculo" lista as disciplinas OBRIGATÓRIAS do curso. O campo
"disciplinas_eletivas" (quando presente) lista disciplinas ELETIVAS - fora da grade obrigatória,
mas que também contam como créditos eletivos. Ao explicar pré-requisitos ou créditos de uma
disciplina, procure o código em ambas as listas antes de dizer que ela não existe, e deixe claro
se é obrigatória ou eletiva quando isso for relevante para a pergunta.

Sobre se o aluno PODE ou NÃO PODE cursar uma disciplina: o campo "disciplinas_elegiveis" do
contexto já foi calculado deterministicamente pelo sistema (comparando pré-requisitos com
disciplinas concluídas) e é a fonte de verdade. NUNCA recalcule elegibilidade por conta própria
comparando pré-requisitos manualmente - isso leva a erros. Se o código da disciplina está em
"disciplinas_elegiveis", a resposta é "sim, pode cursar"; caso contrário, "não, ainda não pode"
e explique qual pré-requisito falta usando "disciplinas_concluidas" e "pre_requisitos".

O campo "turmas" (quando presente) lista as turmas oferecidas das disciplinas que a pergunta
menciona, cada uma com "turma" (código da seção), "professor" e "horarios" (dia da semana,
início, fim e sala). Use SOMENTE esses dados pra responder sobre horário/sala/professor de
turma - nunca invente. Se a pergunta for sobre horário/sala/turma de uma disciplina e o campo
"turmas" não estiver no contexto ou vier vazio, diga que não conseguiu identificar a turma
dessa disciplina no momento, em vez de uma resposta genérica sobre "consultar o sistema da
instituição".`

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || ''
    const corsHeaders = buildCorsHeaders(origin, env)

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders)
    }

    let body
    try {
      body = await request.json()
    } catch (e) {
      return jsonResponse({ error: 'JSON inválido' }, 400, corsHeaders)
    }

    const question = (body.question || '').toString().trim().slice(0, 2000)
    const context = body.context || {}

    if (!question) {
      return jsonResponse({ error: 'Pergunta vazia' }, 400, corsHeaders)
    }

    // ponytail: rate limit fixo por IP (RATE_LIMITER binding), sem coordenação entre PoPs -
    // suficiente pro volume de um site pessoal, trocar se abuso real for detectado
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
    const { success } = await env.RATE_LIMITER.limit({ key: ip })
    if (!success) {
      return jsonResponse({ error: 'Muitas perguntas em pouco tempo, aguarde um instante.' }, 429, corsHeaders)
    }

    let lastError = null
    for (const model of MODELS) {
      const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model,
          temperature: 0.3,
          max_tokens: 800,
          messages: [
            { role: 'system', content: `${SYSTEM_PROMPT}\n\nContexto do aluno:\n${JSON.stringify(context)}` },
            { role: 'user', content: question }
          ]
        })
      })

      if (groqResponse.ok) {
        const data = await groqResponse.json()
        const answer = data.choices?.[0]?.message?.content || ''
        return jsonResponse({ answer, model }, 200, corsHeaders)
      }

      const errText = await groqResponse.text()
      if (groqResponse.status === 429) {
        const waitMatch = /try again in ([\d.]+)s/.exec(errText)
        lastError = { retryAfterSeconds: waitMatch ? Math.ceil(parseFloat(waitMatch[1])) : 20, detail: errText.slice(0, 300) }
        continue // esse modelo bateu o limite, tenta o próximo
      }

      return jsonResponse({ error: 'Falha ao consultar a IA.', detail: errText.slice(0, 300) }, 502, corsHeaders)
    }

    // Todos os modelos bateram o limite diário/por minuto
    return jsonResponse({ error: 'Limite de perguntas gratuitas atingido no momento.', ...lastError }, 429, corsHeaders)
  }
}

function buildCorsHeaders(origin, env) {
  const allowedOrigin = env.ALLOWED_ORIGIN || '*'
  return {
    'Access-Control-Allow-Origin': allowedOrigin === '*' ? '*' : (origin === allowedOrigin ? origin : allowedOrigin),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  }
}

function jsonResponse(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers })
}
