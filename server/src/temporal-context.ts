// Conscience temporelle — injection d'un bloc TEMPS à chaque tour du système.
// Recalculé systématiquement (new Date() frais) pour rester juste dans des
// sessions longues qui traversent minuit. Fuseau de la machine de Raf.
//
// Décision D4 (plan #182) : injection en TÊTE de system prompt, 3 points,
// gate TEMPORAL_AWARENESS = défaut ON (rare exception à « OFF = byte-identique »).

/**
 * Retourne une ligne de contexte temporel prêt à injecter.
 * Format : « Contexte temporel : nous sommes le {jour} {date}, {heure} ({fuseau}, UTC{offset}). »
 *
 * @param date Optionnel pour les tests (défaut: new Date())
 * @returns Chaîne horodatage lisible + repère ISO/offset
 */
export function temporalContext(date: Date = new Date()): string {
  // Jours de semaine et mois en français
  const daysOfWeek = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const monthsOfYear = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre"
  ];

  const dayOfWeek = daysOfWeek[date.getDay()];
  const dayOfMonth = date.getDate();
  const month = monthsOfYear[date.getMonth()];
  const year = date.getFullYear();

  // Heure au format HH:MM
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const timeStr = `${hours}:${minutes}`;

  // Fuseau horaire de la machine (repli Europe/Paris si indisponible)
  let timeZone = "Europe/Paris";
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    // Repli silencieux
  }

  // Calcul du décalage UTC (en minutes, converti en heures)
  const offsetMinutes = -date.getTimezoneOffset();
  const offsetSign = offsetMinutes >= 0 ? "+" : "-";
  const offsetHours = Math.abs(Math.floor(offsetMinutes / 60));
  const offsetMins = Math.abs(offsetMinutes % 60);
  const offsetStr = offsetMins === 0
    ? `${offsetSign}${offsetHours}`
    : `${offsetSign}${offsetHours}:${String(offsetMins).padStart(2, "0")}`;

  return `Contexte temporel : nous sommes le ${dayOfWeek} ${dayOfMonth} ${month} ${year}, ${timeStr} (${timeZone}, UTC${offsetStr}).`;
}
