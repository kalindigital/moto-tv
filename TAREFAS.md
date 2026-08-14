# Tarefas — Moto TV

## Design
- [x] Brainstorming e definição de escopo (protótipo enxuto)
- [x] Documento de design (spec) em `docs/superpowers/specs/2026-08-14-moto-tv-controle-celular-design.md`
- [ ] Revisão do spec pelo usuário
- [ ] Plano de implementação (writing-plans)

## Implementação (a detalhar no plano)
- [ ] Projeto Android TV base (WebView fullscreen + LEANBACK)
- [ ] Servidor Ktor embutido (HTTPS autoassinado + rotas + WebSocket relay)
- [ ] Descoberta de IP na WiFi + modo dev (IP do Mac para o emulador)
- [ ] Jogo Three.js (pista, moto, carros, câmera 3ª pessoa, colisão, estados)
- [ ] QR code na tela do jogo
- [ ] Página de controle no iPhone (permissão, gamma→steer, WebSocket, calibrar, reiniciar)
- [ ] Testes JS (steer, colisão AABB, mensagens)
- [ ] Testes Kotlin (relay Ktor, NetworkUtils)
- [ ] Checklist de validação manual (render + sensor real)
