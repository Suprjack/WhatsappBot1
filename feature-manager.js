/**
 * Gestionnaire de fonctionnalités pour le bot WhatsApp
 * Permet de vérifier si une fonctionnalité est activée dans la configuration
 */

/**
 * Vérifie si une fonctionnalité est activée
 * @param {Object} config - Configuration du bot
 * @param {string} featureName - Nom de la fonctionnalité à vérifier
 * @returns {boolean} - true si la fonctionnalité est activée, false sinon
 */
export function isFeatureEnabled(config, featureName) {
    // Si la configuration n'a pas de section features, retourner false
    if (!config || !config.features) {
        return false;
    }
    
    // Vérifier si la fonctionnalité est activée
    return config.features[featureName] === true;
}

/**
 * Vérifie si le bot est en horaires d'ouverture
 * @param {Object} config - Configuration du bot
 * @returns {boolean} - true si le bot est en horaires d'ouverture, false sinon
 */
export function isWithinBusinessHours(config) {
    // Si la fonctionnalité n'est pas activée, toujours retourner true (disponible 24/7)
    if (!isFeatureEnabled(config, 'businessHours') || !config.businessHours || !config.businessHours.enabled) {
        return true;
    }
    
    // Obtenir la date et l'heure actuelles dans le fuseau horaire configuré
    const now = new Date();
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const currentDay = days[now.getDay()];
    
    // Vérifier si le jour actuel a des horaires configurés
    const dayConfig = config.businessHours[currentDay];
    if (!dayConfig) {
        return false; // Jour non ouvré
    }
    
    // Extraire les heures et minutes de début et de fin
    const [startHour, startMinute] = dayConfig.start.split(':').map(Number);
    const [endHour, endMinute] = dayConfig.end.split(':').map(Number);
    
    // Calculer les minutes depuis minuit pour la comparaison
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;
    
    // Vérifier si l'heure actuelle est dans la plage d'horaires d'ouverture
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

/**
 * Vérifie si le bot peut traiter des médias
 * @param {Object} config - Configuration du bot
 * @returns {boolean} - true si le bot peut traiter des médias, false sinon
 */
export function canHandleMedia(config) {
    return isFeatureEnabled(config, 'mediaHandling');
}

/**
 * Vérifie si le bot peut traiter des messages de groupe
 * @param {Object} config - Configuration du bot
 * @returns {boolean} - true si le bot peut traiter des messages de groupe, false sinon
 */
export function canHandleGroupChat(config) {
    return isFeatureEnabled(config, 'groupChat');
}

/**
 * Vérifie si le bot doit envoyer des webhooks
 * @param {Object} config - Configuration du bot
 * @param {string} eventType - Type d'événement (message, status, contact)
 * @returns {boolean} - true si le bot doit envoyer des webhooks, false sinon
 */
export function shouldSendWebhook(config, eventType) {
    if (!isFeatureEnabled(config, 'webhooks') || !config.webhookConfig || !config.webhookConfig.enabled) {
        return false;
    }
    
    // Vérifier si le type d'événement est dans la liste des événements configurés
    return config.webhookConfig.events.includes(eventType);
}

export default {
    isFeatureEnabled,
    isWithinBusinessHours,
    canHandleMedia,
    canHandleGroupChat,
    shouldSendWebhook
};
