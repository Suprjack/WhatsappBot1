import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs';
import path from 'path';

// Chemin de la base de données
const DB_PATH = process.env.DB_PATH || './database/messages.db';

// Assurer que le dossier de la base de données existe
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

// Initialiser la base de données
async function initDatabase() {
    try {
        const db = await open({
            filename: DB_PATH,
            driver: sqlite3.Database
        });

        // Créer la table des messages si elle n'existe pas
        await db.exec(`
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                remoteJid TEXT NOT NULL,
                fromMe BOOLEAN NOT NULL,
                content TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                responded BOOLEAN DEFAULT FALSE,
                responseId TEXT,
                responseTimestamp INTEGER
            )
        `);

        console.log('Base de données initialisée avec succès');
        return db;
    } catch (error) {
        console.error('Erreur lors de l\'initialisation de la base de données:', error);
        throw error;
    }
}

// Singleton de la base de données
let dbInstance = null;

// Obtenir l'instance de la base de données
export async function getDatabase() {
    if (!dbInstance) {
        dbInstance = await initDatabase();
    }
    return dbInstance;
}

// Enregistrer un message dans la base de données
export async function saveMessage(message, content) {
    try {
        const db = await getDatabase();
        const timestamp = Date.now();
        
        await db.run(
            `INSERT INTO messages (id, remoteJid, fromMe, content, timestamp) 
             VALUES (?, ?, ?, ?, ?)`,
            [
                message.key.id,
                message.key.remoteJid,
                message.key.fromMe ? 1 : 0,
                content,
                timestamp
            ]
        );
        
        return { id: message.key.id, timestamp };
    } catch (error) {
        console.error('Erreur lors de l\'enregistrement du message:', error);
        return null;
    }
}

// Enregistrer une réponse à un message
export async function saveResponse(originalMessageId, responseMessage) {
    try {
        const db = await getDatabase();
        const timestamp = Date.now();
        
        await db.run(
            `UPDATE messages 
             SET responded = 1, responseId = ?, responseTimestamp = ? 
             WHERE id = ?`,
            [responseMessage.key.id, timestamp, originalMessageId]
        );
        
        return true;
    } catch (error) {
        console.error('Erreur lors de l\'enregistrement de la réponse:', error);
        return false;
    }
}

// Vérifier si un message a déjà reçu une réponse
export async function hasResponse(messageId) {
    try {
        const db = await getDatabase();
        
        const result = await db.get(
            `SELECT responded FROM messages WHERE id = ?`,
            [messageId]
        );
        
        return result && result.responded === 1;
    } catch (error) {
        console.error('Erreur lors de la vérification de la réponse:', error);
        return false;
    }
}

// Obtenir les messages sans réponse plus anciens que X millisecondes
export async function getUnansweredMessages(olderThanMs) {
    try {
        const db = await getDatabase();
        const cutoffTime = Date.now() - olderThanMs;
        
        const messages = await db.all(
            `SELECT * FROM messages 
             WHERE responded = 0 
             AND fromMe = 0
             AND timestamp < ?
             ORDER BY timestamp ASC`,
            [cutoffTime]
        );
        
        return messages;
    } catch (error) {
        console.error('Erreur lors de la récupération des messages sans réponse:', error);
        return [];
    }
}

// Obtenir tous les messages d'un contact
export async function getMessagesByContact(remoteJid, limit = 100) {
    try {
        const db = await getDatabase();
        
        const messages = await db.all(
            `SELECT * FROM messages 
             WHERE remoteJid = ? 
             ORDER BY timestamp DESC 
             LIMIT ?`,
            [remoteJid, limit]
        );
        
        return messages;
    } catch (error) {
        console.error('Erreur lors de la récupération des messages du contact:', error);
        return [];
    }
}
