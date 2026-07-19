require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  const { data, error } = await supabase
    .from('calendars')
    .select('id, source, source_url, data, updated_at')
    .eq('id', 'uefs')
    .single();

  if (error) {
    console.error('Supabase query failed:', error.message);
    return res.status(500).json({
      calendars: [],
      error: 'Falha ao obter dados do Supabase',
      details: error.message,
    });
  }

  if (!data) {
    return res.status(200).json({
      calendars: [],
      warning: 'Nenhum calendário encontrado. Aguardando coleta via automação.',
    });
  }

  return res.status(200).json({
    calendars: data.data,
    source: data.source,
    source_url: data.source_url,
    updated_at: data.updated_at,
  });
};
