// Física 2D pura da sinuca, sem nada de DOM/Canvas — testável em JVM/Node.
// As bolas são objetos { x, y, vx, vy, r, potted? }. As funções mutam a bola
// (padrão de motor de física) e devolvem se houve o evento, para o laço do jogo
// tocar o som certo. O laço compõe estas primitivas com sub-passos pequenos de
// dt para não "atravessar" bolas em alta velocidade (tunneling).

/**
 * Colisão elástica entre dois círculos de MESMA massa. Só age se estiverem
 * sobrepostos E se aproximando (senão as bolas grudariam ao se separar).
 * Troca as componentes normais das velocidades e corrige a sobreposição.
 * `restitution` = 1 é perfeitamente elástico (padrão); < 1 perde energia.
 */
export function collideElastic(a, b, restitution = 1) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const dist = Math.hypot(dx, dy)
  const minDist = a.r + b.r
  if (dist === 0 || dist >= minDist) return false

  const nx = dx / dist
  const ny = dy / dist

  // Velocidade relativa projetada na normal: > 0 = aproximando.
  const vn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny
  if (vn <= 0) return false

  // Massa igual: cada bola cede metade do impulso (1+e)/2 do fechamento.
  const impulso = ((1 + restitution) / 2) * vn
  a.vx -= impulso * nx
  a.vy -= impulso * ny
  b.vx += impulso * nx
  b.vy += impulso * ny

  // Empurra as duas para longe, dividindo a sobreposição igualmente.
  const overlap = (minDist - dist) / 2
  a.x -= nx * overlap
  a.y -= ny * overlap
  b.x += nx * overlap
  b.y += ny * overlap
  return true
}

/**
 * Reflete a bola nas quatro tabelas. `bounds` são os limites do CENTRO da bola
 * (a mesa já descontou o raio). Devolve true se bateu em alguma parede.
 */
export function reflectCushion(ball, bounds, restitution = 1) {
  let bateu = false
  if (ball.x < bounds.left) { ball.x = bounds.left; ball.vx = Math.abs(ball.vx) * restitution; bateu = true }
  else if (ball.x > bounds.right) { ball.x = bounds.right; ball.vx = -Math.abs(ball.vx) * restitution; bateu = true }
  if (ball.y < bounds.top) { ball.y = bounds.top; ball.vy = Math.abs(ball.vy) * restitution; bateu = true }
  else if (ball.y > bounds.bottom) { ball.y = bounds.bottom; ball.vy = -Math.abs(ball.vy) * restitution; bateu = true }
  return bateu
}

/**
 * Integra a posição por um passo dt e aplica atrito de rolamento como uma
 * desaceleração linear `decel` (u/s). Abaixo de `minSpeed` a bola zera — sem
 * isso ela ficaria tremendo eternamente com velocidades ínfimas.
 */
export function stepBall(ball, dt, decel, minSpeed) {
  ball.x += ball.vx * dt
  ball.y += ball.vy * dt
  const speed = Math.hypot(ball.vx, ball.vy)
  if (speed === 0) return
  const novo = speed - decel * dt
  if (novo <= minSpeed) {
    ball.vx = 0
    ball.vy = 0
  } else {
    const escala = novo / speed
    ball.vx *= escala
    ball.vy *= escala
  }
}

/** True se o centro da bola caiu dentro do raio de captura de alguma caçapa. */
export function pocketed(ball, pockets, captureRadius) {
  return pockets.some((p) => Math.hypot(ball.x - p.x, ball.y - p.y) <= captureRadius)
}

/** True quando todas as bolas ainda em jogo (não encaçapadas) estão paradas. */
export function allAtRest(balls) {
  return balls.every((b) => b.potted || (b.vx === 0 && b.vy === 0))
}
