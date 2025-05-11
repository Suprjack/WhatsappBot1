import fs from 'fs';
import path from 'path';

// Chemin vers le fichier contacts.json
const CONTACTS_FILE = path.join(process.cwd(), 'contacts.json');

// Cache des contacts
let contactsCache = null;
let lastLoadTime = 0;

/**
 * Charge les profils des contacts depuis le fichier JSON
 * @param {boolean} forceReload - Force le rechargement même si le cache existe
 * @returns {Object} - Les profils des contacts
 */
export function loadContacts(forceReload = false) {
    const currentTime = Date.now();

    // Recharger le fichier si le cache est vide, si forceReload est true, ou si le cache a plus de 5 minutes
    if (!contactsCache || forceReload || (currentTime - lastLoadTime > 5 * 60 * 1000)) {
        try {
            if (fs.existsSync(CONTACTS_FILE)) {
                const data = fs.readFileSync(CONTACTS_FILE, 'utf8');
                contactsCache = JSON.parse(data);
                lastLoadTime = currentTime;
                console.log('Profils de contacts chargés avec succès');
            } else {
                console.warn('Fichier contacts.json non trouvé, utilisation des profils par défaut');
                contactsCache = {
                    "default": {
                        "name": "Contact",
                        "lang": "fr",
                        "tone": "standard",
                        "priority": "normale",
                        "topics": [],
                        "intro": "Bonjour ! Teepana n'est pas disponible pour le moment."
                    }
                };
            }
        } catch (error) {
            console.error('Erreur lors du chargement des profils de contacts:', error);
            contactsCache = {
                "default": {
                    "name": "Contact",
                    "lang": "fr",
                    "tone": "standard",
                    "priority": "normale",
                    "topics": [],
                    "intro": "Bonjour ! Teepana n'est pas disponible pour le moment."
                }
            };
        }
    }

    return contactsCache;
}

/**
 * Obtient le profil d'un contact spécifique
 * @param {string} contactId - L'ID du contact (numéro WhatsApp)
 * @returns {Object} - Le profil du contact ou le profil par défaut
 */
export function getContactProfile(contactId) {
    const contacts = loadContacts();

    // Nettoyer l'ID du contact pour la recherche (enlever les caractères spéciaux si nécessaire)
    const cleanContactId = contactId.trim();

    // Retourner le profil du contact s'il existe, sinon le profil par défaut
    return contacts[cleanContactId] || contacts["default"];
}

/**
 * Sauvegarde un profil de contact
 * @param {string} contactId - L'ID du contact
 * @param {Object} profile - Le profil à sauvegarder
 * @returns {boolean} - Succès ou échec
 */
export function saveContactProfile(contactId, profile) {
    try {
        const contacts = loadContacts();

        // Mettre à jour ou ajouter le profil
        contacts[contactId] = profile;

        // Sauvegarder dans le fichier
        fs.writeFileSync(CONTACTS_FILE, JSON.stringify(contacts, null, 2), 'utf8');

        // Mettre à jour le cache
        contactsCache = contacts;
        lastLoadTime = Date.now();

        console.log(`Profil du contact ${contactId} sauvegardé avec succès`);
        return true;
    } catch (error) {
        console.error('Erreur lors de la sauvegarde du profil de contact:', error);
        return false;
    }
}

/**
 * Crée automatiquement un profil de base pour un nouveau contact
 * @param {string} contactId - L'ID du contact
 * @param {string} [name=null] - Le nom du contact (optionnel)
 * @returns {Object} - Le profil créé
 */
export function createDefaultProfile(contactId, name = null) {
    try {
        const contacts = loadContacts();

        // Vérifier si le contact existe déjà
        if (contacts[contactId]) {
            console.log(`Le profil pour ${contactId} existe déjà`);
            return contacts[contactId];
        }

        // Extraire le numéro de téléphone de l'ID pour l'utiliser comme nom par défaut
        const phoneNumber = contactId.split('@')[0];
        const displayName = name || phoneNumber;
        const timestamp = Date.now();

        // Créer un profil par défaut avec la nouvelle structure
        const newProfile = {
            "name": displayName,
            "phone": phoneNumber,  // Ajout explicite du numéro de téléphone
            "relation": "Inconnu",
            "lang": "fr",
            "tone": "standard",
            "history": [],
            "first_seen": timestamp,
            "last_seen": timestamp
        };

        // Sauvegarder le nouveau profil
        contacts[contactId] = newProfile;
        fs.writeFileSync(CONTACTS_FILE, JSON.stringify(contacts, null, 2), 'utf8');

        // Mettre à jour le cache
        contactsCache = contacts;
        lastLoadTime = Date.now();

        console.log(`Nouveau profil créé automatiquement pour ${contactId}`);
        return newProfile;
    } catch (error) {
        console.error('Erreur lors de la création du profil par défaut:', error);
        return contacts["default"];
    }
}

/**
 * Met à jour le profil d'un contact avec un nouveau message
 * @param {string} contactId - L'ID du contact
 * @param {string} messageBody - Le contenu du message
 * @param {number} [timestamp=null] - Horodatage du message (optionnel)
 * @returns {Object} - Le profil mis à jour
 */
export function updateProfile(contactId, messageBody, timestamp = null) {
    try {
        const contacts = loadContacts();
        const currentTime = timestamp || Date.now();

        // Si le contact n'existe pas, créer un nouveau profil
        if (!contacts[contactId]) {
            return createDefaultProfile(contactId);
        }

        // S'assurer que le champ phone est présent (pour les profils créés avant cette mise à jour)
        if (!contacts[contactId].phone) {
            contacts[contactId].phone = contactId.split('@')[0];
        }

        // Mettre à jour l'historique des messages
        if (!contacts[contactId].history) {
            contacts[contactId].history = [];
        }

        // Ajouter le message à l'historique (limiter à 10 messages pour éviter une croissance excessive)
        contacts[contactId].history.unshift({
            body: messageBody,
            ts: currentTime
        });

        // Limiter l'historique à 10 messages
        if (contacts[contactId].history.length > 10) {
            contacts[contactId].history = contacts[contactId].history.slice(0, 10);
        }

        // Mettre à jour last_seen
        contacts[contactId].last_seen = currentTime;

        // Sauvegarder les modifications
        fs.writeFileSync(CONTACTS_FILE, JSON.stringify(contacts, null, 2), 'utf8');

        // Mettre à jour le cache
        contactsCache = contacts;
        lastLoadTime = Date.now();

        console.log(`Profil de ${contactId} mis à jour avec le nouveau message`);
        return contacts[contactId];
    } catch (error) {
        console.error('Erreur lors de la mise à jour du profil:', error);
        return null;
    }
}

export default {
    loadContacts,
    getContactProfile,
    saveContactProfile,
    createDefaultProfile,
    updateProfile
};
