const { safeStorage } = require('electron');
const Store = require('electron-store');

const store = new Store({
  defaults: {
    hunger: 100,
    water: 100,
    mood: 100,
    energy: 100,
    apiKeyEncrypted: '',
    apiKey: ''
  }
});

function getState() {
  return {
    hunger: store.get('hunger'),
    water:  store.get('water'),
    mood:   store.get('mood'),
    energy: store.get('energy')
  };
}

function setState(key, value) {
  const clamped = Math.max(0, Math.min(100, Number(value)));
  store.set(key, clamped);
}

function getApiKey() {
  const encrypted = store.get('apiKeyEncrypted', '');
  if (encrypted && safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
    } catch (err) {
      console.error('Failed to decrypt API key:', err.message);
    }
  }

  const legacyPlaintextKey = store.get('apiKey', '');
  if (legacyPlaintextKey) {
    setApiKey(legacyPlaintextKey);
    store.delete('apiKey');
    return legacyPlaintextKey;
  }

  return process.env.ANTHROPIC_API_KEY || '';
}

function setApiKey(key) {
  const value = key || '';
  store.delete('apiKey');

  if (!value) {
    store.set('apiKeyEncrypted', '');
    return;
  }

  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('System credential encryption is not available on this device.');
  }

  store.set('apiKeyEncrypted', safeStorage.encryptString(value).toString('base64'));
}

module.exports = { getState, setState, getApiKey, setApiKey };
