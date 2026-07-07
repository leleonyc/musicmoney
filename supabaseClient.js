import { createClient } from "@supabase/supabase-js";

// Essas chaves são públicas por natureza (a "anon key" do Supabase é feita
// para rodar no navegador). A segurança real fica nas regras (RLS) que você
// configura dentro do painel do Supabase, não em esconder essa chave.
const SUPABASE_URL = "https://rplicovqvybimqutvrnh.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJwbGljb3ZxdnliaW1xdXR2cm5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzODU3MzYsImV4cCI6MjA5ODk2MTczNn0.Nba2X1s6BwCqhoywSSChecHFJ8KuAXzwwsTOcNEEkA0";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
