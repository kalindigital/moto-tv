# Checklist de validação manual — Moto TV

Passo a passo para conferir, na mão, o que os testes automatizados não cobrem (render 3D e sensor real). Marque cada item ao validar.

Pré-condições: AVD de Android TV (API 34) rodando com o app instalado; iPhone na **mesma WiFi** do Mac. Para o loop do iPhone com o emulador, `devOverrideIp` setado com o IP do Mac e `adb forward tcp:8443 tcp:8443` ativo (ver README).

## 1. Smoke no emulador

- [ ] O app abre em **tela cheia**, em **landscape**, sem barra de título.
- [ ] O **jogo 3D** aparece (pista, moto, carros, câmera em 3ª pessoa).
- [ ] O **QR code** aparece sobreposto e está **legível na TV** (nítido, contraste bom).
- [ ] O servidor sobe sem erro (a página carrega; sem tela em branco).

## 2. Fallback de teclado (sem celular)

- [ ] Com o jogo em espera, **← ou →** inicia a corrida.
- [ ] **←** vira a moto para a esquerda; **→** para a direita; soltar volta ao neutro.
- [ ] Ao **bater**, aparece a mensagem de colisão e o jogo para.
- [ ] **Enter** reinicia a corrida após bater.

## 3. Loop completo do iPhone

- [ ] **Escanear o QR** (ou digitar a URL) abre a página de controle no Safari.
- [ ] O **aviso de certificado autoassinado** aparece e é **aceito uma vez** ("Mostrar detalhes" → "Visitar este site"); nas próximas vezes não pede de novo.
- [ ] Tocar em **Ativar controle** dispara o pedido de **permissão de movimento**; ao conceder, o status muda para **conectado**.
- [ ] **Inclinar** o iPhone para os lados faz a **moto desviar** na TV, com latência baixa.
- [ ] **Calibrar** com o celular numa posição confortável zera o neutro (parado = moto reta).
- [ ] Ao **bater** na TV, tocar em **Reiniciar** no celular recomeça a corrida.

## 4. Reconexão do WebSocket

- [ ] Com o controle ativo, **bloquear o iPhone** (tela apagada) derruba a conexão (status vira "reconectando…").
- [ ] Ao **desbloquear**, o controle **reconecta sozinho** e a moto volta a responder à inclinação.

## 5. Orientação (girar o iPhone para paisagem)

- [ ] Ao **girar o iPhone para paisagem**, verificar o comportamento da direção (a leitura de inclinação usada é o `gamma`; documentar se continua utilizável ou se o uso pretendido é retrato). Recalibrar após girar, se necessário.

## 6. Qualidade percebida

- [ ] **Render 3D fluido** na TV (sem travadas perceptíveis durante a corrida).
- [ ] **QR legível na TV** à distância normal de uso (repetindo o item 1 sob condição real de sala).
