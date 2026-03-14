const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const WEEKDAY_NAMES = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

function getNextWeekday(weekday: number): string {
  const now = new Date();
  const current = now.getDay();
  let daysAhead = weekday - current;
  if (daysAhead <= 0) daysAhead += 7;
  const next = new Date(now);
  next.setDate(now.getDate() + daysAhead);
  return next.toISOString().split('T')[0];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const cp = url.searchParams.get('cp')?.trim();

    if (!cp) {
      return new Response(JSON.stringify({ error: 'Parâmetro "cp" obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const prefix = parseInt(cp.replace(/[^0-9]/g, '').substring(0, 4));
    if (isNaN(prefix)) {
      return new Response(JSON.stringify({ error: 'Código postal inválido' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Query delivery_regions from DB
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: regions, error } = await supabase
      .from('delivery_regions')
      .select('*');

    if (error) throw error;

    // Find matching region
    const matchedRegion = (regions || []).find((r: any) => {
      const start = parseInt(r.postal_prefix_start);
      const end = parseInt(r.postal_prefix_end);
      return prefix >= start && prefix <= end;
    });

    // Try to get parish/municipality from GeoAPI
    let freguesia = null;
    let municipio = null;
    try {
      const geoRes = await fetch(`https://geoapi.pt/cp/${cp}?json=1`);
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        freguesia = geoData?.Freguesia || geoData?.freguesia || null;
        municipio = geoData?.Concelho || geoData?.concelho || null;
      }
    } catch { /* ignore */ }

    if (!matchedRegion) {
      return new Response(JSON.stringify({
        postal_code: cp,
        region: null,
        suggested_day: null,
        next_delivery_date: null,
        freguesia,
        municipio,
        message: 'Não existe região configurada para este código postal',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const suggestedDay = matchedRegion.default_weekday !== null
      ? WEEKDAY_NAMES[matchedRegion.default_weekday]
      : null;

    const nextDate = matchedRegion.default_weekday !== null
      ? getNextWeekday(matchedRegion.default_weekday)
      : null;

    return new Response(JSON.stringify({
      postal_code: cp,
      region: matchedRegion.name,
      suggested_day: suggestedDay,
      next_delivery_date: nextDate,
      freguesia,
      municipio,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
