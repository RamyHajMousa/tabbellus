# ADR-005: End-to-End Encryption (E2EE) Sync Vault

- **Status:** Accepted
- **Date:** 2026-09-28
- **Deciders:** TabBellus Core Team

## Context

When users synchronize their workspaces and tab collections to Google Drive, sensitive information (URLs containing query tokens, internal workplace spaces, research links) is stored in the cloud. Even though files in `appDataFolder` are restricted to the extension, users require cryptographic assurance that their data cannot be inspected in transit or at rest.

Key security requirements:
1. Pure client-side encryption where neither Google nor third parties can read the data.
2. Resistance to brute-force attacks on user passphrases.
3. Ephemeral key management ensuring encryption keys are never written to unencrypted persistent storage.
4. Seamless multi-device synchronization transitions, including locked-state handling on new devices and peer downgrade when encryption is disabled.

## Decision

We implemented a **Pure WebCrypto End-to-End Encryption (E2EE) Vault** with **PBKDF2 Key Derivation, AES-GCM 256-bit Encryption, and Ephemeral Session Storage**:

1. **Standardized Cryptographic Primitives:**
   Leverages the native browser Web Cryptography API (`crypto.subtle`). Keys are derived from user passphrases using PBKDF2 with SHA-256 and 600,000 iterations (exceeding OWASP password hashing standards). Data is encrypted using AES-GCM with 256-bit keys, a fresh 12-byte random initialization vector (IV) per encryption cycle, and a 16-byte random salt.
2. **Strict Ephemeral Key Lifecycle:**
   The raw passphrase and derived `CryptoKey` are strictly forbidden from being written to persistent storage (`chrome.storage.local`, IndexedDB, or disk). Keys are held in memory and backed by `chrome.storage.session` under key `tabbellus_vault_session`. When the browser closes or the user clicks "Lock Vault", the session key is wiped immediately.
3. **Locked State Synchronization Safety:**
   When a device downloads a remote vault envelope marked `isEncrypted: true` without having an active session key, the sync engine pauses background flushes and transitions to the `locked` state. Local Dexie records remain intact and are never overwritten with encrypted ciphertext.
4. **Peer Downgrade & Recovery:**
   When a user disables encryption on one device, the cloud vault is replaced with an unencrypted snapshot (`isEncrypted: false`). When peer devices subsequently sync, they detect the downgrade flag, wipe their local session key, and return to standard unencrypted sync without data corruption.

## Key Mechanisms & Code Citations

- **WebCrypto Engine (`src/pro/sync/crypto/webCrypto.ts`):**
  - Key derivation: `deriveKey(passphrase, salt)` using PBKDF2-SHA-256 (600,000 iterations) to produce an exportable `AES-GCM` 256-bit key.
  - Encryption: `encryptSnapshot(payload, key)` generates a 12-byte IV, computes AES-GCM ciphertext with authentication tag, and packages into `EncryptedVaultEnvelope`.
  - Decryption: `decryptSnapshot(envelope, key)` validates ciphertext integrity; throws specific `CryptoEngineError` codes (`INVALID_PASSPHRASE`, `CORRUPTED_PAYLOAD`) on tampering or mismatch.
- **Session Key Store (`src/pro/sync/crypto/keyStore.ts`):**
  - Manages `chrome.storage.session` caching (`tabbellus_vault_session`).
  - Implements `setKey`, `getKey`, and `clearKey`.
- **Sync Engine State Machine (`src/pro/sync/engine/syncEngine.ts`):**
  - Detects encrypted remote snapshots in step 4 of `syncNow`.
  - Transitions to `locked` state if `!hasKey()`, surfacing unlock prompts via `useSyncStatus`.
  - Executes `unlockVault(passphrase)`: derives key, verifies against remote envelope, and completes pending reconciliation upon success.
  - Handles peer auto-downgrade when discovering `remoteVault.isEncrypted === false`.

## Consequences & Invariants

- **Zero Passphrase Persistence:** Passphrases are never saved. If a user loses their passphrase and has no unlocked active device, encrypted cloud backups cannot be recovered.
- **Tamper Evidence:** AES-GCM authentication tags guarantee that any unauthorized byte modification in Google Drive is rejected before local ingestion.
- **Session Isolation:** Restarting the browser automatically locks the vault, requiring re-entry of the passphrase to resume cloud synchronization.
