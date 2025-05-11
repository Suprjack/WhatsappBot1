#!/usr/bin/env node
// Importer le polyfill crypto avant Baileys
import './crypto-polyfill.js';
import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import fetch from 'node-fetch';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import {
    getDatabase,
    saveMessage,
    saveResponse,
    hasResponse,
    getUnansweredMessages
} from './database.js';
import { getContactProfile, createDefaultProfile, updateProfile, saveContactProfile } from './contact-manager.js';
import { loadBotConfig } from './config-loader.js';
import {
    isFeatureEnabled,
    isWithinBusinessHours,
    canHandleMedia,
    canHandleGroupChat,
    shouldSendWebhook
} from './feature-manager.js';

dotenv.config();

// Charger la configuration
const CONFIG = loadBotConfig();

// Configuration
const BOT_NAME = CONFIG.botName;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyC8TDu5NBrmk0NNJlhRAlrNYvJ6jwXyU-8';
const AUTH_FOLDER = './auth_baileys';
const BOT_RESPONSE_DELAY = CONFIG.responseDelay; // Délai de réponse en millisecondes
const LAST_RESPONSE_TIME = {};

// Créer le dossier d'authentification s'il n'existe pas
if (!fs.existsSync(AUTH_FOLDER)) {
    fs.mkdirSync(AUTH_FOLDER, { recursive: true });
}

// Fonction pour générer une réponse avec l'API Gemini
async function generateGeminiResponse(prompt) {
    try {
        console.log('Envoi du prompt à Gemini...');

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: prompt }]
                }]
            })
        });

        const data = await response.json();

        if (data.candidates && data.candidates[0] && data.candidates[0].content) {
            const generatedText = data.candidates[0].content.parts[0].text;
            console.log('Réponse générée avec succès');
            return generatedText;
        } else {
            console.error('Réponse Gemini inattendue', data);
            return "Je n'ai pas pu générer une réponse appropriée. Pouvez-vous reformuler votre message ?";
        }
    } catch (error) {
        console.error('Erreur lors de l\'appel à l\'API Gemini:', error);
        return "Désolé, j'ai rencontré une erreur en traitant votre message. Pouvez-vous réessayer ?";
    }
}

// Fonction pour créer un prompt pour Gemini
function createPrompt(message, contactId = null, isFromMe = false) {
    // Si c'est un message de Teepana elle-même
    if (isFromMe) {
        return `Tu es ${BOT_NAME}, l'assistant WhatsApp intelligent de Teepana. Tu dois répondre à un message de Teepana elle-même.

INFORMATIONS SUR TEEPANA:
- DJ professionnel qui propose des sets personnalisés pour événements
- Compositeur de chansons personnalisées pour occasions spéciales
- Développeur de solutions IA pour automatiser des tâches

Message reçu de Teepana: "${message}"

INSTRUCTIONS:
1. Réponds comme si tu étais un assistant intelligent avec une personnalité fun et décalée
2. Utilise un ton amical et décontracté avec une touche d'humour
3. Utilise des emojis avec modération
4. Garde ta réponse concise (max 3-4 phrases)
5. Ne mentionne jamais que tu es une IA ou un bot

Ta réponse (seulement la réponse, pas d'explications):`;
    }
    // Si c'est un message d'un contact
    else {
        // Obtenir le profil du contact
        const profile = contactId ? getContactProfile(contactId) : getContactProfile("default");

        // Déterminer le style en fonction de la relation
        const relationAmicale = ["ami", "famille", "délire", "copine"].includes(profile.relation);
        const styleSection = relationAmicale
            ? CONFIG.promptTemplate.style.friendly
            : CONFIG.promptTemplate.style.formal;

        // Déterminer si on peut proposer un rendez-vous
        const peutProposerRDV = profile.relation !== "Inconnu";

        // Obtenir le dernier message
        const lastMsg = message;

        // Construire le prompt avec le template de la configuration
        return `[SYSTEM] ${CONFIG.promptTemplate.system}

[CONTACT] - INFORMATIONS CONFIDENTIELLES - NE JAMAIS MENTIONNER CES DONNÉES DANS TES RÉPONSES
Nom: ${profile.name}
Téléphone: ${profile.phone} - CONFIDENTIEL, NE JAMAIS MENTIONNER CE NUMÉRO
Relation: ${profile.relation}

[STYLE]
${styleSection}

[DISPO] ${CONFIG.promptTemplate.availability}

[OBJECTIF] ${CONFIG.promptTemplate.objective}
${peutProposerRDV ? "" : "Ne propose jamais de rendez-vous si relation = \"Inconnu\"."}

[RÈGLES DE CONFIDENTIALITÉ]
- Ne JAMAIS mentionner ou faire référence au numéro de téléphone du contact
- Ne JAMAIS partager d'informations personnelles sur Teepana ou le contact
- Ne JAMAIS indiquer que tu as accès à ces informations confidentielles

[MSG] "${lastMsg}"

Ta réponse (seulement la réponse, pas d'explications):`;
    }
}

// Fonction pour traiter les messages en attente
async function processUnansweredMessages(sock) {
    try {
        // Vérifier si la connexion est active
        if (!sock || !sock.user) {
            console.log('Connexion WhatsApp non disponible, traitement des messages en attente ignoré');
            return;
        }

        // Vérifier si la fonctionnalité de réponse automatique est activée
        if (!isFeatureEnabled(CONFIG, 'autoResponder')) {
            console.log('Traitement des messages en attente ignoré (fonctionnalité non activée)');
            return;
        }

        // Vérifier si le bot est en horaires d'ouverture
        if (isFeatureEnabled(CONFIG, 'businessHours') && !isWithinBusinessHours(CONFIG)) {
            console.log('Traitement des messages en attente ignoré (en dehors des horaires d\'ouverture)');
            return;
        }

        // Récupérer les messages sans réponse plus anciens que le délai configuré
        const unansweredMessages = await getUnansweredMessages(BOT_RESPONSE_DELAY);

        if (unansweredMessages.length === 0) {
            return; // Pas de messages à traiter
        }

        console.log(`Traitement de ${unansweredMessages.length} messages en attente`);

        for (const message of unansweredMessages) {
            try {
                // Vérifier si le message a déjà reçu une réponse entre-temps
                if (await hasResponse(message.id)) {
                    continue;
                }

                // Vérifier si c'est un message de groupe et si le bot peut y répondre
                const isGroupMessage = message.remoteJid.endsWith('@g.us');
                if (isGroupMessage && !canHandleGroupChat(CONFIG)) {
                    console.log('Message de groupe ignoré (fonctionnalité non activée)');
                    continue;
                }

                console.log(`Traitement du message en attente: ${message.content}`);
                console.log(`De: ${message.remoteJid}`);

                // Vérifier si la connexion est toujours active
                if (!sock.user) {
                    console.log('Connexion WhatsApp perdue pendant le traitement, abandon');
                    return;
                }

                // Créer le prompt pour Gemini avec l'ID du contact
                const prompt = createPrompt(message.content, message.remoteJid, false);

                // Générer une réponse
                let response;
                try {
                    response = await generateGeminiResponse(prompt);
                    console.log(`Réponse générée (après délai): ${response}`);
                } catch (geminiError) {
                    console.error('Erreur lors de la génération de la réponse Gemini:', geminiError);
                    response = "Je n'ai pas pu générer une réponse appropriée. Pouvez-vous reformuler votre message ?";
                }

                // Vérifier à nouveau si la connexion est toujours active
                if (!sock.user) {
                    console.log('Connexion WhatsApp perdue après génération de réponse, abandon');
                    return;
                }

                // Envoyer la réponse
                try {
                    const sentMessage = await sock.sendMessage(message.remoteJid, { text: response });

                    // Enregistrer la réponse dans la base de données
                    await saveResponse(message.id, sentMessage);
                    console.log(`Réponse envoyée avec succès à ${message.remoteJid}`);

                    // Envoyer un webhook si la fonctionnalité est activée
                    if (shouldSendWebhook(CONFIG, 'message')) {
                        console.log('Envoi d\'un webhook pour la réponse envoyée');
                        // Implémentation de l'envoi du webhook à faire
                    }
                } catch (sendError) {
                    console.error(`Erreur lors de l'envoi du message: ${sendError.message}`);

                    // Si l'erreur est liée à une session manquante, essayer de reconnecter
                    if (sendError.message.includes('No sessions') || sendError.name === 'SessionError') {
                        console.log('Erreur de session détectée, marquage du message comme traité');
                        // Marquer ce message comme traité pour éviter de le réessayer en boucle
                        await saveResponse(message.id, { key: { id: 'session-error-' + Date.now() } });
                    }
                }

                // Attendre un court délai entre chaque message pour éviter les problèmes de rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (messageError) {
                console.error(`Erreur lors du traitement du message ${message.id}:`, messageError);
                // Continuer avec le message suivant
            }
        }
    } catch (error) {
        console.error('Erreur générale lors du traitement des messages en attente:', error);
    }
}

// Fonction pour gérer les erreurs de session
async function handleSessionError(error) {
    console.error('Erreur de session détectée:', error);

    // Vérifier si l'erreur est liée à une session expirée ou invalide
    if (error.message.includes('No sessions') ||
        error.name === 'SessionError' ||
        error.message.includes('bad decrypt') ||
        error.message.includes('invalid key')) {

        console.log('Tentative de réparation de la session...');

        try {
            // Vérifier si le dossier d'authentification existe
            if (fs.existsSync(AUTH_FOLDER)) {
                const sessionFiles = fs.readdirSync(AUTH_FOLDER);

                // Sauvegarder les fichiers de session actuels
                const backupFolder = `${AUTH_FOLDER}_backup_${Date.now()}`;
                fs.mkdirSync(backupFolder, { recursive: true });

                for (const file of sessionFiles) {
                    fs.copyFileSync(
                        path.join(AUTH_FOLDER, file),
                        path.join(backupFolder, file)
                    );
                }

                console.log(`Session sauvegardée dans ${backupFolder}`);

                // Supprimer les fichiers de session problématiques
                // Note: Nous ne supprimons pas tous les fichiers pour préserver l'ID de l'appareil
                const problematicFiles = sessionFiles.filter(file =>
                    file.includes('session') ||
                    file.includes('app-state') ||
                    file.includes('pre-key')
                );

                for (const file of problematicFiles) {
                    fs.unlinkSync(path.join(AUTH_FOLDER, file));
                    console.log(`Fichier de session supprimé: ${file}`);
                }

                console.log('Fichiers de session problématiques supprimés, redémarrage du bot...');
                return true; // Indiquer qu'une reconnexion est nécessaire
            }
        } catch (repairError) {
            console.error('Erreur lors de la tentative de réparation de la session:', repairError);
        }
    }

    return false; // Pas de reconnexion nécessaire
}

// Fonction pour réparer les sessions WhatsApp
async function repairWhatsAppSession() {
    console.log('Tentative de réparation de la session WhatsApp...');

    try {
        // Vérifier si le dossier d'authentification existe
        if (fs.existsSync(AUTH_FOLDER)) {
            // Créer un dossier de sauvegarde
            const backupFolder = `${AUTH_FOLDER}_backup_${Date.now()}`;
            fs.mkdirSync(backupFolder, { recursive: true });

            // Copier tous les fichiers vers le dossier de sauvegarde
            const files = fs.readdirSync(AUTH_FOLDER);
            for (const file of files) {
                const srcPath = path.join(AUTH_FOLDER, file);
                const destPath = path.join(backupFolder, file);
                fs.copyFileSync(srcPath, destPath);
            }

            console.log(`Session sauvegardée dans ${backupFolder}`);

            // Supprimer les fichiers problématiques
            const problematicFiles = files.filter(file =>
                file.includes('session') ||
                file.includes('app-state') ||
                file.includes('pre-key')
            );

            for (const file of problematicFiles) {
                fs.unlinkSync(path.join(AUTH_FOLDER, file));
                console.log(`Fichier supprimé: ${file}`);
            }

            console.log('Réparation terminée, redémarrage du bot...');
            return true;
        } else {
            console.log('Dossier d\'authentification non trouvé, création...');
            fs.mkdirSync(AUTH_FOLDER, { recursive: true });
            return true;
        }
    } catch (error) {
        console.error('Erreur lors de la réparation de la session:', error);
        return false;
    }
}

// Fonction principale pour démarrer le bot WhatsApp
async function startWhatsAppBot() {
    try {
        // Initialiser la base de données
        await getDatabase();

        // Charger l'état d'authentification
        const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);

        // Créer une connexion WhatsApp avec des options compatibles
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: true,
            browser: ['WhatsApp Desktop', 'Desktop', '10.0.0'],
            syncFullHistory: false,
            markOnlineOnConnect: false,
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
            emitOwnEvents: false,
            fireInitQueries: false,
            patchMessageBeforeSending: (message) => message,
            getMessage: async () => undefined,
            // Options supplémentaires pour améliorer la stabilité
            retryRequestDelayMs: 2000,
            maxRetries: 5
            // Suppression de l'option logger qui cause des problèmes
        });

        // Gérer les mises à jour des informations d'identification
        sock.ev.on('creds.update', saveCreds);

        // Gérer les connexions/déconnexions
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                // QR code reçu, afficher dans la console
                console.log('Nouveau QR code reçu. Veuillez le scanner avec votre téléphone.');
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const errorMessage = lastDisconnect?.error?.message || 'Raison inconnue';
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                console.log('Connexion fermée en raison de:', errorMessage);
                console.log('Code de statut:', statusCode);

                // Vérifier si l'erreur est liée à une session corrompue
                const isSessionError = errorMessage.includes('No sessions') ||
                                      errorMessage.includes('bad decrypt') ||
                                      errorMessage.includes('invalid key') ||
                                      errorMessage.includes('session not found');

                if (shouldReconnect) {
                    if (isSessionError) {
                        console.log('Erreur de session détectée, tentative de réparation...');
                        const repaired = await repairWhatsAppSession();

                        if (repaired) {
                            console.log('Session réparée, redémarrage du bot...');
                            setTimeout(() => {
                                console.log('Reconnexion après réparation...');
                                startWhatsAppBot();
                            }, 3000);
                        } else {
                            console.log('Échec de la réparation, tentative de reconnexion standard...');
                            setTimeout(() => {
                                console.log('Reconnexion...');
                                startWhatsAppBot();
                            }, 5000);
                        }
                    } else {
                        console.log('Tentative de reconnexion dans 5 secondes...');
                        // Attendre 5 secondes avant de se reconnecter pour éviter les boucles de reconnexion trop rapides
                        setTimeout(() => {
                            console.log('Reconnexion...');
                            startWhatsAppBot();
                        }, 5000);
                    }
                } else {
                    console.log('Déconnecté définitivement. Veuillez supprimer le dossier d\'authentification et redémarrer le bot.');
                }
            } else if (connection === 'open') {
                console.log(`${BOT_NAME} est connecté!`);
                console.log('En attente de messages...');
                console.log(`Le bot répondra aux messages après un délai de ${BOT_RESPONSE_DELAY/60000} minutes si vous n'y avez pas répondu.`);

                // Configurer un intervalle pour vérifier les messages en attente
                // Utiliser une variable globale pour pouvoir arrêter l'intervalle en cas de déconnexion
                if (global.messageCheckInterval) {
                    clearInterval(global.messageCheckInterval);
                }
                global.messageCheckInterval = setInterval(() => {
                    // Vérifier si la connexion est toujours active avant de traiter les messages
                    if (sock.user) {
                        processUnansweredMessages(sock).catch(err => {
                            console.error('Erreur lors du traitement des messages en attente:', err);
                        });
                    } else {
                        console.log('Connexion perdue, arrêt du traitement des messages');
                        clearInterval(global.messageCheckInterval);
                    }
                }, 30000); // Vérifier toutes les 30 secondes
            }
        });

        // Gérer les messages
        sock.ev.on('messages.upsert', async ({ messages }) => {
            for (const message of messages) {
                try {
                    // Ignorer les messages de statut et les messages vides
                    if (message.key.remoteJid === 'status@broadcast' || !message.message) {
                        continue;
                    }

                    // Extraire le contenu du message
                    const messageContent = message.message.conversation ||
                                          (message.message.extendedTextMessage && message.message.extendedTextMessage.text) ||
                                          '';

                    if (!messageContent.trim()) {
                        continue;
                    }

                    // Obtenir l'ID du contact
                    const contactId = message.key.remoteJid;

                    // Vérifier si c'est un message de soi-même
                    const isFromMe = message.key.fromMe;

                    console.log('----------------------------------------');
                    console.log(`Message reçu: ${messageContent}`);
                    console.log(`De: ${contactId}`);
                    console.log(`Est de moi: ${isFromMe}`);

                    // Vérifier si c'est un message de groupe
                    const isGroupMessage = contactId.endsWith('@g.us');

                    // Vérifier si le bot peut traiter les messages de groupe
                    if (isGroupMessage && !canHandleGroupChat(CONFIG)) {
                        console.log('Message de groupe ignoré (fonctionnalité non activée)');
                        continue;
                    }

                    // Vérifier si le bot est en horaires d'ouverture
                    if (!isFromMe && isFeatureEnabled(CONFIG, 'businessHours') && !isWithinBusinessHours(CONFIG)) {
                        console.log('Message reçu en dehors des horaires d\'ouverture');
                        // Optionnel : envoyer un message automatique indiquant les horaires d'ouverture
                        continue;
                    }

                    // Si ce n'est pas un message de soi-même, mettre à jour le profil du contact
                    if (!isFromMe) {
                        // Vérifier si la fonctionnalité de profils de contacts est activée
                        if (isFeatureEnabled(CONFIG, 'contactProfiles')) {
                            try {
                                // Essayer d'obtenir le nom du contact depuis le message si disponible
                                let contactName = null;
                                if (message.pushName) {
                                    contactName = message.pushName;
                                }

                                // Mettre à jour le profil avec le nouveau message
                                const timestamp = Date.now();
                                const updatedProfile = updateProfile(contactId, messageContent, timestamp);
                                console.log(`Profil de ${contactId} mis à jour avec le nouveau message`);

                                // Si c'est un nouveau contact, définir son nom
                                if (updatedProfile && updatedProfile.name === contactId.split('@')[0] && contactName) {
                                    updatedProfile.name = contactName;
                                    if (typeof saveContactProfile === 'function') {
                                        saveContactProfile(contactId, updatedProfile);
                                        console.log(`Nom du contact mis à jour: ${contactName}`);
                                    } else {
                                        console.error('Fonction saveContactProfile non disponible');
                                    }
                                }
                            } catch (error) {
                                console.error('Erreur lors de la mise à jour du profil du contact:', error);
                            }
                        }

                        // Envoyer un webhook si la fonctionnalité est activée
                        if (shouldSendWebhook(CONFIG, 'message')) {
                            console.log('Envoi d\'un webhook pour le message reçu');
                            // Implémentation de l'envoi du webhook à faire
                        }
                    }

                    // Enregistrer le message dans la base de données
                    await saveMessage(message, messageContent);

                    // Si c'est un message de l'utilisateur (fromMe), vérifier s'il répond à un message
                    // et marquer ce message comme ayant reçu une réponse
                    if (isFromMe && message.message.extendedTextMessage && message.message.extendedTextMessage.contextInfo) {
                        const quotedMessageId = message.message.extendedTextMessage.contextInfo.stanzaId;
                        if (quotedMessageId) {
                            await saveResponse(quotedMessageId, message);
                            console.log(`Message ${quotedMessageId} marqué comme ayant reçu une réponse de l'utilisateur`);
                        }
                    }

                    // Si ce n'est pas un message de l'utilisateur, ne pas répondre immédiatement
                    // Le message sera traité par l'intervalle après le délai configuré
                    if (!isFromMe) {
                        console.log(`Message enregistré, réponse programmée dans ${BOT_RESPONSE_DELAY/60000} minutes si aucune réponse de l'utilisateur`);
                    }

                } catch (error) {
                    console.error('Erreur lors du traitement du message:', error);

                    // Vérifier si l'erreur est liée à une session corrompue
                    if (error.message && (
                        error.message.includes('No sessions') ||
                        error.message.includes('bad decrypt') ||
                        error.message.includes('invalid key') ||
                        error.message.includes('session not found') ||
                        error.name === 'SessionError' ||
                        error.name === 'PreKeyError'
                    )) {
                        console.log('Erreur de session détectée lors du traitement du message, tentative de réparation...');
                        // Nous ne réparons pas immédiatement pour éviter d'interrompre le traitement des autres messages
                        // La réparation sera effectuée lors de la prochaine tentative de reconnexion
                    }
                }
            }
        });
    } catch (error) {
        console.error('Erreur lors du démarrage du bot:', error);
        throw error;
    }
}

// Démarrer le bot
console.log(`Initialisation de ${BOT_NAME}...`);
startWhatsAppBot().catch(err => {
    console.error('Erreur fatale lors du démarrage:', err);
    process.exit(1);
});
