// Registre des SOURCES DE DONNÉES personnelles. La brique RGPD ne connaît pas vos tables :
// chaque module de l'app enregistre une source { collect, erase }, et la brique sait alors
// EXPORTER (droit d'accès/portabilité) et EFFACER (droit à l'oubli) toutes les données d'un user.
// Les collecteurs/effaceurs sont typiquement des requêtes de la brique 'db'. ZÉRO dépendance.
export interface DataSource {
  /** nom de la catégorie de données (ex. "profil", "commandes") */
  name: string;
  /** renvoie toutes les données de cet utilisateur pour l'export */
  collect(userId: string): Promise<unknown> | unknown;
  /** efface les données de cet utilisateur, renvoie le nombre d'enregistrements supprimés */
  erase(userId: string): Promise<number> | number;
}

export class PrivacyRegistry {
  private sources: DataSource[] = [];

  register(source: DataSource): void {
    if (this.sources.some((s) => s.name === source.name)) {
      throw new Error(`source de données déjà enregistrée : ${source.name}`);
    }
    this.sources.push(source);
  }

  names(): string[] {
    return this.sources.map((s) => s.name);
  }

  /** Droit d'accès / portabilité : un objet { [catégorie]: données }. */
  async exportUserData(userId: string): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = {};
    for (const s of this.sources) out[s.name] = await s.collect(userId);
    return out;
  }

  /** Droit à l'oubli : efface toutes les sources, renvoie { [catégorie]: nb supprimés }. */
  async eraseUserData(userId: string): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const s of this.sources) out[s.name] = await s.erase(userId);
    return out;
  }
}
