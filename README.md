# WhatsappBot1

Un bot WhatsApp intelligent qui utilise la bibliothèque Baileys pour se connecter à WhatsApp Web et l'API Gemini pour générer des réponses personnalisées.

## Fonctionnalités

- Connexion à WhatsApp Web via la bibliothèque Baileys
- Génération de réponses avec l'API Gemini 1.5 Flash
- Stockage des messages dans une base de données SQLite
- Délai de réponse configurable (par défaut 5 minutes)
- Gestion des profils de contacts avec personnalisation des réponses
- Historique des conversations par contact
- Adaptation du style de réponse selon la relation avec le contact
- Persistance de l'authentification entre les redémarrages
- Dockerisé pour un déploiement facile

## Prérequis

- Node.js 18+ (pour le développement local)
- Docker et Docker Compose (pour le déploiement)
- Une clé API Gemini (https://ai.google.dev/)

## Configuration

1. Créez un fichier `.env` à la racine du projet avec les variables suivantes :

```
# Configuration de l'API Gemini
GEMINI_API_KEY=votre_clé_api_gemini

# Configuration du bot
BOT_NAME=Nom de votre bot
BOT_RESPONSE_DELAY=300000  # 5 minutes en millisecondes

# Configuration de la base de données
DB_PATH=./database/messages.db
```

## Développement local

1. Installez les dépendances :

```bash
npm install
```

2. Démarrez l'application :

```bash
npm start
```

3. Scannez le code QR qui apparaît dans le terminal avec votre téléphone pour vous connecter à WhatsApp Web.

## Déploiement avec Docker

1. Construisez et démarrez les conteneurs :

```bash
docker-compose up -d
```

2. Consultez les logs pour scanner le code QR :

```bash
docker-compose logs -f
```

3. Scannez le code QR qui apparaît dans les logs avec votre téléphone pour vous connecter à WhatsApp Web.

## Fonctionnement

- Le bot enregistre tous les messages reçus dans une base de données SQLite.
- Lorsqu'un message est reçu d'un contact, le bot attend 5 minutes (configurable) avant de répondre.
- Si vous répondez au message avant ce délai, le bot ne répondra pas.
- Le bot crée automatiquement un profil pour chaque nouveau contact.
- Les réponses sont personnalisées en fonction du profil du contact.
- Vous pouvez consulter l'historique des messages dans la base de données SQLite.

## Gestion des profils de contacts

Les profils de contacts sont stockés dans le fichier `contacts.json`. Chaque profil contient :

- `name` : Nom du contact
- `phone` : Numéro de téléphone (confidentiel, usage interne uniquement)
- `relation` : Type de relation (ami, famille, délire, copine, Inconnu)
- `lang` : Langue préférée
- `tone` : Ton à utiliser
- `history` : Historique des messages
- `first_seen` : Timestamp de la première interaction
- `last_seen` : Timestamp de la dernière interaction

Pour modifier le style des réponses, changez la valeur de `relation` :
- Pour un ton décontracté et amical : "ami", "famille", "délire", "copine"
- Pour un ton formel et professionnel : "Inconnu" ou toute autre valeur

## Licence

Projet privé. Tous droits réservés.
