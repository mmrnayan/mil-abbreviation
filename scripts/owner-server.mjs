import { spawn } from "node:child_process";
const mode = process.argv[2] === "dev" ? "dev" : "start";
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", mode, "--hostname", "127.0.0.1", ...process.argv.slice(3)], { stdio: "inherit", env: { ...process.env, SAC_OWNER_WORKSPACE: "1", NEXT_PUBLIC_OWNER_WORKSPACE: "1" } });
child.on("exit", (code) => process.exit(code ?? 1));
