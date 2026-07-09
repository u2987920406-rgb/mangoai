import "dotenv/config";
import { createProject } from "../src/projects.js";

const dir = await createProject("demo-phaser-startrek", "phaser");
console.log("OK", dir);
