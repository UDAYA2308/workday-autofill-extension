// crypto-utils.js - Password encryption utilities
class PasswordCrypto {
    constructor() {
        this.algorithm = 'AES-GCM';
        this.keyDerivation = 'PBKDF2';
    }

    // Generate a random salt
    generateSalt() {
        return crypto.getRandomValues(new Uint8Array(16));
    }

    // Generate a random IV
    generateIV() {
        return crypto.getRandomValues(new Uint8Array(12));
    }

    // Derive key from password using PBKDF2
    async deriveKey(password, salt) {
        const encoder = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            { name: 'PBKDF2' },
            false,
            ['deriveKey']
        );

        return crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: 100000,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    // Encrypt password
    async encryptPassword(password, masterKey = null) {
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(password);

            // Use master key or generate from browser fingerprint
            const keySource = masterKey || this.getBrowserFingerprint();
            const salt = this.generateSalt();
            const iv = this.generateIV();

            const key = await this.deriveKey(keySource, salt);

            const encrypted = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                data
            );

            // Combine salt + iv + encrypted data
            const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
            combined.set(salt, 0);
            combined.set(iv, salt.length);
            combined.set(new Uint8Array(encrypted), salt.length + iv.length);

            // Convert to base64 for storage
            return btoa(String.fromCharCode.apply(null, combined));
        } catch (error) {
            console.error('Encryption failed:', error);
            throw new Error('Failed to encrypt password');
        }
    }

    // Decrypt password
    async decryptPassword(encryptedPassword, masterKey = null) {
        try {
            // Convert from base64
            const combined = new Uint8Array(
                atob(encryptedPassword).split('').map(char => char.charCodeAt(0))
            );

            // Extract salt, iv, and encrypted data
            const salt = combined.slice(0, 16);
            const iv = combined.slice(16, 28);
            const encrypted = combined.slice(28);

            // Use master key or generate from browser fingerprint
            const keySource = masterKey || this.getBrowserFingerprint();
            const key = await this.deriveKey(keySource, salt);

            const decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                encrypted
            );

            const decoder = new TextDecoder();
            return decoder.decode(decrypted);
        } catch (error) {
            console.error('Decryption failed:', error);
            throw new Error('Failed to decrypt password');
        }
    }

    // Generate browser fingerprint for key derivation
    getBrowserFingerprint() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillText('Browser fingerprint', 2, 2);

        const fingerprint = [
            navigator.userAgent,
            navigator.language,
            screen.width + 'x' + screen.height,
            new Date().getTimezoneOffset(),
            canvas.toDataURL(),
            navigator.hardwareConcurrency || 'unknown',
            navigator.deviceMemory || 'unknown'
        ].join('|');

        return fingerprint;
    }

    async test() {
        try {
            console.log('[Workday Autofill] Testing encryption...');

            const testPassword = 'test-password-123';
            const encrypted = await this.encryptPassword(testPassword);
            const decrypted = await this.decryptPassword(encrypted);

            const success = testPassword === decrypted;
            console.log('[Workday Autofill] Encryption test:', success ? 'PASSED' : 'FAILED');

            return success;
        } catch (error) {
            console.error('[Workday Autofill] Encryption test failed:', error);
            return false;
        }
    }

}

// Export for use in other files
window.PasswordCrypto = PasswordCrypto;