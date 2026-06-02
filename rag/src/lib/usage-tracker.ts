import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { CACHE_DIR } from "./config.js";

/** État de consommation pour un jour donné. */
export interface UsageState {
  /** Clé de jour au format YYYY-MM-DD (dans le fuseau de référence). */
  date: string;
  /** Nombre de requêtes d'embedding consommées ce jour-là. */
  count: number;
}

/** Persistance du compteur. Injectable pour les tests. */
export interface UsageStorage {
  load(): UsageState | null;
  save(state: UsageState): void;
}

/** Levée quand une consommation ferait dépasser le plafond journalier. */
export class DailyCapExceededError extends Error {
  constructor(
    public readonly used: number,
    public readonly max: number
  ) {
    super(
      `Plafond journalier d'embeddings atteint (${used}/${max}). ` +
        `Réessaie demain (le quota se réinitialise à minuit Pacifique) ` +
        `ou augmente MAX_EMBED_REQUESTS_PER_DAY dans .env.`
    );
    this.name = "DailyCapExceededError";
  }
}

/** Clé de jour (YYYY-MM-DD) calculée dans le fuseau donné. */
export function dayKey(now: Date, timeZone: string): string {
  // en-CA produit nativement le format YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export interface UsageTrackerOptions {
  /** Plafond de requêtes d'embedding par jour. */
  maxPerDay: number;
  /**
   * Crédits réservés aux consommations prioritaires (requêtes de recherche).
   * L'indexation s'arrête à `maxPerDay − reserveForPriority` ; les requêtes
   * gardent accès jusqu'à `maxPerDay`. Défaut : 0 (pas de réserve).
   */
  reserveForPriority?: number;
  /** Fuseau de référence pour la frontière de jour (défaut : Pacifique, aligné sur Gemini). */
  timeZone?: string;
  /** Horloge injectable (défaut : Date courante). */
  now?: () => Date;
  /** Persistance injectable (défaut : fichier JSON dans CACHE_DIR). */
  storage?: UsageStorage;
}

/**
 * Garde-fou A : plafond dur, local, du nombre de requêtes d'embedding par jour.
 * Indépendant du tier Gemini (free ou payant), il protège contre les boucles
 * folles et les ré-indexations redondantes qui brûleraient le quota / le budget.
 *
 * Le compteur est persisté → partagé entre processus (serveur MCP + CLI) et
 * entre lancements. La frontière de jour suit le fuseau Pacifique pour
 * s'aligner sur la réinitialisation du quota Gemini free tier.
 */
export class UsageTracker {
  private readonly maxPerDay: number;
  private readonly reserveForPriority: number;
  private readonly timeZone: string;
  private readonly now: () => Date;
  private readonly storage: UsageStorage;

  constructor(opts: UsageTrackerOptions) {
    this.maxPerDay = opts.maxPerDay;
    this.reserveForPriority = opts.reserveForPriority ?? 0;
    this.timeZone = opts.timeZone ?? "America/Los_Angeles";
    this.now = opts.now ?? (() => new Date());
    this.storage = opts.storage ?? new FileUsageStorage();
  }

  /** État du jour courant — relit le storage à chaque appel (sûr entre processus). */
  private currentState(): UsageState {
    const today = dayKey(this.now(), this.timeZone);
    const stored = this.storage.load();
    if (!stored || stored.date !== today) {
      return { date: today, count: 0 };
    }
    return stored;
  }

  usedToday(): number {
    return this.currentState().count;
  }

  remainingToday(): number {
    return Math.max(0, this.maxPerDay - this.currentState().count);
  }

  /** Crédits encore disponibles pour l'indexation (réserve déduite, plancher 0). */
  remainingForIndexing(): number {
    return Math.max(0, this.indexingCap() - this.currentState().count);
  }

  /** Plafond applicable à l'indexation : le plafond plein moins la réserve. */
  private indexingCap(): number {
    return this.maxPerDay - this.reserveForPriority;
  }

  /**
   * Consommation d'indexation : réserve `n` requêtes sous le plafond indexation
   * (`maxPerDay − réserve`). Lève DailyCapExceededError au-delà — auquel cas RIEN
   * n'est consommé (atomique au niveau logique), laissant la réserve intacte
   * pour la recherche.
   */
  consume(n = 1): void {
    this.consumeWithCap(n, this.indexingCap());
  }

  /**
   * Consommation prioritaire (requête de recherche) : peut piocher dans la
   * réserve, donc va jusqu'au plafond plein `maxPerDay`. Parler n'est jamais
   * bloqué par l'indexation.
   */
  consumePriority(n = 1): void {
    this.consumeWithCap(n, this.maxPerDay);
  }

  /** Réserve `n` requêtes sous le plafond `cap` donné — rien si ça dépasse. */
  private consumeWithCap(n: number, cap: number): void {
    const state = this.currentState();
    if (state.count + n > cap) {
      throw new DailyCapExceededError(state.count, cap);
    }
    state.count += n;
    this.storage.save(state);
  }
}

/** Persistance par défaut : un petit JSON dans CACHE_DIR (gitignoré). */
export class FileUsageStorage implements UsageStorage {
  private readonly path: string;

  constructor(path: string = resolve(CACHE_DIR, "embed-usage.json")) {
    this.path = path;
  }

  load(): UsageState | null {
    if (!existsSync(this.path)) return null;
    try {
      const raw = readFileSync(this.path, "utf-8");
      const parsed = JSON.parse(raw) as UsageState;
      if (typeof parsed.date === "string" && typeof parsed.count === "number") {
        return parsed;
      }
      return null;
    } catch {
      return null; // fichier corrompu → on repart à zéro plutôt que de planter
    }
  }

  save(state: UsageState): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(state), "utf-8");
  }
}
