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
import { getContactProfile, createDefaultProfile, updateProfile } from './contact-manager.js';

dotenv.config();

// Configuration
const BOT_NAME = process.env.BOT_NAME || "Teepana's Alter Ego";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyC8TDu5NBrmk0NNJlhRAlrNYvJ6jwXyU-8';
const AUTH_FOLDER = './auth_baileys';
const BOT_RESPONSE_DELAY = parseInt(process.env.BOT_RESPONSE_DELAY || '300000'); // 5 minutes en millisecondes
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
            ? "Ton décontracté, drôle, émojis permis."
            : "Ton formel, poli, sans émoji (sauf \"🙂\").";

        // Déterminer si on peut proposer un rendez-vous
        const peutProposerRDV = profile.relation !== "Inconnu";

        // Obtenir le dernier message
        const lastMsg = message;

        // Construire le prompt avec le nouveau format
        return `[SYSTEM] Tu es l'assistant WhatsApp de Teepana.
Parle en français, 1 phrase max 40 mots.

[CONTACT] - INFORMATIONS CONFIDENTIELLES - NE JAMAIS MENTIONNER CES DONNÉES DANS TES RÉPONSES
Nom: ${profile.name}
Téléphone: ${profile.phone} - CONFIDENTIEL, NE JAMAIS MENTIONNER CE NUMÉRO
Relation: ${profile.relation}

[STYLE]
${styleSection}

[DISPO] Teepana n'est pas disponible mais je peux gérer ta demande.

[OBJECTIF] Demande en UNE question le but précis de l'appel.
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
        // Récupérer les messages sans réponse plus anciens que le délai configuré
        const unansweredMessages = await getUnansweredMessages(BOT_RESPONSE_DELAY);

        for (const message of unansweredMessages) {
            // Vérifier si le message a déjà reçu une réponse entre-temps
            if (await hasResponse(message.id)) {
                continue;
            }

            console.log(`Traitement du message en attente: ${message.content}`);
            console.log(`De: ${message.remoteJid}`);

            // Créer le prompt pour Gemini avec l'ID du contact
            const prompt = createPrompt(message.content, message.remoteJid, false);

            // Générer une réponse
            const response = await generateGeminiResponse(prompt);
            console.log(`Réponse générée (après délai): ${response}`);

            // Envoyer la réponse
            const sentMessage = await sock.sendMessage(message.remoteJid, { text: response });

            // Enregistrer la réponse dans la base de données
            await saveResponse(message.id, sentMessage);

            console.log(`Réponse envoyée avec succès après ${BOT_RESPONSE_DELAY/60000} minutes`);
        }
    } catch (error) {
        console.error('Erreur lors du traitement des messages en attente:', error);
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
            getMessage: async () => undefined
        });

        // Gérer les mises à jour des informations d'identification
        sock.ev.on('creds.update', saveCreds);

        // Gérer les connexions/déconnexions
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error instanceof Boom) ?
                    lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut : true;

                console.log('Connexion fermée en raison de:', lastDisconnect?.error);

                if (shouldReconnect) {
                    console.log('Reconnexion...');
                    startWhatsAppBot();
                } else {
                    console.log('Déconnecté définitivement.');
                }
            } else if (connection === 'open') {
                console.log(`${BOT_NAME} est connecté!`);
                console.log('En attente de messages...');
                console.log(`Le bot répondra aux messages après un délai de ${BOT_RESPONSE_DELAY/60000} minutes si vous n'y avez pas répondu.`);

                // Configurer un intervalle pour vérifier les messages en attente
                setInterval(() => processUnansweredMessages(sock), 30000); // Vérifier toutes les 30 secondes
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

                    // Si ce n'est pas un message de soi-même et que ce n'est pas un groupe,
                    // mettre à jour le profil du contact avec le nouveau message
                    if (!isFromMe && !contactId.endsWith('@g.us')) {
                        // Essayer d'obtenir le nom du contact depuis le message si disponible
                        let contactName = null;
                        if (message.pushName) {
                            contactName = message.pushName;
                        }

                        // Mettre à jour le profil avec le nouveau message
                        const timestamp = Date.now();
                        const updatedProfile = updateProfile(contactId, messageContent, timestamp);

                        // Si c'est un nouveau contact, définir son nom
                        if (updatedProfile && updatedProfile.name === contactId.split('@')[0] && contactName) {
                            updatedProfile.name = contactName;
                            saveContactProfile(contactId, updatedProfile);
                        }

                        console.log(`Profil du contact mis à jour avec le message: ${messageContent.substring(0, 30)}...`);
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
