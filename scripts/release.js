import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

const pkgPath = path.join(rootDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const version = pkg.version;
const zipName = `tabbellus-v${version}.zip`;
const zipPath = path.join(rootDir, zipName);

console.log('🧹 1. Cleaning dist folder...');
fs.rmSync(distDir, { recursive: true, force: true });
if (fs.existsSync(zipPath)) fs.rmSync(zipPath);

console.log('🏗️  2. Building for production...');
try {
    execSync('npx tsc && npx vite build --mode production', { stdio: 'inherit', cwd: rootDir });
} catch (error) {
    console.error('❌ Build failed.');
    process.exit(1);
}

console.log('🔍 3. Validating build (Scanning for "localhost")...');
function scanDirectory(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            scanDirectory(fullPath);
        } else {
            // Only scan likely text or code files
            if (/\.(js|mjs|html|css|json|txt|md)$/i.test(file)) {
                // Specifically look for hardcoded protocol + localhost which indicates an accidental dev endpoint
                const content = fs.readFileSync(fullPath, 'utf8');
                if (/https?:\/\/localhost|ws:\/\/localhost/i.test(content)) {
                    console.error(`\n❌ VALIDATION FAILED: Found accidental localhost endpoint in ${fullPath}`);
                    console.log('🗑️  Deleting polluted dist directory to prevent accidental upload...');
                    fs.rmSync(distDir, { recursive: true, force: true });
                    process.exit(1);
                }
            }
        }
    }
}

scanDirectory(distDir);
console.log('✅ Validation passed. No "localhost" found.');

console.log(`📦 4. Zipping to ${zipName}...`);
try {
    // Windows Native Archiving via PowerShell
    const psCommand = `Import-Module Microsoft.PowerShell.Archive; Compress-Archive -Path '${distDir}\\*' -DestinationPath '${zipPath}' -Force`;
    execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psCommand}"`, { stdio: 'inherit', cwd: rootDir });
    console.log(`\n🎉 Successfully created: ${zipName}`);
} catch (error) {
    console.error('❌ Zipping failed.');
    process.exit(1);
}
