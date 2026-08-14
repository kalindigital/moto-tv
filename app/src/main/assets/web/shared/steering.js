export function gammaToSteer(gamma, { neutral = 0, maxAngle = 35, deadzone = 3 } = {}) {
  const delta = gamma - neutral
  const sign = Math.sign(delta)
  const mag = Math.abs(delta)
  if (mag <= deadzone) return 0
  const clamped = Math.min(mag, maxAngle)
  const norm = (clamped - deadzone) / (maxAngle - deadzone)
  return sign * norm
}
