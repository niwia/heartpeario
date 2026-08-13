// ── Client-side AES-GCM 256-bit Web Crypto Service ──────────────────────────

const SALT_KEY = 'heartpeario_vault_salt';
const DEVICE_KEY_ID = 'heartpeario_device_secret';

// Get or initialize device-local cryptographic salt and key material
function getDeviceSalt() {
  let saltStr = localStorage.getItem(SALT_KEY);
  if (!saltStr) {
    const saltBytes = crypto.getRandomValues(new Uint8Array(16));
    saltStr = Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(SALT_KEY, saltStr);
  }
  return new Uint8Array(saltStr.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
}

function getDeviceSecret() {
  let secret = localStorage.getItem(DEVICE_KEY_ID);
  if (!secret) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    secret = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(DEVICE_KEY_ID, secret);
  }
  return secret;
}

// Derive a 256-bit AES-GCM CryptoKey using PBKDF2
async function deriveKey(passphrase) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase || getDeviceSecret()),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: getDeviceSalt(),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt a JavaScript object / string into a Base64-encoded encrypted payload
 * @param {any} data
 * @param {string} [passphrase]
 * @returns {Promise<string>}
 */
export async function encryptData(data, passphrase = '') {
  try {
    const key = await deriveKey(passphrase);
    const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for AES-GCM
    const jsonStr = JSON.stringify(data);
    const encoded = new TextEncoder().encode(jsonStr);

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoded
    );

    // Combine IV + ciphertext
    const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.byteLength);

    // Convert to base64
    let binary = '';
    for (let i = 0; i < combined.byteLength; i++) {
      binary += String.fromCharCode(combined[i]);
    }
    return btoa(binary);
  } catch (err) {
    console.error('[Crypto] Encryption error:', err);
    throw new Error('Failed to encrypt profile data');
  }
}

/**
 * Decrypt a Base64-encoded AES-GCM payload back into JavaScript data
 * @param {string} base64Payload
 * @param {string} [passphrase]
 * @returns {Promise<any>}
 */
export async function decryptData(base64Payload, passphrase = '') {
  if (!base64Payload) return null;
  try {
    const key = await deriveKey(passphrase);
    const binary = atob(base64Payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const iv = bytes.slice(0, 12);
    const ciphertext = bytes.slice(12);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    const decoded = new TextDecoder().decode(decrypted);
    return JSON.parse(decoded);
  } catch (err) {
    console.warn('[Crypto] Decryption failed or invalid key:', err);
    return null;
  }
}
