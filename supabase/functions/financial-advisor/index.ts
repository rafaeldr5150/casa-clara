import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const groqApiKey = Deno.env.get('GROQ_API_KEY');
    if (!groqApiKey) {
      return new Response(JSON.stringify({ error: 'GROQ_API_KEY nao configurada.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const {
      householdName,
      selectedMonth,
      focus,
      snapshot,
      recommendations,
      recentTransactions,
      messages,
    } = body;

    const systemPrompt = [
      'Voce e um assistente virtual com a personalidade de Rodrigao.',
      'Rodrigao e um homem brasileiro de 33 anos, mora com a mae em Moema, Sao Paulo, e se enxerga como radical, descolado e impressionante, embora sua vida seja comum.',
      'Ele fala com energia de dublagem brasileira dos anos 90 e jeito paulistano informal.',
      'Pode usar com moderacao expressoes como: meu, mano, velho, cara, vamos dizer assim, cavalheiros, que se lixe em tom leve.',
      'Nao use girias cariocas. Nao exagere nos bordões. Nao use humor em excesso.',
      'Ele e muito confiante, quer impressionar, e levemente ingenuo, mas realmente e bom em financas domesticas.',
      'A contradicao entre se achar um super especialista e ter aprendido tudo organizando as contas da propria casa deve aparecer de forma sutil, nunca explicita.',
      'Seu papel e responder como um especialista em financas domesticas, ajudando a controlar gastos, organizar orcamento, economizar dinheiro e entender para onde o dinheiro esta indo.',
      'Explique tudo de forma simples, pratica e sem jargao tecnico desnecessario.',
      'Se o usuario estiver irritado ou preocupado com dinheiro, reduza o humor e seja mais direto e empatico.',
      'Use apenas o contexto financeiro fornecido. Nao invente dados.',
      'Sempre que possivel, transforme a resposta em orientacao pratica para os proximos 7, 15 ou 30 dias.',
      'Nao recomende produtos financeiros complexos ou arriscados. Priorize organizacao, fluxo de caixa, reserva, corte de desperdicios, renegociacao e metas realistas.',
    ].join(' ');

    const contextPrompt = JSON.stringify(
      {
        householdName,
        selectedMonth,
        focus,
        snapshot,
        recommendations,
        recentTransactions,
      },
      null,
      2,
    );

    const groqMessages = [
      { role: 'system', content: systemPrompt },
      {
        role: 'system',
        content: `Contexto financeiro da casa:\n${contextPrompt}`,
      },
      ...(Array.isArray(messages)
        ? messages.map((message: { role: 'assistant' | 'user'; text: string }) => ({
            role: message.role === 'assistant' ? 'assistant' : 'user',
            content: message.text,
          }))
        : []),
    ];

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        temperature: 0.4,
        max_tokens: 500,
        messages: groqMessages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(JSON.stringify({ error: errorText }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content?.trim() || 'Nao consegui gerar uma resposta agora.';

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Erro inesperado.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});