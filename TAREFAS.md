# Tarefas — Moto TV

## Design
- [x] Brainstorming e definição de escopo (protótipo enxuto)
- [x] Documento de design (spec) em `docs/superpowers/specs/2026-08-14-moto-tv-controle-celular-design.md`
- [x] Revisão do spec pelo usuário
- [x] Plano de implementação (writing-plans)

## Implementação (a detalhar no plano)
- [x] Projeto Android TV base (WebView fullscreen + LEANBACK)
- [x] Servidor Ktor embutido (HTTPS autoassinado + rotas + WebSocket relay)
- [x] Descoberta de IP na WiFi + modo dev (IP do Mac para o emulador)
- [x] Jogo Three.js (pista, moto, carros, câmera 3ª pessoa, colisão, estados)
- [x] QR code na tela do jogo
- [x] Página de controle no iPhone (permissão, gamma→steer, WebSocket, calibrar, reiniciar)
- [x] Testes JS (steer, colisão AABB, mensagens)
- [x] Testes Kotlin (rotas, relay, NetworkUtils)
- [x] Trocar o Ktor por NanoHTTPD + TLS (Netty quebra no Android; CIO não faz HTTPS)
- [x] Porta HTTPS 8443 → 8444 (o receptor de Cast do Android TV já ocupa a 8443)
- [x] Validar em runtime no emulador de Android TV (jogo renderiza, relay WebSocket entrega)
- [ ] Checklist de validação manual (render + sensor real no iPhone)
