# Prompt — Kimi K3: reescrever CSS do OpenTv

Você é um UI designer sênior de streaming/IPTV. Reescreva **apenas** o arquivo `css/style.css` do app OpenTv (HTML estático + JS vanilla). Não altere HTML nem JS.

## Objetivo
Visual dark premium (tipo Netflix/Prime), filtros, grids de filmes/séries, lista de canais TV e player com qualidade AAA. O CSS atual é “feio”/inconsistente — uniformizar.

## Tokens (obrigatórios)
```css
--bg-0:#08080d; --bg-1:#0e0e16; --bg-2:#16162a; --bg-3:#1f1f3a;
--accent:#e94560; --accent-2:#7c3aed;
--accent-gradient:linear-gradient(135deg,#e94560,#7c3aed);
--text-1:#fff; --text-2:rgba(255,255,255,.7); --text-3:rgba(255,255,255,.38);
--border:rgba(255,255,255,.06); --radius:12px; --font:'Inter',sans-serif;
--sidebar-w:220px; --topbar-h:64px;
```
Fonte Inter (Google Fonts import no topo). Sem frameworks.

## Classes que DEVEM continuar funcionando (JS depende)
`.hidden`, `.splash`, `.enter-btn`, `.sidebar`, `.nav-item`, `.nav-group-label`, `.main-content`, `.top-bar`, `.search-bar`, `.content-grid`, `.content-card`, `.channel-card`, `.ch-logo`, `.poster-img`, `.filter-pill`, `.filter-pills`, `.modal-overlay`, `.modal-box`, `.filter-modal-header`, `.btn-filter-apply`, `.empty-state`, `.loading-overlay`, `#player-modal`, `.player-controls`, `.ctrl-btn-sm`, `.settings-option`, `.parental-box`, `.pin-digit`, `.resume-box`, `.toast`, `.badge`, `.card-fav`, `.card-progress`, `.jogos-*` (se existir), `.detail-*`

## Seções a redesenhar
1. Splash + botão Entrar  
2. Sidebar (collapsible mobile) + user-card  
3. Top bar / busca  
4. Pills de filtro (scroll horizontal, active glow)  
5. Grid filmes/séries: `aspect-ratio:2/3`, hover lift, badge, progresso  
6. Canais TV: logo, número, status  
7. Detail modal + resume  
8. Player (controles, settings panel, seek)  
9. Filter/parental/settings modals  
10. Empty states, scrollbars, focus-visible  
11. Responsive ≤768px  

## Critérios
- Espaçamento 8px, sombras suaves, motion `cubic-bezier(.4,0,.2,1)`  
- Acessibilidade: contraste AA, `:focus-visible`  
- Nada de `display:none` que quebre JS  
- Output: CSS completo só, sem comentários longos  

## Inventario atual (referência)
Abrir `css/style.css` e cobrir todas as regras existentes + melhorias acima.
