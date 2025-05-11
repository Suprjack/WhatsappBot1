import fs from 'fs';
import path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

// Chemin par défaut vers le fichier de configuration
const DEFAULT_CONFIG_PATH = './configs/config-type1.json';

/**
 * Charge la configuration du bot
 * @param {string} configPath - Chemin vers le fichier de configuration (optionnel)
 * @returns {Object} - Configuration chargée
 */
export function loadBotConfig(configPath = null) {
    try {
        // Utiliser le chemin spécifié, ou celui de la variable d'environnement, ou le chemin par défaut
        const configFile = configPath || process.env.BOT_CONFIG_PATH || DEFAULT_CONFIG_PATH;
        
        console.log(`Chargement de la configuration depuis: ${configFile}`);
        
        // Vérifier si le fichier existe
        if (!fs.existsSync(configFile)) {
            console.warn(`Fichier de configuration ${configFile} non trouvé, utilisation des valeurs par défaut`);
            return getDefaultConfig();
        }
        
        // Lire et parser le fichier de configuration
        const configData = fs.readFileSync(configFile, 'utf8');
        const config = JSON.parse(configData);
        
        // Fusionner avec les variables d'environnement (priorité aux variables d'environnement)
        const mergedConfig = {
            ...config,
            botName: process.env.BOT_NAME || config.botName,
            responseDelay: process.env.BOT_RESPONSE_DELAY ? parseInt(process.env.BOT_RESPONSE_DELAY) : config.responseDelay,
        };
        
        console.log('Configuration chargée avec succès');
        return mergedConfig;
    } catch (error) {
        console.error('Erreur lors du chargement de la configuration:', error);
        return getDefaultConfig();
    }
}

/**
 * Retourne la configuration par défaut
 * @returns {Object} - Configuration par défaut
 */
function getDefaultConfig() {
    return {
        botName: process.env.BOT_NAME || "Teepana's Alter Ego",
        responseDelay: process.env.BOT_RESPONSE_DELAY ? parseInt(process.env.BOT_RESPONSE_DELAY) : 300000,
        defaultLanguage: "fr",
        defaultTone: "standard",
        defaultRelation: "Inconnu",
        promptTemplate: {
            system: "Tu es l'assistant WhatsApp. Parle en français, 1 phrase max 40 mots.",
            style: {
                friendly: "Ton décontracté, drôle, émojis permis.",
                formal: "Ton formel, poli, sans émoji (sauf \"🙂\")."
            },
            availability: "Je ne suis pas disponible mais je peux gérer ta demande.",
            objective: "Demande en UNE question le but précis de l'appel."
        },
        contactDefaults: {
            name: "Contact",
            relation: "Inconnu",
            lang: "fr",
            tone: "standard",
            history: [],
            first_seen: 0,
            last_seen: 0
        }
    };
}

export default {
    loadBotConfig
};
