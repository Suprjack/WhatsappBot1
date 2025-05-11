FROM node:18-alpine

# Créer le répertoire de l'application
WORKDIR /app

# Installer les dépendances nécessaires pour sqlite3 et crypto
RUN apk add --no-cache python3 make g++ sqlite openssl

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer les dépendances
RUN npm install

# Copier le reste des fichiers de l'application
COPY . .

# Créer les dossiers nécessaires
RUN mkdir -p /app/auth_baileys /app/database

# Exposer le port si nécessaire (pour une future interface web par exemple)
# EXPOSE 3000

# Définir les volumes pour persister les données
VOLUME ["/app/auth_baileys", "/app/database"]

# Commande pour démarrer l'application
CMD ["npm", "start"]
