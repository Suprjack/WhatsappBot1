// crypto-polyfill.js
// Ce fichier fournit des implémentations de base pour les fonctions crypto utilisées par Baileys

import crypto from 'crypto';

// Exporter le module crypto pour qu'il soit disponible globalement
global.crypto = crypto;

// Fonction HKDF utilisée par Baileys
export function hkdf(buffer, expandedLength, info) {
    const hash = 'sha256';
    const salt = Buffer.alloc(32);
    
    // Étape 1: HMAC de l'entrée avec le sel
    const prk = crypto.createHmac(hash, salt).update(buffer).digest();
    
    // Étape 2: Expansion
    const infoBuff = Buffer.from(info || []);
    const result = Buffer.alloc(expandedLength);
    let prev = Buffer.alloc(0);
    let written = 0;
    
    for (let i = 1; written < expandedLength; i++) {
        const hmac = crypto.createHmac(hash, prk);
        hmac.update(Buffer.concat([prev, infoBuff, Buffer.from([i])]));
        prev = hmac.digest();
        prev.copy(result, written);
        written += prev.length;
    }
    
    return result.slice(0, expandedLength);
}

// Patch pour les autres fonctions crypto si nécessaire
export default crypto;
