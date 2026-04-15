# Casa Clara Financeiro

Aplicativo web mobile-first para controle compartilhado de gastos familiares entre duas pessoas, com foco em cadastro rapido, dashboards visuais e historico mensal.

## O que o MVP entrega

- Registro de gastos e entradas
- Categorias visuais com icones e cores
- Historico com edicao e exclusao
- Dashboard do mes com resumo, evolucao e distribuicao por categoria
- Resumo automatico mensal
- Modo local pronto para uso imediato
- Estrutura pronta para sincronizacao em tempo real com Supabase

## Stack

- React + TypeScript + Vite
- Recharts para visualizacoes
- Lucide React para icones
- Supabase como backend opcional para realtime

## Como rodar

1. Instale Node.js 20+.
2. No diretorio do projeto, execute `npm install`.
3. Execute `npm run dev`.

## Publicar e usar no celular

Para abrir no celular sem depender do seu computador ligado, publique o app (recomendado: Vercel).

### 1. Subir para o GitHub

1. Crie um repositório no GitHub.
2. No projeto local:
   - `git init`
   - `git add .`
   - `git commit -m "feat: casa clara pronto para deploy"`
   - `git branch -M main`
   - `git remote add origin <URL_DO_REPOSITORIO>`
   - `git push -u origin main`

### 2. Deploy na Vercel

1. Acesse https://vercel.com/new
2. Importe o repositório.
3. Framework: Vite (detecção automática).
4. Build command: `npm run build`
5. Output directory: `dist`
6. Clique em Deploy.

### 3. Variáveis de ambiente (se usar Supabase)

No projeto da Vercel, adicione as variáveis:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_HOUSEHOLD_ID`

Depois, faça um novo deploy.

### 4. Instalar no celular (como app)

- Android (Chrome): abra a URL publicada e toque em `Adicionar à tela inicial`.
- iPhone (Safari): abra a URL publicada, toque em `Compartilhar` e escolha `Adicionar à Tela de Início`.

O projeto já está configurado como PWA (manifest + service worker), então ele abre em modo de app quando instalado.

## Importante sobre sincronização

- Sem Supabase: os dados ficam apenas no navegador de cada aparelho.
- Com Supabase: os dados sincronizam entre seu celular, celular da Karina e computador.

## Modo local

Sem configurar nada, o app funciona com `localStorage` e dados de exemplo. Isso permite testar o fluxo inteiro no mesmo navegador.

## Ativar sincronizacao com Supabase

1. Crie um projeto no Supabase.
2. Rode o SQL de [supabase/schema.sql](supabase/schema.sql).
3. Copie `.env.example` para `.env`.
4. Preencha:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_SUPABASE_HOUSEHOLD_ID`
5. Reinicie o frontend.

Quando as variaveis estiverem configuradas, o app passa a ler e gravar transacoes e categorias no Supabase. O canal realtime publica as alteracoes para os dois usuarios conectados.

## Modelo de dados

### Categories

- `id`
- `household_id`
- `name`
- `color`
- `icon`
- `kind`
- `is_default`

### Transactions

- `id`
- `household_id`
- `description`
- `amount`
- `type`
- `category_id`
- `paid_by`
- `transaction_date`
- `notes`
- `created_at`
- `updated_at`

## Evolucao sugerida

1. Autenticacao real por convite do casal
2. Orcamento por categoria
3. Lancamentos recorrentes
4. Metas e alertas
5. Exportacao CSV/Excel
6. App nativo com React Native ou Flutter, se o uso justificar