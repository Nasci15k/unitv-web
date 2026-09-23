# OpenTv Web Player

Clone web do app UniTV Android IPTV. Acesso direto ao servidor Xtream (sem proxy).

## Como rodar

```bash
cd unitv-web
npm start
```

Abra `http://localhost:3001`.

- Player: `index.html`
- Login/Cadastro: `login.html` (Supabase)
- Painel ADM: `admin.html` (perfil `role=admin`)

## Supabase / Netlify

Ver `NETLIFY_SETUP.md` (schema, admin, edge functions, deploy).
Prompt de redesign CSS: `PROMPT_KIMI_K3_CSS.md`.

## O que e

- Player IPTV: TV, filmes, séries, Kids, Jogos, Explorar
- API Xtream direta (`telefunplay.xyz`) + CORS do servidor
- Legendas VOD (`SubtitleStore`), idioma pt/en/es, configurações
- Imagens com fallback (`image-guard`), favoritos, parental, EPG
- Auth + perfis + edge functions em `supabase/functions/`

## Estrutura

```
unitv-web/
├── proxy.js           # Servidor estático (3001)
├── index.html         # Player
├── login.html         # Auth
├── admin.html         # Painel ADM
├── netlify.toml       # Deploy SPA
├── NETLIFY_SETUP.md
├── PROMPT_KIMI_K3_CSS.md
├── css/               # style.css + admin.css
├── js/                # api, player, app, auth, i18n, subs…
├── supabase/          # schema.sql + edge functions
└── assets/
```

