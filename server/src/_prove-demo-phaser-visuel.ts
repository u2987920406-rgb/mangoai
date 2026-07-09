import "dotenv/config";
import { createProject } from "./projects.js";

const dir = await createProject("demo-phaser-startrek", "phaser");
console.log("OK", dir);
