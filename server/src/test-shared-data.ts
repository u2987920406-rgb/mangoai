// #138 OS d'apps — Preuve déterministe de la colonne de données partagée.
// CRUD sur le Blackboard mémoire + slugification des garde-fous. Zéro réseau/IO.
//
// Lancer :  npx tsx src/test-shared-data.ts
import { Blackboard, setBlackboard, resetBlackboard } from "./kernel-blackboard.js";
import { listDocs, getDoc, putDoc, deleteDoc, slug, collectionScope } from "./shared-data.js";

const line = (c = "─") => console.log(c.repeat(64));
let failures = 0;
const check = (label: string, cond: boolean) => {
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
  if (!cond) failures++;
};

line("═");
console.log("shared-data — colonne de données partagée (Blackboard mémoire)");
line();

// Store frais en mémoire pour un test hermétique.
setBlackboard(new Blackboard());

// 1. Collection vide au départ.
check("collection vide au départ", listDocs("tasks").length === 0);
check("getDoc absent → undefined", getDoc("tasks", "t1") === undefined);

// 2. Écriture + relecture (une app écrit, une autre lit le MÊME store).
putDoc("tasks", "t1", { title: "Acheter du pain", done: false });
putDoc("tasks", "t2", { title: "Appeler Raf", done: true });
check("listDocs voit les 2 docs", listDocs("tasks").length === 2);
check("getDoc relit la valeur", (getDoc("tasks", "t1") as { title: string }).title === "Acheter du pain");

// 3. Remplacement (PUT idempotent sur la clé).
putDoc("tasks", "t1", { title: "Acheter du pain", done: true });
check("PUT remplace en place (pas de doublon)", listDocs("tasks").length === 2);
check("valeur remplacée", (getDoc("tasks", "t1") as { done: boolean }).done === true);

// 4. Isolation entre collections (scope distinct).
putDoc("notes", "n1", { body: "hello" });
check("collection 'notes' isolée de 'tasks'", listDocs("notes").length === 1 && listDocs("tasks").length === 2);
check("scope préfixé shared:", collectionScope("tasks") === "shared:tasks");

// 5. Suppression.
check("deleteDoc renvoie true", deleteDoc("tasks", "t2") === true);
check("doc supprimé", listDocs("tasks").length === 1 && getDoc("tasks", "t2") === undefined);
check("deleteDoc d'un absent → false", deleteDoc("tasks", "zzz") === false);

// 6. Slugification (garde-fou anti-injection de scope / caractères cassants).
check("slug normalise espaces/casse", slug("Mes Tâches!!") === "mes-t-ches");
check("slug borne la longueur (64)", slug("a".repeat(200)).length === 64);
check("slug d'une clé sale reste cohérent", (() => {
  const k = putDoc("tasks", "T 1 #x", { ok: true });
  return k === "t-1-x" && getDoc("tasks", "T 1 #x") !== undefined;
})());

resetBlackboard();
line("═");
console.log(failures === 0 ? "✅ Colonne de données partagée prouvée." : `❌ ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
