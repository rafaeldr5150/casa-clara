CREATE TABLE IF NOT EXISTS expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  store TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Outros',
  amount DECIMAL(10,2) NOT NULL,
  description TEXT DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'EUR'
);

-- Disable RLS so the app funciona sem autenticação
ALTER TABLE expenses DISABLE ROW LEVEL SECURITY;
