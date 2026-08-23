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

console.log('🧹 1. Cleaning dist and previous release artifacts...');
fs.rmSync(distDir, { recursive: true, force: true });
if (fs.existsSync(zipPath)) fs.rmSync(zipPath);

console.log('🔍 2. Running TypeScript Typecheck (tsc --noEmit)...');
try {
    execSync('npx tsc --noEmit', { stdio: 'inherit', cwd: rootDir });
    console.log('✅ TypeScript typecheck passed with zero errors.');
} catch (error) {
    console.error('❌ TypeScript typecheck failed.');
    process.exit(1);
}

console.log('🧪 3. Running Vitest Test Suite (vitest run)...');
try {
    execSync('npx vitest run', { stdio: 'inherit', cwd: rootDir });
    console.log('✅ All test suites passed.');
} catch (error) {
    console.error('❌ Vitest test execution failed.');
    process.exit(1);
}

console.log('🏗️  4. Building for production (vite build)...');
try {
    execSync('npx vite build --mode production', { stdio: 'inherit', cwd: rootDir });
    console.log('✅ Vite production build succeeded.');
} catch (error) {
    console.error('❌ Build failed.');
    process.exit(1);
}

console.log('🛡️  5. Validating build bundle sanitization & security...');
const forbiddenFileExtensions = ['.map', '.md', '.ts', '.tsx'];
const forbiddenPatterns = [
    /https?:\/\/localhost/i,
    /ws:\/\/localhost/i,
    /http:\/\/127\.0\.0\.1/i,
    /ws:\/\/127\.0\.0\.1/i,
];

function scanDirectory(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const relPath = path.relative(distDir, fullPath);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            scanDirectory(fullPath);
        } else {
            const ext = path.extname(file).toLowerCase();

            // 1. Check for forbidden file types in production bundle
            if (forbiddenFileExtensions.includes(ext)) {
                console.error(`\n❌ SECURITY AUDIT FAILED: Forbidden file type (${ext}) found in bundle: ${relPath}`);
                abortRelease();
            }

            // 2. Check for mock or test files
            if (/(test|spec|mock|fake-indexeddb)/i.test(file)) {
                console.error(`\n❌ SECURITY AUDIT FAILED: Test artifact or mock found in bundle: ${relPath}`);
                abortRelease();
            }

            // 3. Scan code and text files for accidental dev endpoints
            if (/\.(js|mjs|html|css|json)$/i.test(file)) {
                const content = fs.readFileSync(fullPath, 'utf8');
                for (const pattern of forbiddenPatterns) {
                    if (pattern.test(content)) {
                        console.error(`\n❌ SECURITY AUDIT FAILED: Found accidental dev endpoint matching ${pattern} in ${relPath}`);
                        abortRelease();
                    }
                }
            }
        }
    }
}

function abortRelease() {
    console.log('🗑️  Deleting polluted dist directory to prevent accidental upload...');
    fs.rmSync(distDir, { recursive: true, force: true });
    process.exit(1);
}

scanDirectory(distDir);

// Validate manifest.json exists and contains mandatory fields
const manifestPath = path.join(distDir, 'manifest.json');
if (!fs.existsSync(manifestPath)) {
    console.error('\n❌ VALIDATION FAILED: manifest.json is missing in dist directory.');
    abortRelease();
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.manifest_version !== 3) {
    console.error('\n❌ VALIDATION FAILED: Manifest version must be 3.');
    abortRelease();
}
if (!manifest.minimum_chrome_version) {
    console.error('\n❌ VALIDATION FAILED: minimum_chrome_version must be defined in manifest.');
    abortRelease();
}
if (!manifest.icons || !manifest.icons['16'] || !manifest.icons['32'] || !manifest.icons['48'] || !manifest.icons['128']) {
    console.error('\n❌ VALIDATION FAILED: Missing icon references (16, 32, 48, 128) in manifest.');
    abortRelease();
}

console.log('✅ Sanitization & security validation passed.');

console.log(`📦 6. Zipping production bundle to ${zipName}...`);
try {
    // Windows Native Archiving via PowerShell
    const psCommand = `Import-Module Microsoft.PowerShell.Archive; Compress-Archive -Path '${distDir}\\*' -DestinationPath '${zipPath}' -Force`;
    execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psCommand}"`, { stdio: 'inherit', cwd: rootDir });
    console.log(`\n🎉 Successfully created production release archive: ${zipName}`);
} catch (error) {
    console.error('❌ Zipping failed.');
    process.exit(1);
}
