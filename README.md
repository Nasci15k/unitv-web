# UniTV Web Player

Clone web do app UniTV Android IPTV.

## Como rodar

```bash
cd unitv-web
npm start
```

Abra `http://localhost:3000` no navegador.

## O que e

- Player IPTV com suporte a TV ao vivo, filmes e series
- API Xtream Codes conectada automaticamente
- Proxy local para resolver problemas de CORS
- Interface identica ao app Android

## Estrutura

```
unitv-web/
├── proxy.js        # Servidor proxy (Node.js)
├── index.html      # Interface principal
├── css/style.css   # Estilos
├── js/
│   ├── api.js      # API Xtream Codes
│   ├── app.js      # Logica do app
│   └── player.js   # Player de video
└── assets/         # Imagens e icones
```
