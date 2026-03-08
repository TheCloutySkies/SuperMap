/**
 * Keyword-based signal detection for Reddit comments and other text.
 * Used to tag early signals (explosion, missile, cyber, etc.) for OSINT.
 */

function detectSignals(comment) {
  const signals = []
  const text = (comment.text || comment.body || comment.description || '').toLowerCase()

  if (text.includes('explosion') || text.includes('explosions')) signals.push('explosion')
  if (text.includes('missile') || text.includes('missiles')) signals.push('missile')
  if (text.includes('drone') || text.includes('drones')) signals.push('drone')
  if (text.includes('satellite')) signals.push('satellite')
  if (text.includes('hack') || text.includes('hacked') || text.includes('breach')) signals.push('cyberattack')
  if (text.includes('power outage') || text.includes('blackout') || text.includes('grid down')) signals.push('power_grid')
  if (text.includes('earthquake')) signals.push('earthquake')
  if (text.includes('wildfire') || text.includes('forest fire')) signals.push('wildfire')
  if (text.includes('strike') && (text.includes('drone') || text.includes('missile') || text.includes('air'))) signals.push('strike')
  if (text.includes('invasion') || text.includes('offensive') || text.includes('advance')) signals.push('conflict')
  if (text.includes('evacuation') || text.includes('evacuate')) signals.push('evacuation')
  if (text.includes('outage') || text.includes('down')) signals.push('outage')
  if (text.includes('ransomware') || text.includes('malware')) signals.push('cyberattack')
  if (text.includes('protest') || text.includes('riot')) signals.push('civil_unrest')
  if (text.includes('flood') || text.includes('flooding')) signals.push('flood')
  if (text.includes('tsunami')) signals.push('tsunami')
  if (text.includes('nuclear') || text.includes('radiation')) signals.push('nuclear')
  if (text.includes('airport') || text.includes('flight ban')) signals.push('aviation')
  if (text.includes('port') && (text.includes('closed') || text.includes('blocked'))) signals.push('shipping')
  if (text.includes('pipe') && (text.includes('explosion') || text.includes('sabotage'))) signals.push('infrastructure')

  return [...new Set(signals)]
}

module.exports = { detectSignals }
