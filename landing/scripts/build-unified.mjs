// Vercel build for the "brickmyghoul" project: builds the landing (this Astro app) at
// `/`, then builds the actual tool (the Vite app at the repo root) and nests its static
// output at `/build/`, so both live in one deployment on one domain. Runs with cwd = landing/
// (Vercel's Root Directory for this project).
import { execSync } from 'node:child_process';
import { cpSync, rmSync } from 'node:fs';

const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' });

// 1. Landing (this Astro app) -> landing/dist/
run('astro build', '.');

// 2. The tool (Vite app at the repo root) -> ../dist/
run('npm ci', '..');
run('npm run build', '..');

// 3. Nest the tool's build under the landing's output, at /build/
rmSync('dist/build', { recursive: true, force: true });
cpSync('../dist', 'dist/build', { recursive: true });
